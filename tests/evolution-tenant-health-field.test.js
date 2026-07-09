import { jest } from '@jest/globals';

const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;

beforeAll(async () => { await setupTestDB(); });
afterAll(async () => { await teardownTestDB(); });
afterEach(async () => { await clearDB(); });

describe('Tenant.whatsapp.health', () => {
  it('default state = "unknown" e persiste via $set cirúrgico sem apagar irmãos', async () => {
    const t = await Tenant.create({
      nome: 'Clínica H', slug: 'clinica-h',
      whatsapp: { provider: 'evolution', instanceName: 'marcai' },
    });
    expect(t.whatsapp.health.state).toBe('unknown');

    const downSince = new Date('2026-07-08T00:00:00Z');
    await Tenant.updateOne(
      { _id: t._id },
      { $set: { 'whatsapp.health.state': 'down', 'whatsapp.health.downSince': downSince } },
    );

    const reloaded = await Tenant.findById(t._id).lean();
    expect(reloaded.whatsapp.health.state).toBe('down');
    expect(reloaded.whatsapp.health.downSince).toEqual(downSince);
    // irmãos preservados
    expect(reloaded.whatsapp.instanceName).toBe('marcai');
    expect(reloaded.whatsapp.provider).toBe('evolution');
  });
});
