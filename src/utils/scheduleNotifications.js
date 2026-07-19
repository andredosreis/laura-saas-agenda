import { DateTime } from 'luxon';
import { getNotificationQueue } from '../queues/notificationQueue.js';
import { sendWhatsAppMessage } from './evolutionClient.js';
import { formatarDataLembrete } from './lembreteFormat.js';
import { primeiroNome } from './primeiroNome.js';
import logger from './logger.js';

const ZONA = 'Europe/Lisbon';

function buildConfirmacaoMessage({ clienteNome, dataHora, servicoNome }) {
  const dataExtenso = formatarDataLembrete(dataHora);
  const servicoLinha = servicoNome ? `💆 Serviço: ${servicoNome}\n` : '';

  return `✅ *Agendamento Confirmado!*

Olá ${primeiroNome(clienteNome)}! A sua sessão ficou marcada para:
📅 *${dataExtenso}*
${servicoLinha}
Até breve! 💆‍♀️✨

_LA Estética Avançada_`;
}

/**
 * `incluirLembretes` / `incluirFollowUp` (default true) existem para o par de
 * sessões emendadas (PR #100): a 2ª sessão não agenda lembretes próprios (o
 * lembrete de 1h dispararia durante a 1ª sessão, com a cliente já no salão) e
 * a 1ª não agenda follow-up (a visita só termina no fim da 2ª). A confirmação
 * é sempre agendada.
 */
export async function scheduleNotifications({ agendamentoId, tenantId, dataHora, clienteNome, clienteTelefone, servicoNome, duracaoSessaoMin = 60, incluirLembretes = true, incluirFollowUp = true }) {
  if (!clienteTelefone) {
    logger.warn({ agendamentoId }, '[Notifications] Sem telefone — jobs não agendados');
    return { queued: false, reason: 'missing_phone' };
  }

  const agendamento = DateTime.fromJSDate(new Date(dataHora)).setZone(ZONA);
  const agora = DateTime.now().setZone(ZONA);
  const diasAte = agendamento.diff(agora, 'days').days;

  const baseData = {
    agendamentoId: agendamentoId.toString(),
    tenantId: tenantId.toString(),
    clienteNome,
    clienteTelefone,
    servicoNome: servicoNome || 'sessão',
    dataHora: agendamento.toISO(),
  };

  const queue = getNotificationQueue();
  if (!queue) {
    logger.warn(
      { agendamentoId },
      '[Notifications] Redis não configurado — lembretes futuros não agendados'
    );

    if (process.env.NODE_ENV === 'test') {
      return { queued: false, reason: 'redis_unavailable' };
    }

    const mensagem = buildConfirmacaoMessage(baseData);
    const resultado = await sendWhatsAppMessage(clienteTelefone, mensagem);
    if (!resultado.success) {
      logger.warn(
        { agendamentoId, err: resultado.error },
        '[Notifications] Confirmação imediata não enviada sem Redis'
      );
      return { queued: false, immediateSent: false, reason: 'redis_unavailable' };
    }

    logger.info(
      { agendamentoId },
      '[Notifications] Confirmação imediata enviada; lembretes futuros requerem Redis'
    );
    return { queued: false, immediateSent: true, reason: 'redis_unavailable' };
  }

  // IDs determinísticos por agendamento+tipo. Permitem que, ao remarcar (re-chamar
  // esta função), os lembretes antigos sejam removidos e recriados limpos — em vez
  // de ficarem jobs órfãos a disparar para a hora antiga (lembretes desordenados).
  // Separador '-' (NÃO ':' — o BullMQ rejeita jobIds customizados com ':').
  const jobIdConfirmacao = `${baseData.agendamentoId}-confirmacao`;
  const jobIdAntecipado = `${baseData.agendamentoId}-lembrete-antecipado`;
  const jobId1h = `${baseData.agendamentoId}-lembrete-1h`;
  const jobIdFollowUp = `${baseData.agendamentoId}-followup`;

  // Remove lembretes anteriores deste agendamento (remarcação/recriação limpa).
  await Promise.all(
    [jobIdConfirmacao, jobIdAntecipado, jobId1h, jobIdFollowUp].map((jid) =>
      queue.remove(jid).catch(() => {})
    )
  );

  // 1. Confirmação imediata (sem delay)
  await queue.add('confirmacao', { ...baseData, tipo: 'confirmacao' }, { jobId: jobIdConfirmacao });

  // 2. Lembrete antecipado
  if (incluirLembretes && diasAte > 7) {
    const delay = agendamento.minus({ days: 2 }).diff(agora).milliseconds;
    if (delay > 0) {
      await queue.add(
        'lembrete-antecipado',
        { ...baseData, tipo: 'lembrete-antecipado', diasAntes: 2 },
        { delay, jobId: jobIdAntecipado }
      );
    }
  } else if (incluirLembretes && diasAte >= 2) {
    const delay = agendamento.minus({ days: 1 }).diff(agora).milliseconds;
    if (delay > 0) {
      await queue.add(
        'lembrete-antecipado',
        { ...baseData, tipo: 'lembrete-antecipado', diasAntes: 1 },
        { delay, jobId: jobIdAntecipado }
      );
    }
  }

  // 3. Lembrete 1h antes
  const delay1h = agendamento.minus({ hours: 1 }).diff(agora).milliseconds;
  if (incluirLembretes && delay1h > 0) {
    await queue.add(
      'lembrete-1h',
      { ...baseData, tipo: 'lembrete-1h' },
      { delay: delay1h, jobId: jobId1h }
    );
  }

  // 4. Follow-up pós-sessão: fim previsto da sessão + 5 min. O worker
  // revalida tudo no disparo (avaliarFollowUp) — aqui só se agenda.
  const delayFollowUp = agendamento
    .plus({ minutes: duracaoSessaoMin + 5 })
    .diff(agora).milliseconds;
  if (incluirFollowUp && delayFollowUp > 0) {
    await queue.add(
      'follow-up-pos-sessao',
      { ...baseData, tipo: 'follow-up-pos-sessao' },
      { delay: delayFollowUp, jobId: jobIdFollowUp }
    );
  }

  logger.info({ agendamentoId, diasAte: Math.floor(diasAte) }, '[Notifications] Jobs agendados');
  return { queued: true };
}
