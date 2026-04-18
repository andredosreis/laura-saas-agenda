import { Worker } from 'bullmq';
import { DateTime } from 'luxon';
import { getRedisConnection } from '../queues/redisConnection.js';
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';
import Agendamento from '../models/Agendamento.js';
import Tenant from '../models/Tenant.js';
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
  const { tipo, clienteTelefone, clienteNome, agendamentoId, tenantId } = job.data;

  if (!clienteTelefone) {
    logger.warn({ jobId: job.id, tipo }, '[Worker] Sem telefone — job ignorado');
    return;
  }

  // Lógica especial para lembrete de 1h: verifica estado da confirmação
  if (tipo === 'lembrete-1h') {
    const agendamento = await Agendamento.findById(agendamentoId).lean();

    if (!agendamento) {
      logger.warn({ jobId: job.id, agendamentoId }, '[Worker] Agendamento não encontrado — job ignorado');
      return;
    }

    // Se o cliente cancelou, não envia nenhuma mensagem
    if (agendamento.confirmacao?.tipo === 'rejeitado' || agendamento.status === 'Cancelado Pelo Cliente') {
      logger.info({ jobId: job.id, agendamentoId }, '[Worker] Agendamento cancelado — lembrete 1h ignorado');
      return;
    }

    // Envia lembrete ao cliente
    const mensagem = buildMensagem(job);
    const resultado = await sendWhatsAppMessage(clienteTelefone, mensagem);
    if (!resultado.success) {
      throw new Error(`Falha ao enviar lembrete 1h para ${clienteNome}: ${JSON.stringify(resultado.error)}`);
    }

    // Se confirmação ainda pendente, alerta o admin
    if (agendamento.confirmacao?.tipo === 'pendente') {
      const tenant = await Tenant.findById(tenantId).lean();
      const numeroAdmin = tenant?.whatsapp?.numeroWhatsapp || tenant?.contato?.telefone;

      if (numeroAdmin) {
        const dt = DateTime.fromISO(job.data.dataHora, { zone: ZONA });
        const alertaAdmin = `⚠️ *Confirmação Pendente*\n\n${clienteNome} ainda não confirmou o agendamento das *${dt.toFormat('HH:mm')}* de hoje.\n\nPode querer entrar em contacto.`;
        await sendWhatsAppMessage(numeroAdmin, alertaAdmin);
        logger.info({ jobId: job.id, clienteNome }, '[Worker] Alerta de pendente enviado ao admin');
      } else {
        logger.warn({ jobId: job.id, tenantId }, '[Worker] Número do admin não configurado — alerta não enviado');
      }
    }

    logger.info({ jobId: job.id, tipo, clienteNome }, '[Worker] Notificação enviada');
    return;
  }

  // Todos os outros tipos (confirmacao, lembrete-antecipado)
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
