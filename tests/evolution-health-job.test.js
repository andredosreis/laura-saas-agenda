import { jest } from '@jest/globals';

jest.unstable_mockModule('node-cron', () => ({
  default: { schedule: jest.fn(() => ({ stop: jest.fn() })) },
}));
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  getConnectionState: jest.fn().mockResolvedValue({ ok: true, state: 'open' }),
  registerSendFailureHandler: jest.fn(),
}));
jest.unstable_mockModule('../src/services/emailService.js', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock' }),
}));
jest.unstable_mockModule('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const cron = (await import('node-cron')).default;
const { getConnectionState, registerSendFailureHandler } = await import('../src/utils/evolutionClient.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { checkAllInstances, startEvolutionHealthCron } = await import('../src/jobs/evolutionHealthJob.js');

beforeAll(async () => { await setupTestDB(); });
afterAll(async () => { await teardownTestDB(); });
afterEach(async () => { await clearDB(); jest.clearAllMocks(); delete process.env.EVOLUTION_HEALTH_CRON; });

describe('checkAllInstances', () => {
  it('só verifica tenants com instanceName', async () => {
    await Tenant.create({ nome: 'Com WA', slug: 'com-wa', whatsapp: { instanceName: 'marcai' } });
    await Tenant.create({ nome: 'Sem WA', slug: 'sem-wa' });
    await checkAllInstances();
    expect(getConnectionState).toHaveBeenCalledTimes(1);
    expect(getConnectionState).toHaveBeenCalledWith('marcai');
  });
});

describe('startEvolutionHealthCron', () => {
  it('EVOLUTION_HEALTH_CRON=off → não agenda, devolve null', () => {
    process.env.EVOLUTION_HEALTH_CRON = 'off';
    const task = startEvolutionHealthCron();
    expect(task).toBeNull();
    expect(cron.schedule).not.toHaveBeenCalled();
  });
  it('por default → regista handler reactivo e agenda a */5', () => {
    const task = startEvolutionHealthCron();
    expect(registerSendFailureHandler).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule.mock.calls[0][0]).toBe('*/5 * * * *');
    expect(task).not.toBeNull();
  });
});
