import { Worker } from 'bullmq';
import { DateTime } from 'luxon';
import { getRedisConnection } from '../queues/redisConnection.js';
import { sendWhatsAppMessage } from '../utils/zapi_client.js';
import logger from '../utils/logger.js';

const ZONA = 'Europe/Lisbon';

function buildMensagem(job) {
  const { tipo, clienteNome, dataHora, diasAntes } = job.data;
  const dt = DateTime.fromISO(dataHora, { zone: ZONA });
  const dataFormatada = dt.toFormat('dd/MM/yyyy');
  const horaFormatada = dt.toFormat('HH:mm');

  if (tipo === 'confirmacao') {
    return `✅ *Agendamento Confirmado!*\n\nOlá ${clienteNome}!\n\nO seu agendamento foi marcado com sucesso:\n📅 Data: ${dataFormatada}\n🕐 Horário: ${horaFormatada}\n\nAté breve! 💆‍♀️✨\n\n_Marcai_`;
  }

  if (tipo === 'lembrete-antecipado') {
    const quando = diasAntes === 1 ? 'AMANHÃ' : `daqui a ${diasAntes} dias`;
    return `🔔 *Lembrete de Agendamento*\n\nOlá ${clienteNome}!\n\nLembramos que tem uma sessão marcada para *${quando}*:\n📅 Data: ${dataFormatada}\n🕐 Horário: ${horaFormatada}\n\nAté breve! 💆‍♀️✨\n\n_Marcai_`;
  }

  if (tipo === 'lembrete-1h') {
    return `⏰ *Sessão em 1 hora!*\n\nOlá ${clienteNome}!\n\nA sua sessão começa às ${horaFormatada} de hoje!\n\nEstamos à sua espera! 💆‍♀️✨\n\n_Marcai_`;
  }

  return null;
}

async function processJob(job) {
  const { tipo, clienteTelefone, clienteNome } = job.data;

  if (!clienteTelefone) {
    logger.warn({ jobId: job.id, tipo }, '[Worker] Sem telefone — job ignorado');
    return;
  }

  const mensagem = buildMensagem(job);
  if (!mensagem) {
    logger.warn({ jobId: job.id, tipo }, '[Worker] Tipo de job desconhecido');
    return;
  }

  const resultado = await sendWhatsAppMessage(clienteTelefone, mensagem);

  if (!resultado.success) {
    throw new Error(`Falha ao enviar WhatsApp para ${clienteNome}: ${JSON.stringify(resultado.error)}`);
  }

  logger.info({ jobId: job.id, tipo, clienteNome }, '[Worker] Notificação enviada');
}

export function startNotificationWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    logger.warn('[Worker] Redis não configurado — worker de notificações não iniciado');
    return null;
  }

  const worker = new Worker('notifications', processJob, {
    connection,
    concurrency: 5,
  });

  worker.on('completed', (job) =>
    logger.info({ jobId: job.id }, '[Worker] Job concluído')
  );
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, '[Worker] Job falhado')
  );

  logger.info('[Worker] Worker de notificações iniciado');
  return worker;
}
