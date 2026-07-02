// tests/followup-presenca-endpoint.test.js
// PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/presenca
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const svc = { 'X-Service-Token': 'test-service-token' };

async function seedTenantClienteAgendamento(slug, agOverrides = {}) {
  const tenant = await Tenant.create({
    nome: `Clínica ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
  });
  const models = getModels(getTenantDB(String(tenant._id)));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: `35191${Math.floor(1000000 + Math.random() * 8999999)}`,
  });
  const agendamento = await models.Agendamento.create({
    tenantId: tenant._id,
    cliente: cliente._id,
    dataHora: new Date(Date.now() + 60 * 60 * 1000),
    status: 'Agendado',
    ...agOverrides,
  });
  return { tenant, models, cliente, agendamento };
}

const url = (clienteId, agId) =>
  `/api/internal/clientes/${clienteId}/agendamentos/${agId}/presenca`;

describe('PATCH /presenca', () => {
  it('compareceu=true a partir de Agendado → Compareceu + respostaEm + feedback', async () => {
    const { tenant, models, cliente, agendamento } = await seedTenantClienteAgendamento('pres-a');

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: true, feedback: 'correu óptimo' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ statusAtualizado: true, status: 'Compareceu' });

    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.status).toBe('Compareceu');
    expect(ag.compareceu).toBe(true);
    expect(ag.followUp.respostaEm).toBeInstanceOf(Date);
    expect(ag.followUp.feedback).toBe('correu óptimo');
  });

  it('compareceu=false → Não Compareceu', async () => {
    const { tenant, models, cliente, agendamento } = await seedTenantClienteAgendamento('pres-b');

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: false });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Não Compareceu');
    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.compareceu).toBe(false);
  });

  it('status Realizado (Laura já mexeu) → noop no status, mas regista respostaEm', async () => {
    const { tenant, models, cliente, agendamento } = await seedTenantClienteAgendamento('pres-c');
    await models.Agendamento.updateOne(
      { _id: agendamento._id },
      { $set: { status: 'Realizado' } }
    );

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: true, feedback: 'boa' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ statusAtualizado: false, status: 'Realizado' });

    const ag = await models.Agendamento.findById(agendamento._id).lean();
    expect(ag.status).toBe('Realizado');
    expect(ag.followUp.respostaEm).toBeInstanceOf(Date);
  });

  it('isolamento multi-tenant: tenant B não toca agendamento do tenant A → 404', async () => {
    const { cliente, agendamento } = await seedTenantClienteAgendamento('pres-d');
    const tenantB = await Tenant.create({
      nome: 'Clínica B',
      slug: 'pres-tenant-b',
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    });

    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenantB._id), compareceu: true });

    expect(res.status).toBe(404);
  });

  it('compareceu não-boolean → 400', async () => {
    const { tenant, cliente, agendamento } = await seedTenantClienteAgendamento('pres-e');
    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .set(svc)
      .send({ tenantId: String(tenant._id), compareceu: 'sim' });
    expect(res.status).toBe(400);
  });

  it('sem service token → 401', async () => {
    const { tenant, cliente, agendamento } = await seedTenantClienteAgendamento('pres-f');
    const res = await request(app)
      .patch(url(cliente._id, agendamento._id))
      .send({ tenantId: String(tenant._id), compareceu: true });
    expect(res.status).toBe(401);
  });
});
