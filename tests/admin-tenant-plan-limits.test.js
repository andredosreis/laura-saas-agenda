import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import { auditMiddleware } from '../src/modules/admin/auditMiddleware.js';
import adminRouter from '../src/modules/admin/adminRoutes.js';
import errorHandler from '../src/middlewares/errorHandler.js';
import AuditLog from '../src/models/AuditLog.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// O `authenticate` (hardened) revalida `User.findById(decoded.userId)` — e, para
// não-superadmin, exige um Tenant persistido com plano ativo/trial. Os tokens têm
// de corresponder a utilizadores REAIS. Email/slug únicos por chamada (tokenSeq)
// evitam colisão nos índices únicos.
let tokenSeq = 0;
async function superToken() {
  tokenSeq += 1;
  const user = await User.create({
    nome: 'Superadmin Teste',
    email: `super-${tokenSeq}@marcai.pt`,
    passwordHash: 'hash-placeholder',
    role: 'superadmin',
    ativo: true,
    emailVerificado: true,
    permissoes: User.getDefaultPermissions('superadmin'),
  });
  return jwt.sign(
    { userId: user._id, email: user.email, role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function userToken() {
  tokenSeq += 1;
  const tenant = await Tenant.create({
    nome: `Tenant admin ${tokenSeq}`,
    slug: `tenant-admin-${tokenSeq}`,
    ativo: true,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'User admin',
    email: `admin-${tokenSeq}@marcai.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    ativo: true,
    emailVerificado: true,
    permissoes: User.getDefaultPermissions('admin'),
  });
  return jwt.sign(
    { userId: user._id, tenantId: tenant._id, email: user.email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', authenticate, requireSuperadmin, auditMiddleware, adminRouter);
  app.use(errorHandler);
  return app;
}

/** Cria um tenant de fixture para os testes de PUT. */
async function seedTenant(overrides = {}) {
  return Tenant.create({
    nome: 'Clínica Teste',
    slug: `clinica-teste-${Date.now()}`,
    plano: { tipo: 'basico', status: 'trial', dataInicio: new Date() },
    ...overrides,
  });
}

describe('F07 — Configure Tenant Plan, Limits & Feature Flags', () => {
  const app = buildApp();

  // -----------------------------------------------------------------------
  // C1 — Update plan type/expiry
  // -----------------------------------------------------------------------
  describe('C1 — PUT /tenants/:id/plano', () => {
    it('atualiza tipo e dataExpiracao + cria AuditLog com before/after', async () => {
      const tenant = await seedTenant();
      const expiry = '2027-01-15T00:00:00.000Z';

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/plano`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ tipo: 'elite', dataExpiracao: expiry });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plano.tipo).toBe('elite');

      // Verificar persistência na DB
      const updated = await Tenant.findById(tenant._id);
      expect(updated.plano.tipo).toBe('elite');
      expect(updated.plano.dataExpiracao.toISOString()).toBe(expiry);

      // Verificar AuditLog
      const audit = await AuditLog.findOne({ action: 'tenant.plano.update' });
      expect(audit).toBeTruthy();
      expect(audit.status).toBe('ok');
      expect(audit.before.tipo).toBe('basico');
      expect(audit.after.tipo).toBe('elite');
      expect(String(audit.targetTenantId)).toBe(String(tenant._id));
    });

    it('atualiza só tipo sem dataExpiracao', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/plano`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ tipo: 'pro' });

      expect(res.status).toBe(200);

      const updated = await Tenant.findById(tenant._id);
      expect(updated.plano.tipo).toBe('pro');
    });
  });

  // -----------------------------------------------------------------------
  // C2 — Update limits & flags
  // -----------------------------------------------------------------------
  describe('C2 — PUT /tenants/:id/limites', () => {
    it('atualiza limites numéricos e flags + cria AuditLog com before/after', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/limites`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ maxClientes: 500, iaAtiva: true, maxLeads: -1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.limites.maxClientes).toBe(500);
      expect(res.body.data.limites.iaAtiva).toBe(true);
      expect(res.body.data.limites.maxLeads).toBe(-1);

      // Verificar persistência
      const updated = await Tenant.findById(tenant._id);
      expect(updated.limites.maxClientes).toBe(500);
      expect(updated.limites.iaAtiva).toBe(true);
      expect(updated.limites.maxLeads).toBe(-1);

      // Verificar AuditLog
      const audit = await AuditLog.findOne({ action: 'tenant.limites.update' });
      expect(audit).toBeTruthy();
      expect(audit.status).toBe('ok');
      expect(audit.before.maxClientes).toBe(50); // default
      expect(audit.after.maxClientes).toBe(500);
      expect(audit.before.iaAtiva).toBe(false); // default
      expect(audit.after.iaAtiva).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // C3 — Validation
  // -----------------------------------------------------------------------
  describe('C3 — Validação', () => {
    it('rejeita tipo fora do enum → 400', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/plano`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ tipo: 'inexistente' });

      expect(res.status).toBe(400);

      // Nada foi alterado
      const unchanged = await Tenant.findById(tenant._id);
      expect(unchanged.plano.tipo).toBe('basico');
    });

    it('rejeita limite < -1 → 400', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/limites`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ maxClientes: -5 });

      expect(res.status).toBe(400);
    });

    it('rejeita flag não-booleana → 400', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/limites`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ iaAtiva: 'sim' });

      expect(res.status).toBe(400);
    });

    it('rejeita body vazio (nenhum campo) → 400', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/plano`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // C4 — No mass assignment / no status change
  // -----------------------------------------------------------------------
  describe('C4 — Mass-assignment protection', () => {
    it('ignora plano.status, tenantId e campos extra no body do plano', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/plano`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ tipo: 'pro', status: 'ativo', tenantId: 'hack', preco: 999 });

      expect(res.status).toBe(200);

      const updated = await Tenant.findById(tenant._id);
      expect(updated.plano.tipo).toBe('pro');
      expect(updated.plano.status).toBe('trial'); // NÃO mudou
      expect(updated.plano.preco).toBe(49); // NÃO mudou
    });

    it('ignora campos extra no body de limites', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/limites`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ maxClientes: 200, tenantId: 'hack', nome: 'Hack' });

      expect(res.status).toBe(200);

      const updated = await Tenant.findById(tenant._id);
      expect(updated.limites.maxClientes).toBe(200);
      expect(updated.nome).toBe('Clínica Teste'); // NÃO mudou
    });
  });

  // -----------------------------------------------------------------------
  // C5 — Not found / hidden
  // -----------------------------------------------------------------------
  describe('C5 — Not found / hidden', () => {
    it('ID inválido → 400 (plano)', async () => {
      const res = await request(app)
        .put('/api/admin/tenants/invalid-id/plano')
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ tipo: 'pro' });

      expect(res.status).toBe(400);
    });

    it('ID inválido → 400 (limites)', async () => {
      const res = await request(app)
        .put('/api/admin/tenants/invalid-id/limites')
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ maxClientes: 100 });

      expect(res.status).toBe(400);
    });

    it('tenant inexistente → 404 (plano)', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .put(`/api/admin/tenants/${fakeId}/plano`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ tipo: 'pro' });

      expect(res.status).toBe(404);
    });

    it('tenant inexistente → 404 (limites)', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const res = await request(app)
        .put(`/api/admin/tenants/${fakeId}/limites`)
        .set('Authorization', `Bearer ${await superToken()}`)
        .send({ maxClientes: 100 });

      expect(res.status).toBe(404);
    });

    it('não-superadmin → 404 (plano)', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/plano`)
        .set('Authorization', `Bearer ${await userToken()}`)
        .send({ tipo: 'pro' });

      expect(res.status).toBe(404);
    });

    it('não-superadmin → 404 (limites)', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .put(`/api/admin/tenants/${tenant._id}/limites`)
        .set('Authorization', `Bearer ${await userToken()}`)
        .send({ maxClientes: 100 });

      expect(res.status).toBe(404);
    });
  });
});
