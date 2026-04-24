import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// Verifica que /api/* e /api/v1/* respondem identicamente (dual-mount).
// Basta um recurso representativo — a lógica é a mesma router em ambos os paths.

describe('API versioning — dual-mount /api + /api/v1', () => {
  it('rotas protegidas servem o mesmo controller em ambos os paths', async () => {
    const tenant = await Tenant.create({
      nome: 'Versioning Salon',
      slug: 'versioning-salon',
      plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
    });
    const user = await User.create({
      tenantId: tenant._id,
      nome: 'Admin',
      email: 'admin@versioning.pt',
      passwordHash: 'hash-placeholder',
      role: 'admin',
      emailVerificado: true,
    });
    const token = jwt.sign(
      { userId: user._id, tenantId: tenant._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const legacy = await request(app)
      .get('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`);
    const v1 = await request(app)
      .get('/api/v1/agendamentos')
      .set('Authorization', `Bearer ${token}`);

    expect(legacy.status).toBe(200);
    expect(v1.status).toBe(200);
    expect(v1.body.success).toBe(legacy.body.success);
  });
});
