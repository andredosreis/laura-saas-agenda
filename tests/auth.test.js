import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const registoPayload = {
  nomeEmpresa: 'Estética Aurora',
  nome: 'Ana Lima',
  email: 'ana@aurora.pt',
  password: 'Senha@Segura123',
};

describe('POST /api/auth/register', () => {
  it('regista um utilizador com sucesso e retorna tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(registoPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('ana@aurora.pt');
    expect(res.body.data.tenant.nome).toBe('Estética Aurora');
  });

  it('rejeita registo com email duplicado no mesmo tenant', async () => {
    await request(app).post('/api/auth/register').send(registoPayload);
    const res = await request(app).post('/api/auth/register').send(registoPayload);
    // Segundo registo com mesmo email deve falhar
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(registoPayload);
  });

  it('faz login com credenciais correctas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: registoPayload.email, password: registoPayload.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
  });

  it('rejeita login com password errada', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: registoPayload.email, password: 'senha-errada' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('rejeita login com email inexistente', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'naoexiste@aurora.pt', password: registoPayload.password });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/auth/me', () => {
  it('retorna dados do utilizador autenticado', async () => {
    const reg = await request(app).post('/api/auth/register').send(registoPayload);
    const token = reg.body.data.tokens.accessToken;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(registoPayload.email);
  });

  it('rejeita pedido sem token com 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
