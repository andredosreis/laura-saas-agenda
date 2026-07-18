// tests/followup-endpoints.test.js
// GET /followup-pendente + POST /renovacao-interesse
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import { jest } from '@jest/globals';

const sendMock = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendMock,
}));

const request = (await import('supertest')).default;
const app = (await import('../src/app.js')).default;
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  sendMock.mockClear();
});

const svc = { 'X-Service-Token': 'test-service-token' };

async function seed(slug, tenantOverrides = {}) {
  const tenant = await Tenant.create({
    nome: `Clínica ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    ...tenantOverrides,
  });
  const models = getModels(getTenantDB(String(tenant._id)));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: `35191${Math.floor(1000000 + Math.random() * 8999999)}`,
  });
  return { tenant, models, cliente };
}

async function criarAgendamentoComFollowUp(models, tenant, cliente, followUp) {
  const ag = await models.Agendamento.create({
    tenantId: tenant._id,
    cliente: cliente._id,
    dataHora: new Date(Date.now() + 60 * 60 * 1000),
    status: 'Agendado',
  });
  await models.Agendamento.updateOne({ _id: ag._id }, { $set: { followUp } });
  return ag;
}

describe('GET /followup-pendente', () => {
  it('devolve o agendamento com follow-up enviado <24h e sem resposta', async () => {
    const { tenant, models, cliente } = await seed('fp-a');
    const ag = await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 10 * 60 * 1000), // há 10 min
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(String(ag._id));
    expect(res.body.data.followUp.enviadoEm).toBeDefined();
  });

  it('sem follow-up enviado → data null', async () => {
    const { tenant, models, cliente } = await seed('fp-b');
    await models.Agendamento.create({
      tenantId: tenant._id,
      cliente: cliente._id,
      dataHora: new Date(Date.now() + 60 * 60 * 1000),
      status: 'Agendado',
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('já respondido → data null', async () => {
    const { tenant, models, cliente } = await seed('fp-c');
    await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 10 * 60 * 1000),
      respostaEm: new Date(),
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.body.data).toBeNull();
  });

  it('enviado há mais de 24h → data null (contexto expirado)', async () => {
    const { tenant, models, cliente } = await seed('fp-d');
    await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenant._id) })
      .set(svc);

    expect(res.body.data).toBeNull();
  });

  it('isolamento: tenant B não vê follow-up do tenant A → data null', async () => {
    const { tenant, models, cliente } = await seed('fp-e');
    await criarAgendamentoComFollowUp(models, tenant, cliente, {
      enviadoEm: new Date(Date.now() - 10 * 60 * 1000),
    });
    const { tenant: tenantB } = await seed('fp-e-b');

    const res = await request(app)
      .get(`/api/internal/clientes/${cliente._id}/followup-pendente`)
      .query({ tenantId: String(tenantB._id) })
      .set(svc);

    expect(res.body.data).toBeNull();
  });
});

describe('POST /renovacao-interesse', () => {
  it('com número de admin → envia WhatsApp com a instância do tenant', async () => {
    const { tenant, models, cliente } = await seed('ri-a', {
      whatsapp: { instanceName: 'clinica-ri-a', numeroWhatsapp: '351930000000' },
    });

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/renovacao-interesse`)
      .set(svc)
      .send({ tenantId: String(tenant._id) });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [numero, texto, instancia] = sendMock.mock.calls[0];
    expect(numero).toBe('351930000000');
    expect(texto).toMatch(/[Rr]enova/);
    expect(texto).toContain('Maria');
    expect(texto).toContain('Podes responder por texto ou áudio');
    expect(instancia).toBe('clinica-ri-a');

    const pedido = await models.PedidoEquipa.findOne({
      tenantId: tenant._id,
      contactoId: cliente._id,
    }).lean();
    expect(pedido).toMatchObject({
      contactoTipo: 'cliente',
      contactoNome: 'Maria',
      status: 'pendente',
    });
  });

  it('sem número de admin → whatsappEnviado false, sem erro', async () => {
    const { tenant, cliente } = await seed('ri-b');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/renovacao-interesse`)
      .set(svc)
      .send({ tenantId: String(tenant._id) });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('isolamento: cliente de outro tenant → 404', async () => {
    const { cliente } = await seed('ri-c');
    const { tenant: tenantB } = await seed('ri-c-b');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/renovacao-interesse`)
      .set(svc)
      .send({ tenantId: String(tenantB._id) });

    expect(res.status).toBe(404);
  });
});
