import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantBase() {
  return Tenant.create({
    nome: 'Salão RBAC',
    slug: 'salon-rbac',
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
}

async function criarUtilizadorComToken(tenantId, role, email) {
  const user = await User.create({
    tenantId,
    nome: `User ${role}`,
    email,
    passwordHash: 'hash-placeholder',
    role,
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { user, token };
}

async function criarAgendamentoDirecto(tenantId, profissionalId, clienteId) {
  const { Agendamento } = getModels(getTenantDB(tenantId));
  return Agendamento.create({
    tenantId,
    cliente: clienteId,
    profissional: profissionalId,
    dataHora: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: 'Agendado',
  });
}

async function criarClienteDirecto(tenantId, telefone) {
  const { Cliente } = getModels(getTenantDB(tenantId));
  return Cliente.create({
    tenantId,
    nome: 'Cliente Teste',
    telefone,
  });
}

// ─────────────────────────────────────────────────
// CAMADA A — authorize() nas rotas
// ─────────────────────────────────────────────────

describe('RBAC — authorize() nas rotas de agendamento', () => {
  it('terapeuta recebe 403 ao tentar POST /api/agendamentos', async () => {
    const tenant = await criarTenantBase();
    const { token } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'terapeuta@rbac.pt');

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ dataHora: new Date().toISOString() });

    expect(res.status).toBe(403);
  });

  it('terapeuta recebe 403 ao tentar DELETE /api/agendamentos/:id', async () => {
    const tenant = await criarTenantBase();
    const { user: terapeuta, token } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'terapeuta@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000001');
    const agendamento = await criarAgendamentoDirecto(tenant._id, terapeuta._id, cliente._id);

    const res = await request(app)
      .delete(`/api/agendamentos/${agendamento._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('recepcionista recebe 403 ao tentar DELETE /api/agendamentos/:id (mais restrito que POST)', async () => {
    const tenant = await criarTenantBase();
    const { token } = await criarUtilizadorComToken(tenant._id, 'recepcionista', 'recepcao@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000002');
    const agendamento = await criarAgendamentoDirecto(tenant._id, null, cliente._id);

    const res = await request(app)
      .delete(`/api/agendamentos/${agendamento._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────
// CAMADA B — resource-level scope por terapeuta
// ─────────────────────────────────────────────────

describe('RBAC — filtro resource-level para terapeuta', () => {
  it('terapeuta A lista agendamentos e só vê os seus', async () => {
    const tenant = await criarTenantBase();
    const { user: terapeutaA, token: tokenA } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'a@rbac.pt');
    const { user: terapeutaB } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'b@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000010');

    await criarAgendamentoDirecto(tenant._id, terapeutaA._id, cliente._id);
    await criarAgendamentoDirecto(tenant._id, terapeutaB._id, cliente._id);

    const res = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(String(res.body.data[0].profissional)).toBe(String(terapeutaA._id));
  });

  it('terapeuta A recebe 404 ao tentar GET agendamento do terapeuta B', async () => {
    const tenant = await criarTenantBase();
    const { token: tokenA } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'a@rbac.pt');
    const { user: terapeutaB } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'b@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000011');
    const agendamentoB = await criarAgendamentoDirecto(tenant._id, terapeutaB._id, cliente._id);

    const res = await request(app)
      .get(`/api/agendamentos/${agendamentoB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('terapeuta A recebe 404 ao tentar PATCH status de agendamento do terapeuta B', async () => {
    const tenant = await criarTenantBase();
    const { token: tokenA } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'a@rbac.pt');
    const { user: terapeutaB } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'b@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000012');
    const agendamentoB = await criarAgendamentoDirecto(tenant._id, terapeutaB._id, cliente._id);

    const res = await request(app)
      .patch(`/api/agendamentos/${agendamentoB._id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'Realizado' });

    expect(res.status).toBe(404);
  });

  it('terapeuta A marca status Realizado no seu próprio agendamento (happy path do scope)', async () => {
    const tenant = await criarTenantBase();
    const { user: terapeutaA, token: tokenA } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'a@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000020');
    const agendamentoA = await criarAgendamentoDirecto(tenant._id, terapeutaA._id, cliente._id);

    const res = await request(app)
      .patch(`/api/agendamentos/${agendamentoA._id}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'Realizado' });

    expect(res.status).toBe(200);
  });

  it('admin lista agendamentos e vê todos (filtro não se aplica)', async () => {
    const tenant = await criarTenantBase();
    const { token: tokenAdmin } = await criarUtilizadorComToken(tenant._id, 'admin', 'admin@rbac.pt');
    const { user: terapeutaA } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'a@rbac.pt');
    const { user: terapeutaB } = await criarUtilizadorComToken(tenant._id, 'terapeuta', 'b@rbac.pt');
    const cliente = await criarClienteDirecto(tenant._id, '910000013');

    await criarAgendamentoDirecto(tenant._id, terapeutaA._id, cliente._id);
    await criarAgendamentoDirecto(tenant._id, terapeutaB._id, cliente._id);

    const res = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});
