// Carrega variáveis de ambiente ANTES de qualquer outro import
import 'dotenv-flow/config';

import cron from 'node-cron';
import connectDB from './config/db.js';
import app from './app.js';
import logger from './utils/logger.js';
import { sendReminderNotifications } from './controllers/agenteController.js';
import { initEmailService } from './services/emailService.js';

// Conectar ao banco de dados e, após sucesso, iniciar o servidor
connectDB().then(() => {
  // Inicializar serviço de email
  initEmailService();

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Servidor a rodar');
  });
}).catch(err => {
  logger.error({ err }, 'Falha ao conectar ao MongoDB. O servidor não foi iniciado.');
  process.exit(1); // Encerra o processo se a conexão com o BD falhar
});

// ⏰ CRON JOB: Lembretes diários às 19h (Europe/Lisbon)
cron.schedule('0 19 * * *', async () => {
  logger.info('[CRON] Executando lembrete diário de agendamentos...');
  try {
    await sendReminderNotifications(
      { method: 'CRON' },
      {
        status: () => ({
          json: (data) => logger.info({ data }, '[CRON] Resultado'),
        }),
      }
    );
    logger.info('[CRON] Tarefa de lembretes concluída');
  } catch (error) {
    logger.error({ err: error }, '[CRON] Falha ao executar tarefa');
  }
}, {
  timezone: 'Europe/Lisbon',
});

logger.info('[CRON] Job registado: Lembretes diários às 19h (Europe/Lisbon)');