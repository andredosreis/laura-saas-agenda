/**
 * Lembretes desordenados — auto-validação no worker + jobIds determinísticos.
 *
 * Cobre o bug: ao remarcar um agendamento, os lembretes antigos (BullMQ) ficavam
 * para trás e disparavam para a hora velha. Fix em dois níveis:
 *   1. scheduleNotifications usa jobId `agendamentoId:tipo` e remove os antigos.
 *   2. o worker revalida o agendamento na hora de disparar (lembreteObsoleto).
 */

import { jest } from '@jest/globals';
import { DateTime } from 'luxon';

const addCalls = [];
const removeCalls = [];
const fakeQueue = {
  add: jest.fn((name, data, opts) => {
    addCalls.push({ name, data, opts });
    return Promise.resolve({ id: opts?.jobId });
  }),
  remove: jest.fn((jobId) => {
    removeCalls.push(jobId);
    return Promise.resolve();
  }),
};

jest.unstable_mockModule('../src/queues/notificationQueue.js', () => ({
  getNotificationQueue: () => fakeQueue,
}));
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));

const { scheduleNotifications } = await import('../src/utils/scheduleNotifications.js');
const { lembreteObsoleto } = await import('../src/workers/notificationWorker.js');

const ZONA = 'Europe/Lisbon';

describe('lembreteObsoleto — auto-validação na hora de disparar', () => {
  const dataHora = DateTime.fromISO('2026-06-20T14:00:00', { zone: ZONA });
  const job = { id: 'j1', data: { dataHora: dataHora.toISO() } };
  const valido = { status: 'Agendado', confirmacao: { tipo: 'pendente' }, dataHora: dataHora.toJSDate() };

  it('agendamento inexistente → obsoleto', () => {
    expect(lembreteObsoleto(null, job)).toBe(true);
  });

  it('cancelado pelo cliente → obsoleto', () => {
    expect(lembreteObsoleto({ ...valido, status: 'Cancelado Pelo Cliente' }, job)).toBe(true);
  });

  it('confirmação rejeitada → obsoleto', () => {
    expect(lembreteObsoleto({ ...valido, confirmacao: { tipo: 'rejeitado' } }, job)).toBe(true);
  });

  it('remarcado (dataHora mudou desde o agendamento do job) → obsoleto', () => {
    const remarcado = { ...valido, dataHora: dataHora.plus({ days: 1 }).toJSDate() };
    expect(lembreteObsoleto(remarcado, job)).toBe(true);
  });

  it('válido e à mesma hora → NÃO obsoleto', () => {
    expect(lembreteObsoleto(valido, job)).toBe(false);
  });
});

describe('scheduleNotifications — jobIds determinísticos + remoção dos antigos', () => {
  beforeEach(() => {
    addCalls.length = 0;
    removeCalls.length = 0;
    jest.clearAllMocks();
  });

  it('usa jobId agendamentoId:tipo e remove os antigos antes de agendar (remarcação limpa)', async () => {
    const agId = '6a33bfa02d990b533792e8e7';
    const dataHora = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // +3 dias → confirmacao + antecipado(1d) + 1h

    const res = await scheduleNotifications({
      agendamentoId: agId,
      tenantId: 't1',
      dataHora,
      clienteNome: 'Cliente X',
      clienteTelefone: '351900000000',
      servicoNome: 'Sessão',
    });

    expect(res).toEqual({ queued: true });

    // Remove dos 3 jobIds determinísticos (limpa o que existisse de uma remarcação)
    expect(removeCalls).toEqual(
      expect.arrayContaining([
        `${agId}:confirmacao`,
        `${agId}:lembrete-antecipado`,
        `${agId}:lembrete-1h`,
      ]),
    );

    // E agenda com esses mesmos jobIds determinísticos
    const jobIds = addCalls.map((c) => c.opts?.jobId);
    expect(jobIds).toContain(`${agId}:confirmacao`);
    expect(jobIds).toContain(`${agId}:lembrete-antecipado`);
    expect(jobIds).toContain(`${agId}:lembrete-1h`);
  });
});
