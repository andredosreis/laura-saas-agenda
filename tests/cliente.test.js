import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

// Helper: criar tenant + user de teste e gerar token
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

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('GET /api/clientes — Paginação', () => {
  it('retorna formato paginado com lista vazia', async () => {
    const { token } = await criarTenantEToken();

    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: [],
      pagination: {
        total: 0,
        page: 1,
        pages: 0,
        limit: 20,
      },
    });
  });

  it('respeita parâmetros ?page e ?limit', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .get('/api/clientes?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.page).toBe(1);
  });

  it('limit máximo é 100', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .get('/api/clientes?limit=9999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
  });

  it('rejeita pedido sem autenticação com 401', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/clientes', () => {
  it('cria um cliente e retorna 201', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Maria Silva', telefone: '912345678' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nome: 'Maria Silva', telefone: '912345678' });
  });

  it('retorna o cliente criado na listagem paginada', async () => {
    const { token } = await criarTenantEToken();
    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'João Santos', telefone: '923456789' });

    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].nome).toBe('João Santos');
  });
});
