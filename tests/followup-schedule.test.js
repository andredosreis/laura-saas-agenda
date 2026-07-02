// tests/followup-schedule.test.js
// scheduleNotifications agenda (e remove na remarcação) o job follow-up-pos-sessao.
import { jest } from '@jest/globals';

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

const AG_ID = '6a33bfa02d990b533792e8e7';
const baseParams = (dataHora) => ({
  agendamentoId: AG_ID,
  tenantId: 't1',
  dataHora,
  clienteNome: 'Maria',
  clienteTelefone: '351910000000',
  servicoNome: 'Sessão',
});

beforeEach(() => {
  addCalls.length = 0;
  removeCalls.length = 0;
  jest.clearAllMocks();
});

describe('scheduleNotifications — job follow-up-pos-sessao', () => {
  it('agenda com jobId determinístico e delay = dataHora + duração + 5min', async () => {
    const dataHora = new Date(Date.now() + 3 * 60 * 60 * 1000); // +3h
    await scheduleNotifications({ ...baseParams(dataHora), duracaoSessaoMin: 60 });

    expect(removeCalls).toContain(`${AG_ID}-followup`);

    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    expect(call).toBeDefined();
    expect(call.opts.jobId).toBe(`${AG_ID}-followup`);
    expect(call.data.tipo).toBe('follow-up-pos-sessao');
    expect(call.opts.jobId).not.toContain(':');

    const esperado = dataHora.getTime() + 65 * 60 * 1000 - Date.now();
    expect(Math.abs(call.opts.delay - esperado)).toBeLessThan(5000);
  });

  it('usa duração customizada do tenant (90 min → delay +95min)', async () => {
    const dataHora = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await scheduleNotifications({ ...baseParams(dataHora), duracaoSessaoMin: 90 });

    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    const esperado = dataHora.getTime() + 95 * 60 * 1000 - Date.now();
    expect(Math.abs(call.opts.delay - esperado)).toBeLessThan(5000);
  });

  it('sem duracaoSessaoMin usa default 60', async () => {
    const dataHora = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await scheduleNotifications(baseParams(dataHora));

    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    const esperado = dataHora.getTime() + 65 * 60 * 1000 - Date.now();
    expect(Math.abs(call.opts.delay - esperado)).toBeLessThan(5000);
  });

  it('não agenda follow-up quando o fim previsto já passou (delay ≤ 0)', async () => {
    // dataHora 2h no passado → fim previsto (+65min) também no passado
    const dataHora = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await scheduleNotifications(baseParams(dataHora));

    expect(addCalls.find((c) => c.name === 'follow-up-pos-sessao')).toBeUndefined();
    // mas o jobId antigo é removido na mesma (remarcação limpa)
    expect(removeCalls).toContain(`${AG_ID}-followup`);
  });
});
