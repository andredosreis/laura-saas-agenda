import dotenv from 'dotenv-flow';
import cron from 'node-cron';
import connectDB from './config/db.js';
import app from './app.js';

// Importamos APENAS a função que precisamos do controller.
// Isto é uma boa prática que o ES Modules facilita.
import { enviarLembretes24h } from './controllers/agenteController.js';

// Carrega as variáveis de ambiente
dotenv.config();

// Conectar ao banco de dados e, após sucesso, iniciar o servidor
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🖥️  Servidor a rodar na porta ${PORT}`);
  });
}).catch(err => {
  console.error("❌ Falha ao conectar ao MongoDB. O servidor não foi iniciado.", err);
  process.exit(1); // Encerra o processo se a conexão com o BD falhar
});

// Cron job para lembretes de agendamento de 24h
cron.schedule('0 19 * * *', async () => {
  console.log('⏰ CRON: A executar tarefa de lembretes de 24h...');
  try {
    // Como importámos a função diretamente, a chamada fica mais limpa
    await enviarLembretes24h(
      { method: 'CRON' }, // Simula o objeto 'req'
      { // Simula o objeto 'res'
        status: () => ({ 
          json: (response) => console.log('CRON: Resposta da execução ->', response) 
        })
      }
    );
    console.log('✅ CRON: Tarefa de lembretes concluída com sucesso.');
  } catch (error) {
    console.error('❌ CRON: Falha ao executar tarefa de lembrete:', error);
  }
}, {
  timezone: "Europe/Lisbon"
});