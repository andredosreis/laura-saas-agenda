// tests/followup-models.test.js
// Campos novos do follow-up pós-sessão: Agendamento.followUp + Tenant flag.
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('Modelos — follow-up pós-sessão', () => {
  it('Tenant.configuracoes.followUpPosSessaoAtivo tem default true', async () => {
    const tenant = await Tenant.create({
      nome: 'Clínica T1',
      slug: 'clinica-t1',
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    });
    expect(tenant.configuracoes.followUpPosSessaoAtivo).toBe(true);
  });

  it('Agendamento aceita e persiste o subdocumento followUp', async () => {
    const tenant = await Tenant.create({
      nome: 'Clínica T2',
      slug: 'clinica-t2',
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    });
    const { Agendamento } = getModels(getTenantDB(String(tenant._id)));
    const enviadoEm = new Date();
    const ag = await Agendamento.create({
      tenantId: tenant._id,
      dataHora: new Date(Date.now() + 60 * 60 * 1000),
      status: 'Agendado',
      followUp: { enviadoEm, feedback: 'correu óptimo' },
    });
    const reloaded = await Agendamento.findById(ag._id).lean();
    expect(reloaded.followUp.enviadoEm.getTime()).toBe(enviadoEm.getTime());
    expect(reloaded.followUp.respostaEm).toBeNull();
    expect(reloaded.followUp.feedback).toBe('correu óptimo');
  });
});
