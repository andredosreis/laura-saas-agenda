import request from 'supertest';
import app from '../src/app.js';
import User from '../src/models/User.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const superadminPayload = {
  email: 'super@marcai.pt',
  password: 'SenhaSuper@123',
};

async function criarSuperadmin() {
  return User.createWithPassword({
    email: superadminPayload.email,
    password: superadminPayload.password,
    nome: 'Super Admin',
    role: 'superadmin',
  });
}

describe('Superadmin sem tenantId — login/me/refresh', () => {
  it('User.createWithPassword aceita superadmin sem tenantId', async () => {
    const user = await criarSuperadmin();
    expect(user.tenantId).toBeUndefined();
    expect(user.role).toBe('superadmin');
  });

  it('rejeita admin/gerente/recepcionista/terapeuta sem tenantId', async () => {
    await expect(
      User.createWithPassword({
        email: 'sem-tenant@aurora.pt',
        password: 'Senha@Segura123',
        nome: 'Sem Tenant',
        role: 'admin',
      })
    ).rejects.toThrow();
  });

  describe('POST /api/auth/login', () => {
    it('autentica superadmin e devolve um tenant virtual', async () => {
      await criarSuperadmin();

      const res = await request(app).post('/api/auth/login').send(superadminPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('superadmin');
      expect(res.body.data.tenant.slug).toBe('admin');
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');
    });
  });

  describe('GET /api/auth/me', () => {
    it('retorna o tenant virtual para um superadmin autenticado', async () => {
      await criarSuperadmin();
      const login = await request(app).post('/api/auth/login').send(superadminPayload);
      const token = login.body.data.tokens.accessToken;

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('superadmin');
      expect(res.body.data.tenant.slug).toBe('admin');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('renova os tokens de um superadmin sem precisar de tenant real', async () => {
      await criarSuperadmin();
      const login = await request(app).post('/api/auth/login').send(superadminPayload);
      const refreshToken = login.body.data.tokens.refreshToken;

      const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens).toHaveProperty('accessToken');
      expect(res.body.data.tokens).toHaveProperty('refreshToken');
    });
  });
});
