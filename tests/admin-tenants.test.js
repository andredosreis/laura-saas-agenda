import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

function superToken() {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), email: 'super@marcai.pt', role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function tenantToken(role = 'admin') {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), tenantId: new mongoose.Types.ObjectId().toString(), role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function seedTenants(n) {
  await Promise.all(
    Array.from({ length: n }, (_, i) =>
      Tenant.create({ nome: `Salão ${i}`, slug: `salao-${i}`, plano: { tipo: 'pro', status: 'ativo' } })
    )
  );
}

describe('GET /api/v1/admin/tenants', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/v1/admin/tenants');
    expect(res.status).toBe(401);
  });

  it('404 para não-superadmin — não revela a superfície', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${tenantToken('admin')}`);
    expect(res.status).toBe(404);
  });

  it('superadmin lista os tenants paginados', async () => {
    await seedTenants(3);
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('responde também no alias legacy /api/admin/tenants', async () => {
    const res = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/admin/tenants/:id', () => {
  it('400 para ObjectId inválido', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/not-an-id')
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 para tenant inexistente', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(404);
  });

  it('superadmin vê o detalhe do tenant', async () => {
    const t = await Tenant.create({ nome: 'Salão X', slug: 'salao-x', plano: { tipo: 'elite', status: 'ativo' } });
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${t._id}`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenant.slug).toBe('salao-x');
    expect(res.body.data.totalUsuarios).toBe(0);
  });
});
