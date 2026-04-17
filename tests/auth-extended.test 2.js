import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const registoPayload = {
  nomeEmpresa: 'Salão Extensão',
  nome: 'Carlos Mota',
  email: 'carlos@extensao.pt',
  password: 'Senha@Segura123',
};

async function registarELogin() {
  await request(app).post('/api/auth/register').send(registoPayload);
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: registoPayload.email, password: registoPayload.password });
  return res.body.data.tokens;
}

// ──────────────────────────────────────────────
// REFRESH TOKEN
// ──────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('emite novo accessToken com refreshToken válido', async () => {
    const tokens = await registarELogin();

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
  });

  it('rejeita refreshToken inválido com 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'token-invalido' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejeita pedido sem refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// LOGOUT
// ──────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('faz logout com token válido', async () => {
    const tokens = await registarELogin();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejeita logout sem token de autenticação', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'qualquer' });

    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────
// FORGOT PASSWORD
// ──────────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('responde 200 para email registado (sem revelar existência)', async () => {
    await request(app).post('/api/auth/register').send(registoPayload);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: registoPayload.email });

    // 200 independentemente de o email existir ou não (segurança)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('responde 200 mesmo para email inexistente (não revelar)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'naoexiste@dominio.pt' });

    expect(res.status).toBe(200);
  });

  it('rejeita pedido sem campo email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// BLOQUEIO DE CONTA (5 tentativas → 423)
// ──────────────────────────────────────────────

describe('Bloqueio de conta após tentativas falhadas', () => {
  it('bloqueia conta com 423 após 5 tentativas inválidas', async () => {
    await request(app).post('/api/auth/register').send(registoPayload);

    // 5 tentativas falhadas consecutivas
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: registoPayload.email, password: 'senha-errada' });
    }

    // 6ª tentativa — deve estar bloqueada
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: registoPayload.email, password: registoPayload.password });

    expect(res.status).toBe(423);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// CHANGE PASSWORD
// ──────────────────────────────────────────────

describe('PUT /api/auth/password', () => {
  it('altera password com credenciais correctas', async () => {
    const tokens = await registarELogin();

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        currentPassword: registoPayload.password,
        newPassword: 'NovaSenha@456',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejeita alteração com password actual errada', async () => {
    const tokens = await registarELogin();

    const res = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        currentPassword: 'senha-errada',
        newPassword: 'NovaSenha@456',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  it('rejeita alteração sem autenticação', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({ passwordActual: 'qualquer', novaPassword: 'outra' });

    expect(res.status).toBe(401);
  });
});
