require('dotenv-flow').config();
const express = require('express');
const connectDB = require('./config/db');
const cors = require('cors');
const cron = require('node-cron');
const logger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const validateObjectId = require('./middlewares/validateObjectId');
const agenteController = require('./controllers/agenteController');

// Configuração do servidor Express
const app = express();
app.use(cors({
  origin: ['https://laura-saas-agenda-mfqt.vercel.app'],
  credentials: true,
}));



// Middleware
app.use(express.json());
//app.use(cors());
app.use(logger);
app.use(errorHandler);

// Routes
app.use('/api/clientes', require('./routes/clienteRoutes'));
app.use('/api/pacotes', require('./routes/pacoteRoutes'));
app.use('/api/agendamentos', require('./routes/agendamentoRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'))
//app.use('/api/financeiro', require('./routes/financeiroRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
//server agent ia
app.use('/api/agente', require('./routes/agenteRoutes'));


// Routes test
app.get ('/' , (req, res) => {
    res.send('🚀 API Laura SaaS funcionando!');
});

// Connect to MongoDB
// Conectar ao banco e só depois iniciar o servidor
  connectDB().then(() => {
    
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🖥️ Servidor rodando na porta ${PORT}`);
  });
});



// Configurar cron para enviar lembretes todos os dias às 19h (hora de Lisboa)
cron.schedule('0 19 * * *', async () => {
  console.log('⏰ CRON: Executando lembretes de 24h...');
  try {
    await agenteController.enviarLembretes24h({ method: 'CRON' }, {
      status: () => ({ json: console.log }) // simula res.json
    });
  } catch (error) {
    console.error('CRON: Falha ao executar tarefa de lembrete:', error);
  }
}, {
  timezone: "Europe/Lisbon"
});
