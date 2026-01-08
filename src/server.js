// Carrega variáveis de ambiente ANTES de qualquer outro import
import 'dotenv-flow/config';

import cron from 'node-cron';
import connectDB from './config/db.js';
import app from './app.js';
import { sendReminderNotifications } from './controllers/agenteController.js';
import { initEmailService } from './services/emailService.js';

// Conectar ao banco de dados e, após sucesso, iniciar o servidor
connectDB().then(() => {
  // Inicializar serviço de email
  initEmailService();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🖥️  Servidor a rodar na porta ${PORT}`);
  });
}).catch(err => {
  console.error("❌ Falha ao conectar ao MongoDB. O servidor não foi iniciado.", err);
  process.exit(1); // Encerra o processo se a conexão com o BD falhar
});

// ⏰ CRON JOB: Lembretes diários às 19h (Europe/Lisbon)
cron.schedule('0 19 * * *', async () => {
  console.log('⏰ [CRON] Executando lembrete diário de agendamentos...');
  try {
    const resultado = await sendReminderNotifications(
      { method: 'CRON' },
      {
        status: () => ({
          json: (data) => console.log('[CRON] Resultado:', data),
        }),
      }
    );
    console.log('✅ [CRON] Tarefa de lembretes concluída');
  } catch (error) {
    console.error('❌ [CRON] Falha ao executar tarefa:', error);
  }
}, {
  timezone: 'Europe/Lisbon',
});

console.log('⏰ [CRON] Job registado: Lembretes diários às 19h (Europe/Lisbon)');