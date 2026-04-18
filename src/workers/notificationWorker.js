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
    return `⏰ *Sessão em 1 hora!*\n\nOlá ${clienteNome}!\n\nA sua sessão começa às *${horaFormatada}* de hoje.\n\nEstá confirmada? Por favor responda:\n✅ *SIM* — confirmar\n❌ *NÃO* — cancelar\n\n_Marcai_`;
  }

  return null;
}

async function processJob(job) {
  const { tipo, clienteTelefone, clienteNome, agendamentoId, tenantId } = job.data;

  // Lógica especial para lembrete de 1h: verifica estado da confirmação
  if (tipo === 'lembrete-1h') {
    if (!clienteTelefone) {
      logger.warn({ jobId: job.id, tipo }, '[Worker] Sem telefone — job ignorado');
      return;
    }
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

    // Se confirmação ainda pendente, agenda alerta ao admin com 5 minutos de delay
    if (agendamento.confirmacao?.tipo === 'pendente') {
      const { getNotificationQueue } = await import('../queues/notificationQueue.js');
      const queue = getNotificationQueue();
      if (queue) {
        await queue.add(
          'alerta-admin-pendente',
          { tipo: 'alerta-admin-pendente', agendamentoId, tenantId, clienteNome, dataHora: job.data.dataHora },
          { delay: 5 * 60 * 1000 }
        );
        logger.info({ jobId: job.id, clienteNome }, '[Worker] Alerta ao admin agendado para daqui a 5 min');
      }
    }

    logger.info({ jobId: job.id, tipo, clienteNome }, '[Worker] Notificação enviada');
    return;
  }

  // Alerta ao admin 5 min após lembrete 1h (verifica se ainda pendente)
  if (tipo === 'alerta-admin-pendente') {
    const agendamento = await Agendamento.findById(agendamentoId).lean();

    if (!agendamento || agendamento.confirmacao?.tipo !== 'pendente') {
      logger.info({ jobId: job.id, agendamentoId }, '[Worker] Cliente já confirmou — alerta ao admin cancelado');
      return;
    }

    const tenant = await Tenant.findById(tenantId).lean();
    const numeroAdmin = tenant?.whatsapp?.numeroWhatsapp || tenant?.contato?.telefone;

    if (!numeroAdmin) {
      logger.warn({ jobId: job.id, tenantId }, '[Worker] Número do admin não configurado — alerta não enviado');
      return;
    }

    const dt = DateTime.fromISO(job.data.dataHora, { zone: ZONA });
    const alerta = `⚠️ *Confirmação Pendente*\n\nOlá, Administrador!\n\nA sessão de *${clienteNome}* das *${dt.toFormat('HH:mm')}* ainda não foi confirmada.\n\nPode querer entrar em contacto.`;
    await sendWhatsAppMessage(numeroAdmin, alerta);
    logger.info({ jobId: job.id, clienteNome }, '[Worker] Alerta de pendente enviado ao admin');
    return;
  }

  // Todos os outros tipos (confirmacao, lembrete-antecipado)
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
