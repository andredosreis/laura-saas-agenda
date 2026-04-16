import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarToken(slug = 'salon-mw') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    emailVerificado: true,
  });
  return jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ──────────────────────────────────────────────
// Helmet — headers de segurança
// ──────────────────────────────────────────────

describe('Segurança: headers HTTP (Helmet)', () => {
  it('remove o header X-Powered-By', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('inclui X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('inclui X-Frame-Options', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// Autenticação — authenticate middleware
// ──────────────────────────────────────────────

describe('Middleware: authenticate', () => {
  it('rejeita pedido sem token com 401', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejeita token malformado com 401', async () => {
    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('aceita token válido e retorna 200', async () => {
    const token = await criarToken();
    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────
// errorHandler — categorização de erros
// ──────────────────────────────────────────────

describe('Middleware: errorHandler — CastError (ID inválido)', () => {
  it('retorna 400 com success:false para ID inválido em agendamentos', async () => {
    const token = await criarToken('salon-cast');
    const res = await request(app)
      .get('/api/agendamentos/id-invalido')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('retorna 400 com success:false para ID inválido em clientes', async () => {
    const token = await criarToken('salon-cast2');
    const res = await request(app)
      .get('/api/clientes/id-invalido')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Middleware: errorHandler — resposta de erro segue contrato', () => {
  it('erros têm { success: false, error: string } — não expõe stack trace', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body).not.toHaveProperty('stack');
    expect(res.body).not.toHaveProperty('message');
  });
});
