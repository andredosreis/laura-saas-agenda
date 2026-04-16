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
import clienteRoutes from './routes/clienteRoutes.js';
import pacoteRoutes from './routes/pacoteRoutes.js';
import agendamentoRoutes from './routes/agendamentoRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import agenteRoutes from './routes/agenteRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import authRoutes from './routes/authRoutes.js'; // 🆕 Autenticação
import financeiroRoutes from './routes/financeiroRoutes.js'; // Added from snippet
import migrationRoutes from './routes/migrationRoutes.js'; // 🆕 Rota de Migração
import transacaoRoutes from './routes/transacaoRoutes.js'; // 💰 FASE 3: Transações
import compraPacoteRoutes from './routes/compraPacoteRoutes.js'; // 💰 FASE 3: Compra de Pacotes
import pagamentoRoutes from './routes/pagamentoRoutes.js'; // 💰 FASE 3: Pagamentos
import caixaRoutes from './routes/caixaRoutes.js'; // 💰 FASE 3: Controle de Caixa
import historicoAtendimentoRoutes from './routes/historicoAtendimentoRoutes.js'; // 📋 FASE 4: Histórico de Atendimentos

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

// Endpoints da API
app.use('/api/auth', authRoutes); // 🆕 Autenticação (público)
app.use('/api/clientes', clienteRoutes);
app.use('/api/pacotes', pacoteRoutes);
app.use('/api/agendamentos', agendamentoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/agente', agenteRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/migration', migrationRoutes);

// 💰 FASE 3: Rotas do Sistema Financeiro
app.use('/api/transacoes', transacaoRoutes);
app.use('/api/compras-pacotes', compraPacoteRoutes);
app.use('/api/pagamentos', pagamentoRoutes);
app.use('/api/caixa', caixaRoutes);

// 📋 FASE 4: Histórico de Atendimentos
app.use('/api/historico-atendimentos', historicoAtendimentoRoutes);

// Webhook Z-API para confirmações de agendamento
app.use('/webhook', webhookRoutes);

// Health check endpoint (para Vercel e monitoramento)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rota de teste
app.get('/', (req, res) => {
  res.send('🚀 API Laura SaaS a funcionar!');
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

// A correção principal: usar "export default"
export default app;