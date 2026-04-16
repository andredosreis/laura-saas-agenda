import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'test-salon') {
  const tenant = await Tenant.create({
    nome: 'Salão Teste',
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

async function criarCliente(token, dados = {}) {
  const res = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Cliente Teste', telefone: '910000001', ...dados });
  // controller retorna o objecto directamente (sem wrapper { success, data })
  return res.body;
}

// ──────────────────────────────────────────────
// GET /api/clientes/:id
// ──────────────────────────────────────────────

describe('GET /api/clientes/:id', () => {
  it('retorna o cliente pelo ID', async () => {
    const { token } = await criarTenantEToken();
    const cliente = await criarCliente(token);

    const res = await request(app)
      .get(`/api/clientes/${cliente._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(cliente._id);
    expect(res.body.nome).toBe('Cliente Teste');
  });

  it('retorna 404 para ID inexistente', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .get('/api/clientes/664f1c2e8b3a4d0012345678')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('retorna 400 para ObjectId inválido', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .get('/api/clientes/id-invalido')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('retorna 404 ao aceder a cliente de outro tenant', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    const clienteB = await criarCliente(tokenB, { telefone: '920000001' });

    const res = await request(app)
      .get(`/api/clientes/${clienteB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// PUT /api/clientes/:id
// ──────────────────────────────────────────────

describe('PUT /api/clientes/:id', () => {
  it('actualiza nome do cliente', async () => {
    const { token } = await criarTenantEToken();
    const cliente = await criarCliente(token);

    const res = await request(app)
      .put(`/api/clientes/${cliente._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Nome Actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Nome Actualizado');
  });

  it('retorna 404 ao actualizar cliente de outro tenant', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    const clienteB = await criarCliente(tokenB, { telefone: '920000002' });

    const res = await request(app)
      .put(`/api/clientes/${clienteB._id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Tentativa de Hack' });

    expect(res.status).toBe(404);
  });

  it('retorna 400 para ObjectId inválido', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .put('/api/clientes/id-invalido')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Qualquer' });

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────
// DELETE /api/clientes/:id
// ──────────────────────────────────────────────

describe('DELETE /api/clientes/:id', () => {
  it('remove o cliente com sucesso', async () => {
    const { token } = await criarTenantEToken();
    const cliente = await criarCliente(token);

    const res = await request(app)
      .delete(`/api/clientes/${cliente._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('cliente removido não aparece na listagem', async () => {
    const { token } = await criarTenantEToken();
    const cliente = await criarCliente(token);

    await request(app)
      .delete(`/api/clientes/${cliente._id}`)
      .set('Authorization', `Bearer ${token}`);

    const listagem = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`);

    expect(listagem.body.pagination.total).toBe(0);
  });

  it('retorna 404 ao eliminar cliente de outro tenant', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    const clienteB = await criarCliente(tokenB, { telefone: '920000003' });

    const res = await request(app)
      .delete(`/api/clientes/${clienteB._id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('retorna 400 para ObjectId inválido', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .delete('/api/clientes/id-invalido')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────
// POST /api/clientes — Conflito de telefone (400)
// ──────────────────────────────────────────────

describe('POST /api/clientes — conflito de telefone', () => {
  it('retorna 400 ao criar cliente com telefone duplicado no mesmo tenant', async () => {
    const { token } = await criarTenantEToken();

    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Original', telefone: '910000099' });

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Duplicado', telefone: '910000099' });

    expect(res.status).toBe(400);
  });

  it('permite o mesmo telefone em tenants diferentes', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    const resA = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Cliente A', telefone: '910000099' });

    const resB = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nome: 'Cliente B', telefone: '910000099' });

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });
});
