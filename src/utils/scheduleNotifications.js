import { DateTime } from 'luxon';
import { getNotificationQueue } from '../queues/notificationQueue.js';
import logger from './logger.js';

const ZONA = 'Europe/Lisbon';

export async function scheduleNotifications({ agendamentoId, tenantId, dataHora, clienteNome, clienteTelefone, servicoNome }) {
  const queue = getNotificationQueue();
  if (!queue) return; // Redis não configurado — degradação silenciosa

  if (!clienteTelefone) {
    logger.warn({ agendamentoId }, '[Notifications] Sem telefone — jobs não agendados');
    return;
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

  // 1. Confirmação imediata (sem delay)
  await queue.add('confirmacao', { ...baseData, tipo: 'confirmacao' });

  // 2. Lembrete antecipado
  if (diasAte > 7) {
    const delay = agendamento.minus({ days: 2 }).diff(agora).milliseconds;
    if (delay > 0) {
      await queue.add(
        'lembrete-antecipado',
        { ...baseData, tipo: 'lembrete-antecipado', diasAntes: 2 },
        { delay }
      );
    }
  } else if (diasAte >= 2) {
    const delay = agendamento.minus({ days: 1 }).diff(agora).milliseconds;
    if (delay > 0) {
      await queue.add(
        'lembrete-antecipado',
        { ...baseData, tipo: 'lembrete-antecipado', diasAntes: 1 },
        { delay }
      );
    }
  }

  // 3. Lembrete 1h antes
  const delay1h = agendamento.minus({ hours: 1 }).diff(agora).milliseconds;
  if (delay1h > 0) {
    await queue.add(
      'lembrete-1h',
      { ...baseData, tipo: 'lembrete-1h' },
      { delay: delay1h }
    );
  }

  logger.info({ agendamentoId, diasAte: Math.floor(diasAte) }, '[Notifications] Jobs agendados');
}
