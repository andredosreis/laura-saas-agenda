import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'salon-test') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin Teste',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, user, token };
}

// Inicializa e activa todos os dias via HTTP API (mesmo middleware que o agendamento)
async function activarSchedule(token) {
  await request(app)
    .get('/api/schedules')
    .set('Authorization', `Bearer ${token}`);

  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(day =>
      request(app)
        .put(`/api/schedules/${day}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: true, startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00' })
    )
  );
}

// Amanhã às 14:00 hora de São Paulo (UTC-3) — dentro do expediente
function dataFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0] + 'T14:00:00-03:00';
}

// Cria cliente e retorna o ID
async function criarCliente(token, telefone = '910000001') {
  const res = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Cliente Teste', telefone });
  return res.body._id;
}

// ──────────────────────────────────────────────
// GET /api/agendamentos
// ──────────────────────────────────────────────

describe('GET /api/agendamentos', () => {
  it('retorna lista vazia paginada', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('rejeita pedido sem autenticação com 401', async () => {
    const res = await request(app).get('/api/agendamentos');
    expect(res.status).toBe(401);
  });

  it('tenant A não vê agendamentos do tenant B', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    await activarSchedule(tokenB);
    const clienteIdB = await criarCliente(tokenB, '920000001');

    await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ cliente: clienteIdB, dataHora: dataFutura() });

    const res = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
  });
});

// ──────────────────────────────────────────────
// POST /api/agendamentos
// ──────────────────────────────────────────────

describe('POST /api/agendamentos', () => {
  it('cria agendamento com sucesso', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.cliente).toBe(clienteId);
  });

  it('rejeita agendamento sem schedule activo', async () => {
    const { token } = await criarTenantEToken('sem-schedule');
    const clienteId = await criarCliente(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejeita agendamento com data no passado', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const passado = new Date(Date.now() - 86400000).toISOString().split('T')[0] + 'T14:00:00-03:00';

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: passado });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejeita conflito de horário', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);
    const dataHora = dataFutura();

    await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora });

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ──────────────────────────────────────────────
// GET /api/agendamentos/:id
// ──────────────────────────────────────────────

describe('GET /api/agendamentos/:id', () => {
  it('retorna o agendamento pelo ID', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const criado = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criado.status).toBe(201);

    const res = await request(app)
      .get(`/api/agendamentos/${criado.body._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(criado.body._id);
  });

  it('retorna 404 para agendamento de outro tenant', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    await activarSchedule(tokenB);
    const clienteIdB = await criarCliente(tokenB, '920000002');

    const criado = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ cliente: clienteIdB, dataHora: dataFutura() });

    expect(criado.status).toBe(201);

    const res = await request(app)
      .get(`/api/agendamentos/${criado.body._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('retorna 400 para ObjectId inválido', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .get('/api/agendamentos/id-invalido')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────
// PATCH /api/agendamentos/:id/status
// ──────────────────────────────────────────────

describe('PATCH /api/agendamentos/:id/status', () => {
  it('actualiza o status do agendamento', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const criado = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criado.status).toBe(201);

    const res = await request(app)
      .patch(`/api/agendamentos/${criado.body._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Confirmado' });

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────
// DELETE /api/agendamentos/:id
// ──────────────────────────────────────────────

describe('DELETE /api/agendamentos/:id', () => {
  it('elimina o agendamento com sucesso', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const criado = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criado.status).toBe(201);

    const res = await request(app)
      .delete(`/api/agendamentos/${criado.body._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('agendamento eliminado não aparece na listagem', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const criado = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criado.status).toBe(201);

    await request(app)
      .delete(`/api/agendamentos/${criado.body._id}`)
      .set('Authorization', `Bearer ${token}`);

    const lista = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`);

    expect(lista.body.pagination.total).toBe(0);
  });
});
