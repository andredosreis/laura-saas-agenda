require('dotenv-flow').config();
const connectDB = require('./config/db');
const cron = require('node-cron');
const agenteController = require('./controllers/agenteController');
const app = require('./app');

// Conectar ao banco e só depois iniciar o servidor
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🖥️ Servidor rodando na porta ${PORT}`);
  });
});

// Cron job para lembretes
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