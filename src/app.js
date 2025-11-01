import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import morgan from 'morgan';

// Carrega as variáveis de ambiente
dotenv.config();

// Middlewares
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

const app = express();

// Middlewares globais (ANTES do CORS para webhooks funcionarem)
app.use(express.json()); // para parsear JSON
app.use(morgan('dev')); // para logs de requisição
app.use(requestLogger);

// --- Configuração do CORS ---
// IMPORTANTE: Permite requisições sem origin (webhooks, Postman, etc) E da whitelist
const whiteList = ['https://laura-saas-agenda-mfqt.vercel.app'];

if (process.env.NODE_ENV === 'development') {
  app.use(cors()); // Desenvolvimento: permite tudo
} else {
  app.use(cors({
    origin: (origin, callback) => {
      // Permite se: sem origin (webhooks/Postman) OU está na whitelist
      if (!origin || whiteList.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }));
}
// --- Fim da Configuração do CORS ---

// Endpoints da API
app.use('/api/clientes', clienteRoutes);
app.use('/api/pacotes', pacoteRoutes);
app.use('/api/agendamentos', agendamentoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/agente', agenteRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);

// Webhook Z-API para confirmações de agendamento
app.use('/webhook', webhookRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.send('🚀 API Laura SaaS a funcionar!');
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

// A correção principal: usar "export default"
export default app;