import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// Helper: criar tenant + user e gerar token JWT
async function criarTenantEToken(slug) {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: `Admin ${slug}`,
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

describe('Isolamento Multi-Tenant — Clientes', () => {
  it('tenant A não vê clientes do tenant B', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    // Tenant B cria um cliente
    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nome: 'Cliente Exclusivo B', telefone: '900000001' });

    // Tenant A não deve ver esse cliente
    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.data).toHaveLength(0);
  });

  it('tenant A vê apenas os seus próprios clientes', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    // Tenant A cria 2 clientes; Tenant B cria 1
    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Cliente A1', telefone: '910000001' });
    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Cliente A2', telefone: '910000002' });
    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nome: 'Cliente B1', telefone: '920000001' });

    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.data.map((c) => c.nome)).toEqual(
      expect.arrayContaining(['Cliente A1', 'Cliente A2'])
    );
    expect(res.body.data.map((c) => c.nome)).not.toContain('Cliente B1');
  });
});

describe('Isolamento Multi-Tenant — Agendamentos', () => {
  it('tenant A não vê agendamentos do tenant B', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    // Tenant B cria um agendamento
    // Primeiro cria um cliente no tenant B
    const clienteRes = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nome: 'Cliente B', telefone: '920000099' });

    await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        clienteId: clienteRes.body._id,
        servico: 'Corte',
        data: new Date(Date.now() + 86400000).toISOString(),
        duracao: 60,
        preco: 25,
      });

    // Tenant A não deve ver agendamentos do B
    const res = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(0);
  });
});

describe('Isolamento Multi-Tenant — Acesso directo por ID', () => {
  it('tenant A não consegue aceder ao cliente do tenant B por ID', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-a');
    const { token: tokenB } = await criarTenantEToken('salon-b');

    // Tenant B cria um cliente e obtém o ID
    const criarRes = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nome: 'Cliente Secreto B', telefone: '930000001' });

    const clienteIdB = criarRes.body._id;
    expect(clienteIdB).toBeDefined();

    // Tenant A tenta aceder a esse cliente por ID
    const res = await request(app)
      .get(`/api/clientes/${clienteIdB}`)
      .set('Authorization', `Bearer ${tokenA}`);

    // Deve falhar: 404 (não existe no contexto do tenant A) ou 403
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
