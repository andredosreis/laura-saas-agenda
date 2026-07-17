import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import { auditMiddleware } from '../src/modules/admin/auditMiddleware.js';
import adminRouter from '../src/modules/admin/adminRoutes.js';
import errorHandler from '../src/middlewares/errorHandler.js';
import AuditLog from '../src/models/AuditLog.js';
import User from '../src/models/User.js';
import Tenant from '../src/models/Tenant.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
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
    nome: `Tenant audit ${tokenSeq}`,
    slug: `tenant-audit-${tokenSeq}`,
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

/** Preenche o DB com entries de auditoria para teste. */
async function seedAuditLogs() {
  const actor1 = new mongoose.Types.ObjectId();
  const actor2 = new mongoose.Types.ObjectId();
  const tenant1 = new mongoose.Types.ObjectId();
  const tenant2 = new mongoose.Types.ObjectId();

  const now = Date.now();

  const entries = [
    {
      actorUserId: actor1,
      actorEmail: 'admin@tenant1.pt',
      action: 'tenant.create',
      targetTenantId: tenant1,
      status: 'ok',
      createdAt: new Date(now - 100000), // oldest
    },
    {
      actorUserId: actor1,
      actorEmail: 'admin@tenant1.pt',
      action: 'tenant.suspend',
      targetTenantId: tenant1,
      status: 'ok',
      createdAt: new Date(now - 80000),
    },
    {
      actorUserId: actor2,
      actorEmail: 'super@marcai.pt',
      action: 'tenant.reactivate',
      targetTenantId: tenant2,
      status: 'error',
      createdAt: new Date(now - 60000),
    },
    {
      actorUserId: actor2,
      actorEmail: 'super@marcai.pt',
      action: 'tenant.view',
      targetTenantId: tenant2,
      status: 'denied',
      createdAt: new Date(now - 40000),
    },
    {
      actorUserId: actor2,
      actorEmail: 'super@marcai.pt',
      action: 'tenant.list',
      targetTenantId: null, // Global
      status: 'ok',
      createdAt: new Date(now - 20000), // newest
    },
  ];

  await AuditLog.insertMany(entries);

  return { actor1, actor2, tenant1, tenant2 };
}

describe('F09 — Audit Log Viewer', () => {
  const app = buildApp();

  describe('C1 — Paginated list', () => {
    it('retorna entries paginadas, ordenadas por createdAt DESC (mais recentes 1º)', async () => {
      await seedAuditLogs();

      const res = await request(app)
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(5);
      expect(res.body.pagination.total).toBe(5);

      // Ordem DESC: a primeira (index 0) deve ser 'tenant.list' (a mais recente)
      expect(res.body.data[0].action).toBe('tenant.list');
      // A última (index 4) deve ser 'tenant.create' (a mais antiga)
      expect(res.body.data[4].action).toBe('tenant.create');
    });

    it('aplica limit e page corretamente', async () => {
      await seedAuditLogs();

      const res = await request(app)
        .get('/api/admin/audit?limit=2&page=2')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.pages).toBe(3);

      // Página 2 (itens 2 e 3 na ordem DESC)
      expect(res.body.data[0].action).toBe('tenant.reactivate');
      expect(res.body.data[1].action).toBe('tenant.suspend');
    });

    // Regressão: sem page/limit no URL, os defaults do Zod têm de chegar ao
    // controller. Quando não chegavam, `limit` era NaN e o Mongo devolvia a
    // colecção inteira — o log de auditoria todo numa resposta.
    it('aplica o default de 20 por página quando page/limit são omitidos', async () => {
      await AuditLog.insertMany(
        Array.from({ length: 25 }, (_, i) => ({
          actorUserId: new mongoose.Types.ObjectId(),
          actorEmail: 'super@marcai.pt',
          action: `bulk.${i}`,
          status: 'ok',
          ip: '127.0.0.1',
        }))
      );

      const res = await request(app)
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(20);
      expect(res.body.pagination).toMatchObject({ total: 25, page: 1, limit: 20, pages: 2 });
    });
  });

  describe('C2 — Filters', () => {
    let ids;
    beforeEach(async () => {
      ids = await seedAuditLogs();
    });

    it('filtra por targetTenantId', async () => {
      const res = await request(app)
        .get(`/api/admin/audit?targetTenantId=${ids.tenant1}`)
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2); // tenant.create e tenant.suspend
      expect(res.body.data.every(d => String(d.targetTenantId) === String(ids.tenant1))).toBe(true);
    });

    it('filtra por actorUserId', async () => {
      const res = await request(app)
        .get(`/api/admin/audit?actorUserId=${ids.actor2}`)
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
      expect(res.body.data.every(d => String(d.actorUserId) === String(ids.actor2))).toBe(true);
    });

    it('filtra por action', async () => {
      const res = await request(app)
        .get('/api/admin/audit?action=tenant.suspend')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].action).toBe('tenant.suspend');
    });

    it('filtra por status', async () => {
      const res = await request(app)
        .get('/api/admin/audit?status=error')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].action).toBe('tenant.reactivate');
    });

    it('filtra por data (from e to)', async () => {
      const all = await AuditLog.find().sort({ createdAt: -1 });
      const mid1 = all[1].createdAt.toISOString(); // tenant.view
      const mid2 = all[3].createdAt.toISOString(); // tenant.suspend

      const res = await request(app)
        .get(`/api/admin/audit?from=${mid2}&to=${mid1}`)
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3); // view, reactivate, suspend
    });
  });

  describe('C3 — Read-only', () => {
    it('não existem rotas no painel para alterar AuditLogs', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      const [putRes, deleteRes, patchRes] = await Promise.all([
        request(app).put(`/api/admin/audit/${fakeId}`).set('Authorization', `Bearer ${await superToken()}`),
        request(app).delete(`/api/admin/audit/${fakeId}`).set('Authorization', `Bearer ${await superToken()}`),
        request(app).patch(`/api/admin/audit/${fakeId}`).set('Authorization', `Bearer ${await superToken()}`),
      ]);

      expect(putRes.status).toBe(404);
      expect(deleteRes.status).toBe(404);
      expect(patchRes.status).toBe(404);
    });
  });

  describe('C4 — Validation / hidden', () => {
    it('filtro inválido (bad ObjectId) → 400', async () => {
      const res = await request(app)
        .get('/api/admin/audit?targetTenantId=123-invalid')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('ID inválido');
    });

    it('filtro inválido (out-of-enum status) → 400', async () => {
      const res = await request(app)
        .get('/api/admin/audit?status=falhou')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('status: Invalid option: expected one of');
    });

    it('filtro inválido (bad date) → 400', async () => {
      const res = await request(app)
        .get('/api/admin/audit?from=2024-99-99')
        .set('Authorization', `Bearer ${await superToken()}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('data ISO válida');
    });

    it('não-super-admin → 404', async () => {
      const res = await request(app)
        .get('/api/admin/audit')
        .set('Authorization', `Bearer ${await userToken()}`);

      expect(res.status).toBe(404);
    });
  });
});
