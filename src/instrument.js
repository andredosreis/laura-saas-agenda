// Inicialização do Sentry — DEVE ser carregado antes de qualquer outro módulo.
// Sentry @sentry/node v8+ depende de OpenTelemetry, que precisa de instrumentar
// os módulos ao serem carregados. Por isso este ficheiro é importado via
// `node --import ./src/instrument.js src/server.js` ou via `import` no topo do server.
import 'dotenv-flow/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Sampling conservador — 10% de traces em prod para controlar custo no free tier.
    // Erros (Sentry.captureException) são sempre enviados.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Ignorar erros esperados que não são bugs (credenciais inválidas, token expirado, etc.)
    ignoreErrors: [
      /Token expirado/i,
      /Token inválido/i,
      /Credenciais inválidas/i,
      /Cliente não encontrado/i,
      /Agendamento não encontrado/i,
    ],
    beforeSend(event, hint) {
      // Anexa contexto multi-tenant ao erro (se disponível via scope/request)
      if (hint?.originalException?.tenantId) {
        event.tags = { ...event.tags, tenantId: hint.originalException.tenantId };
      }
      return event;
    },
  });
  // Log directo em stderr: logger ainda não foi importado neste ficheiro
  console.log(`[Sentry] Inicializado (env=${process.env.NODE_ENV || 'development'})`);
} else {
  console.log('[Sentry] SENTRY_DSN não definido — error tracking desactivado (graceful degrade)');
}
