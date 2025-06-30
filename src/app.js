const express = require('express');
const cors = require('cors');
require('dotenv-flow').config();
const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const whatsappRoutes = require('./routes/whatsappRoutes');

const app = express();

// ===============================
// CORS: Desenvolvimento x Produção
// ===============================
app.use(cors()); // Em desenvolvimento, libera geral

// Em produção, use assim (ajuste o domínio conforme necessário):
 app.use(cors({
   origin: ['https://laura-saas-agenda-mfqt.vercel.app'],
  credentials: true,
 }));

// ===============================

// Middlewares globais
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
// app.use('/api/webhook', require('./routes/webhook')); // Só use se realmente precisar dessa rota

// Rota principal do webhook para Z-API
app.use('/webhook', whatsappRoutes);

// app.use('/api/financeiro', require('./routes/financeiroRoutes')); // descomente se/quando usar

// Rota de teste/saúde
app.get('/', (req, res) => {
  res.send('🚀 API Laura SaaS funcionando!');
});

module.exports = app;