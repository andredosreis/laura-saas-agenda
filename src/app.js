import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv-flow';
import morgan from 'morgan';

// Carrega as variáveis de ambiente
dotenv.config();

// Middlewares
import logger from './utils/logger.js';
import requestLogger from './middlewares/requestLogger.js';
import errorHandler from './middlewares/errorHandler.js';

// Rotas
import clienteRoutes from './modules/clientes/clienteRoutes.js';
import pacoteRoutes from './modules/financeiro/pacoteRoutes.js';
import agendamentoRoutes from './modules/agendamento/agendamentoRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import whatsappRoutes from './modules/ia/whatsappRoutes.js';
import agenteRoutes from './modules/ia/agenteRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import notificationRoutes from './modules/notificacoes/notificationRoutes.js';
import webhookRoutes from './modules/ia/webhookRoutes.js';
import authRoutes from './modules/auth/authRoutes.js'; // 🆕 Autenticação — migrado para src/modules/auth/ (ADR-011)
import financeiroRoutes from './modules/financeiro/financeiroRoutes.js';
import migrationRoutes from './routes/migrationRoutes.js'; // 🆕 Rota de Migração
import transacaoRoutes from './modules/financeiro/transacaoRoutes.js';
import compraPacoteRoutes from './modules/financeiro/compraPacoteRoutes.js';
import pagamentoRoutes from './modules/financeiro/pagamentoRoutes.js';
import caixaRoutes from './modules/financeiro/caixaRoutes.js';
import historicoAtendimentoRoutes from './modules/historico/historicoAtendimentoRoutes.js';
import usersRoutes from './modules/users/usersRoutes.js';

const app = express();

// Necessário para rate limiting funcionar correctamente atrás de proxy (Render, Vercel)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Middlewares globais (ANTES do CORS para webhooks funcionarem)
app.use(express.json({ limit: '10kb' })); // limitar payload para prevenir DoS
app.use(morgan('dev')); // para logs de requisição
app.use(requestLogger);

// --- Configuração do CORS ---
// IMPORTANTE: Permite requisições sem origin (webhooks, Postman, etc) E da whitelist
const whiteList = [
  'https://laura-saas-agenda-mfqt.vercel.app', // Frontend Vercel
  'https://api.z-api.io'                        // Webhook Z-API
];

logger.info({ NODE_ENV: process.env.NODE_ENV }, '[APP] Ambiente detectado');

if (process.env.NODE_ENV === 'development') {
  logger.info('[APP] Modo DESENVOLVIMENTO - CORS liberado para todos');
  app.use(cors()); // Desenvolvimento: permite tudo
} else {
  logger.info('[APP] Modo PRODUÇÃO - CORS restrito');
  app.use(cors({
    origin: (origin, callback) => {
      // Permite se: sem origin (webhooks/Postman) OU está na whitelist
      if (!origin || whiteList.includes(origin)) {
        logger.debug({ origin }, '[CORS] Permitido');
        callback(null, true);
      } else {
        logger.warn({ origin }, '[CORS] Rejeitado');
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));
}
// --- Fim da Configuração do CORS ---

// Endpoints da API — dual-mount: /api/* (legacy) + /api/v1/* (versionado)
// O prefixo /api/v1/ é a nova API canónica. /api/* permanece como alias legacy
// para não quebrar clientes existentes. Frontend migra via VITE_API_URL quando pronto.
const apiResources = [
  ['/auth', authRoutes],
  ['/clientes', clienteRoutes],
  ['/pacotes', pacoteRoutes],
  ['/agendamentos', agendamentoRoutes],
  ['/dashboard', dashboardRoutes],
  ['/analytics', analyticsRoutes],
  ['/whatsapp', whatsappRoutes],
  ['/agente', agenteRoutes],
  ['/schedules', scheduleRoutes],
  ['/notifications', notificationRoutes],
  ['/financeiro', financeiroRoutes],
  ['/migration', migrationRoutes],
  ['/transacoes', transacaoRoutes],
  ['/compras-pacotes', compraPacoteRoutes],
  ['/pagamentos', pagamentoRoutes],
  ['/caixa', caixaRoutes],
  ['/historico-atendimentos', historicoAtendimentoRoutes],
  ['/users', usersRoutes],
];

for (const [path, router] of apiResources) {
  app.use(`/api${path}`, router);
  app.use(`/api/v1${path}`, router);
}

// Webhook Evolution API — limite maior para payloads com dados binários de grupos
app.use('/webhook', express.json({ limit: '1mb' }), webhookRoutes);

// Health check endpoint (para Vercel e monitoramento)
const healthHandler = (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
};
app.get('/api/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// Rota de teste
app.get('/', (req, res) => {
  res.send('🚀 API Laura SaaS a funcionar!');
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

// A correção principal: usar "export default"
export default app;