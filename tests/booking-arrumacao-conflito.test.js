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

const svc = () => ({ 'X-Service-Token': 'test-service-token' });
const DATE = '2027-06-07';

async function criarTenant(intervalo) {
  return Tenant.create({
    nome: 'Salão', slug: `s-${intervalo}-${Math.round(Math.random()*1e6)}`,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    configuracoes: { intervaloEntreSessoes: intervalo },
  });
}

async function criarCliente(tenantId, nome, telefone) {
  const { Cliente } = getModels(getTenantDB(String(tenantId)));
  return Cliente.create({ tenantId, nome, telefone });
}

function marcar(clienteId, tenantId, isoLocal) {
  return request(app)
    .post(`/api/internal/clientes/${clienteId}/agendamentos`)
    .set(svc())
    .send({ tenantId: String(tenantId), dataHoraISO: `${isoLocal}:00`, tipo: 'Sessao' });
}

async function criarLead(tenantId, telefone) {
  const { Lead } = getModels(getTenantDB(String(tenantId)));
  return Lead.create({ tenantId, telefone, status: 'em_conversa', qualificacao: { score: 0 } });
}

function marcarLead(leadId, tenantId, isoLocal) {
  return request(app)
    .post(`/api/internal/leads/${leadId}/agendamento`)
    .set(svc())
    .send({ tenantId: String(tenantId), dataHoraISO: `${isoLocal}:00` });
}

describe('conflito de booking reserva a arrumação', () => {
  it('intervalo 15 → 60 min de distância é conflito; 75 min é permitido', async () => {
    const tenant = await criarTenant(15);
    const a = await criarCliente(tenant._id, 'Ana', '910000001');
    const b = await criarCliente(tenant._id, 'Bia', '910000002');
    const c = await criarCliente(tenant._id, 'Caio', '910000003');

    const r1 = await marcar(a._id, tenant._id, `${DATE}T14:00`);
    expect(r1.status).toBe(201);

    // 15:00 está a 60 min → com arrumação (75) deve colidir.
    const r2 = await marcar(b._id, tenant._id, `${DATE}T15:00`);
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('slot_taken');

    // 15:15 está a 75 min → permitido.
    const r3 = await marcar(c._id, tenant._id, `${DATE}T15:15`);
    expect(r3.status).toBe(201);
  });

  it('intervalo 0 → 60 min de distância é permitido (sem regressão)', async () => {
    const tenant = await criarTenant(0);
    const a = await criarCliente(tenant._id, 'Ana', '910000001');
    const b = await criarCliente(tenant._id, 'Bia', '910000002');
    expect((await marcar(a._id, tenant._id, `${DATE}T14:00`)).status).toBe(201);
    expect((await marcar(b._id, tenant._id, `${DATE}T15:00`)).status).toBe(201);
  });
});

describe('conflito de booking de lead (IA) reserva a arrumação', () => {
  it('intervalo 15 → lead a 60 min de outra marcação é conflito; 75 min é permitido', async () => {
    const tenant = await criarTenant(15);
    const l1 = await criarLead(tenant._id, '920000001');
    const l2 = await criarLead(tenant._id, '920000002');
    const l3 = await criarLead(tenant._id, '920000003');

    expect((await marcarLead(l1._id, tenant._id, `${DATE}T14:00`)).status).toBe(201);

    // 15:00 está a 60 min → com arrumação (75) deve colidir, como no path de clientes.
    const r2 = await marcarLead(l2._id, tenant._id, `${DATE}T15:00`);
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('slot_taken');

    // 15:15 está a 75 min → permitido.
    expect((await marcarLead(l3._id, tenant._id, `${DATE}T15:15`)).status).toBe(201);
  });

  it('intervalo 0 → lead a 60 min é permitido (sem regressão)', async () => {
    const tenant = await criarTenant(0);
    const l1 = await criarLead(tenant._id, '920000001');
    const l2 = await criarLead(tenant._id, '920000002');
    expect((await marcarLead(l1._id, tenant._id, `${DATE}T14:00`)).status).toBe(201);
    expect((await marcarLead(l2._id, tenant._id, `${DATE}T15:00`)).status).toBe(201);
  });
});
