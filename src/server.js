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
connectDB().then(() => {
  initEmailService();
  startNotificationWorker();
  startLembreteParcelaCron();

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
  logger.error({ err }, 'Falha ao conectar ao MongoDB. O servidor não foi iniciado.');
  process.exit(1);
});