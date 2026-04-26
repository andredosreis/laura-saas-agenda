import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function tokenAdmin() {
  const tenant = await Tenant.create({
    nome: 'Zod Salon',
    slug: 'zod-salon',
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin',
    email: 'admin@zod.pt',
    passwordHash: 'hash',
    role: 'admin',
    emailVerificado: true,
  });
  return jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Testes que provam que o middleware Zod valida correctamente cenários
// que antes eram tratados com if/else manuais (ou nem eram tratados).

describe('Zod validation — POST /api/clientes', () => {
  it('rejeita body sem nome com 400 e mensagem específica', async () => {
    const token = await tokenAdmin();

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '910000001' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/nome/i);
  });

  it('normaliza telefone formatado (remove espaços e traços)', async () => {
    const token = await tokenAdmin();

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Ana', telefone: '910-000-001' });

    expect(res.status).toBe(201);
    expect(res.body.data.telefone).toBe('910000001');
  });

  it('rejeita campo extra não declarado no schema (strict mode)', async () => {
    const token = await tokenAdmin();

    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Ana', telefone: '910000001', hackField: 'malicious' });

    expect(res.status).toBe(400);
  });
});

