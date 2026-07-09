import { jest } from '@jest/globals';

process.env.EVOLUTION_HEALTH_CONFIRM_MS = '180000';
process.env.EVOLUTION_HEALTH_DAILY_MS = '86400000';
process.env.EVOLUTION_HEALTH_RECHECK_DEBOUNCE_MS = '60000';
process.env.ALERT_EMAIL = 'ops@marcai.pt';

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  getConnectionState: jest.fn(),
  registerSendFailureHandler: jest.fn(),
}));
jest.unstable_mockModule('../src/services/emailService.js', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email' }),
}));
jest.unstable_mockModule('@sentry/node', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { getConnectionState } = await import('../src/utils/evolutionClient.js');
const { sendEmail } = await import('../src/services/emailService.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { checkInstanceHealth, noteSendFailure } = await import('../src/services/evolutionHealthService.js');

const flush = () => new Promise((r) => setTimeout(r, 60));
let n = 0;
async function makeTenant(health, extraWhatsapp = {}) {
  n += 1;
  return Tenant.create({
    nome: 'Clínica Teste',
    slug: `clinica-svc-${n}`,
    whatsapp: { provider: 'evolution', instanceName: 'marcai', numeroWhatsapp: '351913402709', health, ...extraWhatsapp },
  });
}
const leanById = (id) => Tenant.findById(id).lean();

beforeAll(async () => { await setupTestDB(); });
afterAll(async () => { await teardownTestDB(); });
afterEach(async () => { await clearDB(); jest.clearAllMocks(); });

describe('checkInstanceHealth', () => {
  it('queda nova → arma o relógio, sem email', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'connecting' });
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    expect(sendEmail).not.toHaveBeenCalled();
    const after = await leanById(t._id);
    expect(after.whatsapp.health.state).toBe('down');
    expect(after.whatsapp.health.downSince).toBeTruthy();
    expect(after.whatsapp.health.lastAlertAt).toBeNull();
  });

  it('queda confirmada (≥3min) → envia email e grava lastAlertAt', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'close' });
    const downSince = new Date(Date.now() - 4 * 60 * 1000);
    const t = await makeTenant({ state: 'down', downSince, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe('ops@marcai.pt');
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/desligado/i);
    const after = await leanById(t._id);
    expect(after.whatsapp.health.lastAlertAt).toBeTruthy();
  });

  it('email falha → NÃO grava lastAlertAt (re-tenta), mantém estado down', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'close' });
    sendEmail.mockRejectedValueOnce(new Error('smtp down'));
    const downSince = new Date(Date.now() - 4 * 60 * 1000);
    const t = await makeTenant({ state: 'down', downSince, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    const after = await leanById(t._id);
    expect(after.whatsapp.health.state).toBe('down');
    expect(after.whatsapp.health.lastAlertAt).toBeNull();
  });

  it('$set cirúrgico preserva irmãos de whatsapp', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'connecting' });
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    await checkInstanceHealth(await leanById(t._id));
    const after = await leanById(t._id);
    expect(after.whatsapp.instanceName).toBe('marcai');
    expect(after.whatsapp.numeroWhatsapp).toBe('351913402709');
    expect(after.whatsapp.provider).toBe('evolution');
  });

  it('recuperação → email de reconectado e estado open', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });
    const t = await makeTenant({ state: 'down', downSince: new Date(Date.now() - 3600000), lastAlertAt: new Date(Date.now() - 1800000) });
    await checkInstanceHealth(await leanById(t._id));
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toMatch(/reconectado/i);
    const after = await leanById(t._id);
    expect(after.whatsapp.health.state).toBe('open');
    expect(after.whatsapp.health.downSince).toBeNull();
  });
});

describe('noteSendFailure', () => {
  it('ignora erro que não é de desconexão', async () => {
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    noteSendFailure('marcai', { status: 400, message: 'invalid number' });
    await flush();
    expect(getConnectionState).not.toHaveBeenCalled();
    await Tenant.deleteOne({ _id: t._id });
  });

  it('erro de desconexão dispara um check (e debounce colapsa chamadas rápidas)', async () => {
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });
    const t = await makeTenant({ state: 'unknown', downSince: null, lastAlertAt: null });
    noteSendFailure('marcai', { response: { message: 'Connection Closed' } });
    noteSendFailure('marcai', { response: { message: 'Connection Closed' } });
    await flush();
    expect(getConnectionState).toHaveBeenCalledTimes(1);
    await Tenant.deleteOne({ _id: t._id });
  });
});
