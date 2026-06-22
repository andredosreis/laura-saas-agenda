import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import { closeTenantDBAdmin } from '../src/modules/admin/getTenantDBAdmin.js';

beforeAll(async () => {
  await setupTestDB();
  // O acessor RO aponta ao MESMO memory-server. NÃO é fail-open: continua uma
  // createConnection separada e fail-closed. O memory-server não impõe o read-only
  // (isso prova-se em staging com a credencial real) — este teste cobre só a
  // FUNCIONALIDADE das métricas, não o enforcement RO.
  process.env.MONGO_TENANT_RO_URI = process.env.MONGODB_URI;
});
afterAll(async () => {
  await closeTenantDBAdmin();
  await teardownTestDB();
});
beforeEach(clearDB);

function superToken() {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), email: 'super@marcai.pt', role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function tenantToken() {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), tenantId: new mongoose.Types.ObjectId().toString(), role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Fixture: insere docs crus (sem validação de schema) na DB do tenant, via a
// conexão de produto (RW). Cada teste usa um tenant novo → DB tenant_<id> fresca.
async function seed(tenantId, { clientes = 0, agendamentos = 0, mensagens = 0 }) {
  const { Cliente, Agendamento, Mensagem } = getModels(getTenantDB(tenantId));
  const ins = (model, n) =>
    n ? model.collection.insertMany(Array.from({ length: n }, () => ({ tenantId, _seed: true }))) : null;
  await Promise.all([ins(Cliente, clientes), ins(Agendamento, agendamentos), ins(Mensagem, mensagens)].filter(Boolean));
}

describe('GET /api/v1/admin/tenants/:id/uso', () => {
  it('404 para não-superadmin', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${new mongoose.Types.ObjectId()}/uso`)
      .set('Authorization', `Bearer ${tenantToken()}`);
    expect(res.status).toBe(404);
  });

  it('400 para ObjectId inválido', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/not-an-id/uso')
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 para tenant inexistente', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${new mongoose.Types.ObjectId()}/uso`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(404);
  });

  it('superadmin vê as métricas de uso do tenant (via getTenantDBAdmin read-only)', async () => {
    const t = await Tenant.create({ nome: 'Salão Uso', slug: 'salao-uso', plano: { tipo: 'pro', status: 'ativo' } });
    await seed(t._id.toString(), { clientes: 3, agendamentos: 2, mensagens: 5 });

    const res = await request(app)
      .get(`/api/v1/admin/tenants/${t._id}/uso`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ clientes: 3, agendamentos: 2, mensagens: 5 });
  });
});
