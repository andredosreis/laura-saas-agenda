// Carrega variáveis de ambiente ANTES de qualquer outro import
import 'dotenv-flow/config';

import connectDB from './config/db.js';
import app from './app.js';
import logger from './utils/logger.js';
import { initEmailService } from './services/emailService.js';
import { startNotificationWorker } from './workers/notificationWorker.js';

// Conectar ao banco de dados e, após sucesso, iniciar o servidor
connectDB().then(() => {
  initEmailService();
  startNotificationWorker();

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Servidor a rodar');
  });

  const shutdown = () => {
    logger.info('Sinal de encerramento recebido. A fechar conexões...');
    server.close(() => {
      import('mongoose').then(({ default: mongoose }) => {
        mongoose.connection.close().then(() => {
          logger.info('Servidor encerrado.');
          process.exit(0);
        });
      });
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch(err => {
  logger.error({ err }, 'Falha ao conectar ao MongoDB. O servidor não foi iniciado.');
  process.exit(1);
});