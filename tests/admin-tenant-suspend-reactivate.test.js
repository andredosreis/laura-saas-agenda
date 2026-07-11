import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import { auditMiddleware } from '../src/modules/admin/auditMiddleware.js';
import { requirePlan } from '../src/middlewares/auth.js';
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

// O `authenticate` reforçado revalida o utilizador na DB (findById + ativo).
// Tokens têm de referenciar utilizadores realmente persistidos, senão devolvem
// 401 antes de chegarem ao `requireSuperadmin`. Persistimos as identidades uma
// vez por teste (as colecções são limpas no afterEach anterior); os helpers de
// token continuam síncronos e podem ser chamados várias vezes por teste.
let superadminId;
let nonSuperUserId;
let nonSuperTenantId;

beforeEach(async () => {
  const superadmin = await User.createWithPassword({
    nome: 'Superadmin Teste',
    email: 'super@marcai.pt',
    password: 'Senha@Segura123',
    role: 'superadmin',
    emailVerificado: true,
  });
  superadminId = superadmin._id;

  const tenant = await Tenant.create({
    nome: 'Tenant Nao-Super',
    slug: 'tenant-nao-super',
    ativo: true,
    plano: { tipo: 'basico', status: 'ativo', dataInicio: new Date() },
  });
  nonSuperTenantId = tenant._id;

  const admin = await User.createWithPassword({
    tenantId: tenant._id,
    nome: 'Admin Nao-Super',
    email: 'admin-nao-super@marcai.pt',
    password: 'Senha@Segura123',
    role: 'admin',
    permissoes: User.getDefaultPermissions('admin'),
    emailVerificado: true,
  });
  nonSuperUserId = admin._id;
});

