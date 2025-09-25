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

const app = express();

// --- Configuração do CORS ---
const whiteList = ['https://laura-saas-agenda-mfqt.vercel.app'];
const corsOptions = {
  origin: (origin, callback) => {
    // Permite requisições sem 'origin' (ex: Postman, apps mobile) ou da sua whitelist
    if (!origin || whiteList.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
// Em ambiente de desenvolvimento, podemos ser menos restritos
if (process.env.NODE_ENV === 'development') {
  app.use(cors());
} else {
  app.use(cors(corsOptions));
}
// --- Fim da Configuração do CORS ---

// Middlewares globais
app.use(express.json()); // para parsear JSON
app.use(morgan('dev')); // para logs de requisição
app.use(requestLogger);

// Endpoints da API
app.use('/api/clientes', clienteRoutes);
app.use('/api/pacotes', pacoteRoutes);
app.use('/api/agendamentos', agendamentoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/agente', agenteRoutes);
app.use('/api/schedules', scheduleRoutes);

// Rota principal do webhook para Z-API (se aplicável)
app.use('/webhook', whatsappRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.send('🚀 API Laura SaaS a funcionar!');
});

// Middleware de tratamento de erros (deve ser o último)
app.use(errorHandler);

// A correção principal: usar "export default"
export default app;