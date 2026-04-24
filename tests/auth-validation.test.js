import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const validRegister = {
  nomeEmpresa: 'Clínica Zod',
  nome: 'Maria Ana',
  email: 'maria@zod.pt',
  password: 'Senha@Segura123',
};

describe('Zod validation — POST /api/auth/register (defesa em profundidade)', () => {
  it('rejeita tentativa de injectar role via body (mass assignment)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejeita tentativa de injectar tenantId via body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, tenantId: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(400);
  });

  it('rejeita tentativa de injectar emailVerificado via body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, emailVerificado: true });

    expect(res.status).toBe(400);
  });

  it('rejeita password fraca (apenas minúsculas)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, password: 'fracafraca' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/senha/i);
  });

  it('rejeita password sem caractere especial', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, password: 'Senha12345' });

    expect(res.status).toBe(400);
  });

  it('rejeita email mal formatado', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, email: 'nao-e-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('normaliza email para lowercase antes de guardar', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, email: 'MARIA@ZOD.PT' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('maria@zod.pt');
  });
});

describe('Zod validation — POST /api/auth/reset-password', () => {
  it('rejeita token com formato inválido (não hex)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'nao-sou-hex!!!', password: 'Senha@Segura123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token/i);
  });

  it('rejeita token com comprimento errado', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'abc123', password: 'Senha@Segura123' });

    expect(res.status).toBe(400);
  });
});
