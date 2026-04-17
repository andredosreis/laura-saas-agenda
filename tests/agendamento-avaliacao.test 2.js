import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'salon-avaliacao') {
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

async function activarSchedule(token) {
  await request(app).get('/api/schedules').set('Authorization', `Bearer ${token}`);
  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(day =>
      request(app)
        .put(`/api/schedules/${day}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: true, startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00' })
    )
  );
}

async function criarCliente(token, telefone = '910000001') {
  const res = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Cliente Teste', telefone });
  return res.body._id;
}

function dataFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0] + 'T14:00:00-03:00';
}

// ──────────────────────────────────────────────
// ADR-011: Agendamento sem pacote
// ──────────────────────────────────────────────

describe('ADR-011: Agendamento sem pacote (serviço avulso)', () => {
  it('cria agendamento de avaliação sem pacote com sucesso', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteId,
        dataHora: dataFutura(),
        servicoAvulsoNome: 'Avaliação Facial',
        servicoAvulsoValor: 0,
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.pacote).toBeUndefined();
    expect(res.body.compraPacote).toBeUndefined();
  });

  it('cria agendamento de serviço avulso sem pacote', async () => {
    const { token } = await criarTenantEToken('salon-avulso');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '911000001');

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteId,
        dataHora: dataFutura(),
        servicoAvulsoNome: 'Botox',
        servicoAvulsoValor: 150,
      });

    expect(res.status).toBe(201);
  });
});

// ──────────────────────────────────────────────
// ADR-011: Status 'Avaliacao'
// ──────────────────────────────────────────────

describe('ADR-011: Status Avaliacao', () => {
  it('aceita status Avaliacao ao actualizar agendamento', async () => {
    const { token } = await criarTenantEToken('salon-avaliacao2');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '912000001');

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criarRes.status).toBe(201);
    const agendamentoId = criarRes.body._id;

    const updateRes = await request(app)
      .patch(`/api/agendamentos/${agendamentoId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Avaliacao' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('Avaliacao');
  });

  it('isolamento — Tenant B não acede a agendamento de Tenant A', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-iso-a');
    const { token: tokenB } = await criarTenantEToken('salon-iso-b');

    await activarSchedule(tokenA);
    const clienteId = await criarCliente(tokenA, '913000001');

    const criar = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    const agendamentoId = criar.body._id;

    const res = await request(app)
      .get(`/api/agendamentos/${agendamentoId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});