function superToken() {
  return jwt.sign(
    { userId: superadminId.toString(), email: 'super@marcai.pt', role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function userToken() {
  return jwt.sign(
    { userId: nonSuperUserId.toString(), tenantId: nonSuperTenantId.toString(), email: 'user@marcai.pt', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Builds the test app with admin routes AND a product route protected
 * by requirePlan to verify C2/C3 enforcement integration.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', authenticate, requireSuperadmin, auditMiddleware, adminRouter);

  // Simulated product route that staff would use — protected by requirePlan
  app.get(
    '/api/v1/clientes',
    authenticate,
    requirePlan('basico', 'pro', 'elite', 'custom'),
    (_req, res) => res.json({ success: true, data: [] })
  );

  app.use(errorHandler);
  return app;
}

/** Cria um tenant de fixture. */
async function seedTenant(overrides = {}) {
  return Tenant.create({
    nome: 'Clínica Teste',
    slug: `clinica-teste-${Date.now()}`,
    plano: { tipo: 'basico', status: 'ativo', dataInicio: new Date() },
    ...overrides,
  });
}

/** Cria um tenant + user associado para testes de enforcement. */
async function seedTenantWithUser() {
  const tenant = await seedTenant();
  const user = await User.createWithPassword({
    tenantId: tenant._id,
    email: `staff-${Date.now()}@clinica.pt`,
    password: 'Senha@Forte123',
    nome: 'Staff User',
    role: 'admin',
  });
  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, role: 'admin', tenantId: tenant._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, user, token };
}

describe('F08 — Suspend / Reactivate Tenant', () => {
  const app = buildApp();

  // -----------------------------------------------------------------------
  // C1 — Suspend
  // -----------------------------------------------------------------------
  describe('C1 — POST /tenants/:id/suspender', () => {
    it('suspende tenant ativo → plano.status = suspenso + AuditLog com motivo', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({ motivo: 'Falta de pagamento' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('suspenso');

      // Verificar DB
      const updated = await Tenant.findById(tenant._id);
      expect(updated.plano.status).toBe('suspenso');

      // Verificar AuditLog
      const audit = await AuditLog.findOne({ action: 'tenant.suspend' });
      expect(audit).toBeTruthy();
      expect(audit.status).toBe('ok');
      expect(audit.before.status).toBe('ativo');
      expect(audit.after.status).toBe('suspenso');
      expect(audit.metadata.motivo).toBe('Falta de pagamento');
      expect(String(audit.targetTenantId)).toBe(String(tenant._id));
    });

    it('suspende tenant sem motivo — motivo não aparece no metadata', async () => {
      const tenant = await seedTenant();

      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({});

      expect(res.status).toBe(200);

      const audit = await AuditLog.findOne({ action: 'tenant.suspend' });
      expect(audit.metadata.motivo).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // C2 — Suspension blocks tenant (requirePlan enforcement)
  // -----------------------------------------------------------------------
  describe('C2 — Enforcement: tenant suspenso → staff bloqueado', () => {
    it('staff de tenant suspenso recebe 403 em rota de produto', async () => {
      const { tenant, token } = await seedTenantWithUser();

      // Verificar que o staff tem acesso antes da suspensão
      const before = await request(app)
        .get('/api/v1/clientes')
        .set('Authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);

      // Suspender o tenant
      await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({ motivo: 'Teste enforcement' });

      // Staff deve receber 403
      const after = await request(app)
        .get('/api/v1/clientes')
        .set('Authorization', `Bearer ${token}`);
      // Hardening (SEC-006): o bloqueio de um tenant suspenso passou a acontecer
      // no próprio authenticate (mais cedo e mais estrito que o requirePlan), com
      // uma mensagem genérica e sem expor planoStatus no corpo.
      expect(after.status).toBe(403);
      expect(after.body.success).toBe(false);
      expect(after.body.error).toBe('Empresa suspensa ou plano inactivo');
    });

    it('super-admin continua a conseguir gerir tenant suspenso', async () => {
      const tenant = await seedTenant();

      // Suspender
      await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({});

      // Super-admin ainda pode ver o tenant (admin route)
      const detail = await request(app)
        .get(`/api/admin/tenants/${tenant._id}`)
        .set('Authorization', `Bearer ${superToken()}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.tenant.plano.status).toBe('suspenso');
    });
  });

  // -----------------------------------------------------------------------
  // C3 — Reactivate
  // -----------------------------------------------------------------------
  describe('C3 — POST /tenants/:id/reactivar', () => {
    it('reativa tenant suspenso → plano.status = ativo + AuditLog', async () => {
      const tenant = await seedTenant({ plano: { tipo: 'basico', status: 'suspenso' } });

      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/reactivar`)
        .set('Authorization', `Bearer ${superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ativo');

      // DB
      const updated = await Tenant.findById(tenant._id);
      expect(updated.plano.status).toBe('ativo');

      // AuditLog
      const audit = await AuditLog.findOne({ action: 'tenant.reactivate' });
      expect(audit).toBeTruthy();
      expect(audit.status).toBe('ok');
      expect(audit.before.status).toBe('suspenso');
      expect(audit.after.status).toBe('ativo');
    });

    it('staff recupera acesso após reactivação', async () => {
      const { tenant, token } = await seedTenantWithUser();

      // Suspender
      await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({});

      // Staff bloqueado
      const blocked = await request(app)
        .get('/api/v1/clientes')
        .set('Authorization', `Bearer ${token}`);
      expect(blocked.status).toBe(403);

      // Reactivar
      await request(app)
        .post(`/api/admin/tenants/${tenant._id}/reactivar`)
        .set('Authorization', `Bearer ${superToken()}`);

      // Staff recupera acesso
      const restored = await request(app)
        .get('/api/v1/clientes')
        .set('Authorization', `Bearer ${token}`);
      expect(restored.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // C4 — Idempotent
  // -----------------------------------------------------------------------
  describe('C4 — Idempotente', () => {
    it('suspender tenant já suspenso → sucesso + auditado', async () => {
      const tenant = await seedTenant({ plano: { tipo: 'basico', status: 'suspenso' } });

      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('suspenso');

      // DB permanece suspenso
      const updated = await Tenant.findById(tenant._id);
      expect(updated.plano.status).toBe('suspenso');

      // Auditado mesmo sendo idempotente
      const audit = await AuditLog.findOne({ action: 'tenant.suspend' });
      expect(audit).toBeTruthy();
      expect(audit.before.status).toBe('suspenso');
      expect(audit.after.status).toBe('suspenso');
    });

    it('reactivar tenant já ativo → sucesso + auditado', async () => {
      const tenant = await seedTenant(); // status = 'ativo'

      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/reactivar`)
        .set('Authorization', `Bearer ${superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ativo');

      const audit = await AuditLog.findOne({ action: 'tenant.reactivate' });
      expect(audit).toBeTruthy();
      expect(audit.before.status).toBe('ativo');
      expect(audit.after.status).toBe('ativo');
    });
  });

  // -----------------------------------------------------------------------
  // C5 — Not found / hidden
  // -----------------------------------------------------------------------
  describe('C5 — Not found / hidden', () => {
    it('ID inválido → 400 (suspender)', async () => {
      const res = await request(app)
        .post('/api/admin/tenants/invalid-id/suspender')
        .set('Authorization', `Bearer ${superToken()}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('ID inválido → 400 (reactivar)', async () => {
      const res = await request(app)
        .post('/api/admin/tenants/invalid-id/reactivar')
        .set('Authorization', `Bearer ${superToken()}`);
      expect(res.status).toBe(400);
    });

    it('tenant inexistente → 404 (suspender)', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/admin/tenants/${fakeId}/suspender`)
        .set('Authorization', `Bearer ${superToken()}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('tenant inexistente → 404 (reactivar)', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/admin/tenants/${fakeId}/reactivar`)
        .set('Authorization', `Bearer ${superToken()}`);
      expect(res.status).toBe(404);
    });

    it('não-superadmin → 404 (suspender)', async () => {
      const tenant = await seedTenant();
      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/suspender`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('não-superadmin → 404 (reactivar)', async () => {
      const tenant = await seedTenant();
      const res = await request(app)
        .post(`/api/admin/tenants/${tenant._id}/reactivar`)
        .set('Authorization', `Bearer ${userToken()}`);
      expect(res.status).toBe(404);
    });
  });
});
