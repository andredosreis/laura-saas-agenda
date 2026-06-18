import { Worker } from 'bullmq';
import { DateTime } from 'luxon';
import { getRedisConnection } from '../queues/redisConnection.js';
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';
import Tenant from '../models/Tenant.js';
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';
import logger from '../utils/logger.js';

const ZONA = 'Europe/Lisbon';

const STATUS_CANCELADOS = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];

/**
 * Um lembrete fica obsoleto se, na hora de disparar, o agendamento já não existe,
 * foi cancelado/rejeitado, OU foi remarcado (a dataHora pretendida pelo job já não
 * bate com a actual). Torna os jobs auto-validáveis: um job órfão (deixado para
 * trás por uma remarcação/cancelamento) dispara e ignora-se sozinho, em vez de
 * mandar um lembrete para a hora errada → evita lembretes desordenados.
 *
 * @param {object|null} agendamento  doc lean do Agendamento (ou null se não existe)
 * @param {{ data?: { dataHora?: string } }} job
 * @returns {boolean}
 */
export function lembreteObsoleto(agendamento, job) {
  if (!agendamento) return true;
  if (
    STATUS_CANCELADOS.includes(agendamento.status) ||
    agendamento.confirmacao?.tipo === 'rejeitado'
  ) {
    return true;
  }
  const intendedISO = job?.data?.dataHora;
  if (intendedISO && agendamento.dataHora) {
    const intended = DateTime.fromISO(intendedISO, { zone: ZONA }).toMillis();
    const atual = DateTime.fromJSDate(new Date(agendamento.dataHora)).toMillis();
    if (Number.isFinite(intended) && Number.isFinite(atual) && intended !== atual) {
      return true; // remarcado desde que o job foi agendado
    }
  }
  return false;
}

function buildMensagem(job) {
  const { tipo, clienteNome, dataHora, diasAntes, servicoNome } = job.data;
  const dt = DateTime.fromISO(dataHora, { zone: ZONA });
  const dataFormatada = dt.toFormat('dd/MM/yyyy');
  const horaFormatada = dt.toFormat('HH:mm');
  const servicoLinha = servicoNome ? `💆 Serviço: ${servicoNome}\n` : '';

  if (tipo === 'confirmacao') {
    return `✅ *Agendamento Confirmado!*\n\nOlá ${clienteNome}!\n\nO seu agendamento foi marcado com sucesso:\n${servicoLinha}📅 Data: ${dataFormatada}\n🕐 Horário: ${horaFormatada}\n\nAté breve! 💆‍♀️✨\n\n_LA Estética Avançada_`;
  }

  if (tipo === 'lembrete-antecipado') {
    const quando = diasAntes === 1 ? 'AMANHÃ' : `daqui a ${diasAntes} dias`;
    return `🔔 *Lembrete de Agendamento*\n\nOlá ${clienteNome}!\n\nLembramos que tem uma sessão marcada para *${quando}*:\n${servicoLinha}📅 Data: ${dataFormatada}\n🕐 Horário: ${horaFormatada}\n\nAté breve! 💆‍♀️✨\n\n_LA Estética Avançada_`;
  }

  if (tipo === 'lembrete-1h') {
    return `⏰ *Sessão em 1 hora!*\n\nOlá ${clienteNome}!\n\nA sua sessão começa às *${horaFormatada}* de hoje.\n${servicoLinha ? `\n${servicoLinha}` : ''}\nEstá confirmada? Por favor responda:\n✅ *SIM* — confirmar\n❌ *NÃO* — cancelar\n\n_LA Estética Avançada_`;
  }

  return null;
}

/**
 * Regista um lembrete/notificação enviado ao cliente como Mensagem (direcao
 * saida, geradoPor 'sistema') para aparecer na thread do inbox de Conversas.
 * Best-effort: uma falha aqui não deve quebrar o envio (já feito com sucesso).
 */
async function registarNaThread(Mensagem, { tenantId, telefone, mensagem }) {
  if (!Mensagem || !telefone || !mensagem) return;
  try {
    await Mensagem.create({
      tenantId,
      telefone: String(telefone).replace(/\D/g, ''),
      mensagem,
      origem: 'laura',
      direcao: 'saida',
      geradoPor: 'sistema',
    });
  } catch (err) {
    logger.warn({ err: err.message }, '[Worker] falha a registar lembrete na thread (envio OK)');
  }
}

async function processJob(job) {
  const { tipo, clienteTelefone, clienteNome, agendamentoId, tenantId } = job.data;

  // Resolver DB do tenant para queries isoladas
  const tenantDb = getTenantDB(tenantId);
  const { Agendamento, Mensagem } = getModels(tenantDb);

  // Lógica especial para lembrete de 1h: verifica estado da confirmação
  if (tipo === 'lembrete-1h') {
    if (!clienteTelefone) {
      logger.warn({ jobId: job.id, tipo }, '[Worker] Sem telefone — job ignorado');
      return;
    }
    const agendamento = await Agendamento.findById(agendamentoId).lean();

    if (lembreteObsoleto(agendamento, job)) {
      logger.info(
        { jobId: job.id, agendamentoId },
        '[Worker] lembrete-1h ignorado (inexistente/cancelado/remarcado)'
      );
      return;
    }

    // Envia lembrete ao cliente
    const mensagem = buildMensagem(job);
    const resultado = await sendWhatsAppMessage(clienteTelefone, mensagem);
    if (!resultado.success) {
      throw new Error(`Falha ao enviar lembrete 1h para ${clienteNome}: ${JSON.stringify(resultado.error)}`);
    }
    await registarNaThread(Mensagem, { tenantId, telefone: clienteTelefone, mensagem });

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

    if (
      !agendamento ||
      agendamento.confirmacao?.tipo !== 'pendente' ||
      agendamento.status === 'Cancelado Pelo Cliente' ||
      agendamento.status === 'Cancelado Pelo Salão'
    ) {
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

  // Auto-validação: não disparar um lembrete de um agendamento que foi
  // cancelado/remarcado depois de o job ter sido agendado.
  const agendamentoActual = await Agendamento.findById(agendamentoId).lean();
  if (lembreteObsoleto(agendamentoActual, job)) {
    logger.info(
      { jobId: job.id, tipo, agendamentoId },
      '[Worker] lembrete ignorado (inexistente/cancelado/remarcado)'
    );
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
  await registarNaThread(Mensagem, { tenantId, telefone: clienteTelefone, mensagem });

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
