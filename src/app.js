const express = require('express');
const cors = require('cors');
require('dotenv-flow').config();
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
// ===============================
// CORS: Desenvolvimento x Produção
// ===============================

// Em desenvolvimento (libera geral):
app.use(cors());

// Em produção, use assim:
 app.use(cors({
  origin: ['https://laura-saas-agenda-mfqt.vercel.app'],
  credentials: true,
 }));

// ===============================

// Middlewares globais
app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(errorHandler);

// Rotas da API
app.use('/api/clientes', require('./routes/clienteRoutes'));
app.use('/api/pacotes', require('./routes/pacoteRoutes'));
app.use('/api/agendamentos', require('./routes/agendamentoRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/agente', require('./routes/agenteRoutes'));
app.use('/api/webhook', require('./routes/webhook'));
// app.use('/api/financeiro', require('./routes/financeiroRoutes')); // descomente se/quando usar

// Rota de teste/saúde
app.get('/', (req, res) => {
  res.send('🚀 API Laura SaaS funcionando!');
});

module.exports = app;