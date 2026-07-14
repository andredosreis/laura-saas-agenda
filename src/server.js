// Inicialização Sentry (+ dotenv-flow) ANTES de qualquer outro import.
// Sentry v8+ usa OpenTelemetry que instrumenta módulos em tempo de load.
import './instrument.js';

import * as Sentry from '@sentry/node';
import connectDB from './config/db.js';
import app from './app.js';
import logger from './utils/logger.js';
import { initEmailService } from './services/emailService.js';
import { startNotificationWorker } from './workers/notificationWorker.js';
import { startLembreteParcelaCron } from './jobs/lembreteParcelaJob.js';
import { startEvolutionHealthCron } from './jobs/evolutionHealthJob.js';
// Gate 4b (ADR-024): getTenantDBAdmin.js é admin-only (no-restricted-imports). A
// EXCEÇÃO aqui é deliberada e restrita: importamos apenas verifyTenantROEnforcement
// — a auto-verificação de arranque que PROVA que a credencial RO é read-only. Não
// lê dados de tenant; server.js é o ponto de wiring sancionado (F14).
// eslint-disable-next-line no-restricted-imports
import { verifyTenantROEnforcement } from './modules/admin/getTenantDBAdmin.js';

// Validação fail-fast de env vars críticas — sem secrets o servidor não arranca.
// Nunca usar fallbacks hardcoded para JWT (vulnerabilidade crítica).
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  logger.fatal({ missingEnv }, 'Variáveis de ambiente obrigatórias em falta. Startup abortado.');
  process.exit(1);
}

// Handlers globais para erros não tratados — enviados ao Sentry + log fatal
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — processo vai terminar');
  Sentry.captureException(err);
  Sentry.flush(2000).finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  Sentry.captureException(reason);
});

// Conectar ao banco de dados e, após sucesso, iniciar o servidor
connectDB().then(async () => {
  await initEmailService();
  startNotificationWorker();
  startLembreteParcelaCron();
  startEvolutionHealthCron();

  // Gate 4b (F14): prova em runtime que a credencial do painel super-admin é
  // read-only. AGUARDA a verificação antes de aceitar pedidos — fecha a janela em
  // que uma credencial comprometida ainda não foi detectada — MAS com tecto de
  // tempo: se a conexão RO estiver lenta/inacessível NÃO bloqueia o arranque além
  // de VERIFY_BOOT_TIMEOUT_MS (fail-closed mas NUNCA fatal; a verificação segue em
  // background e marca roCompromised se preciso). Só corre com o URI RO definido.
  if (process.env.MONGO_TENANT_RO_URI && process.env.NODE_ENV !== 'test') {
    const VERIFY_BOOT_TIMEOUT_MS = 5000;
    const bootCap = new Promise((resolve) => {
      const t = setTimeout(resolve, VERIFY_BOOT_TIMEOUT_MS);
      t.unref?.();
    });
    await Promise.race([
      verifyTenantROEnforcement().catch((err) => {
        logger.warn({ err }, 'Gate 4b: verificação RO falhou inesperadamente (não bloqueia o arranque)');
        Sentry.captureException(err);
      }),
      bootCap,
    ]);
  }

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Servidor a rodar');
  });

  const shutdown = () => {
    logger.info('Sinal de encerramento recebido. A fechar conexões...');
    server.close(() => {
      import('mongoose').then(({ default: mongoose }) => {
        mongoose.connection.close().then(() => {
          logger.info('Servidor encerrado.');
          process.exit(0);
        });
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch(err => {
  logger.fatal({ err }, 'Falha no startup do servidor (MongoDB ou serviços críticos). Processo vai terminar.');
  Sentry.captureException(err);
  Sentry.flush(2000).finally(() => process.exit(1));
});