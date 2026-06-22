import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import { auditMiddleware } from '../src/modules/admin/auditMiddleware.js';
import { adminMutation } from '../src/modules/admin/adminMutation.js';
import errorHandler from '../src/middlewares/errorHandler.js';
import AuditLog from '../src/models/AuditLog.js';
import Tenant from '../src/models/Tenant.js';

// Transações exigem replica set — o MongoMemoryServer standalone partilhado
// (tests/setup.js) não as suporta. Setup próprio, isolado das outras 40+
// suites (F05 / ADR-024 Fase 3).
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

function superToken() {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), email: 'super@marcai.pt', role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// App mínima que exercita o pipeline real: authenticate → requireSuperadmin →
// auditMiddleware → adminMutation. As rotas abaixo simulam o que F06/F07/F08
// vão construir sobre esta factory (mutação de control-plane: Tenant).
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', authenticate, requireSuperadmin, auditMiddleware);

  app.post(
    '/api/admin/tenants/:id/suspender',
    adminMutation('tenant.suspend', async (req, { session }) => {
      const tenant = await Tenant.findById(req.params.id).session(session);
      const before = { status: tenant.plano.status };
      tenant.plano.status = 'suspenso';
      await tenant.save({ session });
      return { data: tenant, targetTenantId: tenant._id, before, after: { status: 'suspenso' } };
    })
  );

  app.post(
    '/api/admin/tenants/:id/falhar',
    adminMutation('tenant.fail', async (req, { session }) => {
      const tenant = await Tenant.findById(req.params.id).session(session);
      tenant.plano.status = 'suspenso'; // alteração que TEM de ser revertida
      await tenant.save({ session });
      throw new Error('falha de negócio simulada');
    })
  );

  app.use(errorHandler);
  return app;
}

describe('adminMutation — factory de mutação auditada (F05 / ADR-024 Fase 3)', () => {
  const app = buildApp();

  it('C1 — sucesso atómico: muda o Tenant E grava exactamente 1 AuditLog "ok" (sem duplicar)', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Mutation',
      slug: 'salao-mutation',
      plano: { tipo: 'pro', status: 'ativo' },
    });
    const token = superToken();
    const decoded = jwt.decode(token);

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/suspender`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const fresh = await Tenant.findById(tenant._id);
    expect(fresh.plano.status).toBe('suspenso');

    const entries = await AuditLog.find({});
    expect(entries).toHaveLength(1); // nenhuma duplicada pelo auditMiddleware (req.audit.committed)
    expect(entries[0].status).toBe('ok');
    expect(entries[0].action).toBe('tenant.suspend');
    expect(String(entries[0].actorUserId)).toBe(decoded.userId);
    expect(String(entries[0].targetTenantId)).toBe(String(tenant._id));
  });

  it('C2 — falha atómica: work() lança erro → nada é commitado + 1 AuditLog "error" + resposta não-2xx', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Falha',
      slug: 'salao-falha',
      plano: { tipo: 'pro', status: 'ativo' },
    });

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/falhar`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBeGreaterThanOrEqual(400);

    const fresh = await Tenant.findById(tenant._id);
    expect(fresh.plano.status).toBe('ativo'); // revertido — a transação abortou

    const entries = await AuditLog.find({});
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('error');
    expect(entries[0].action).toBe('tenant.fail');
  });

  it('C3 — falha do AuditLog dentro da transação desfaz a mutação (atomicidade)', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Audit Falha',
      slug: 'salao-audit-falha',
      plano: { tipo: 'pro', status: 'ativo' },
    });

    jest.spyOn(AuditLog, 'create').mockImplementationOnce(() => {
      throw new Error('escrita do audit falhou');
    });

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/suspender`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBeGreaterThanOrEqual(400);

    const fresh = await Tenant.findById(tenant._id);
    expect(fresh.plano.status).toBe('ativo'); // rollback — a mutação NÃO commitou

    const entries = await AuditLog.find({});
    expect(entries).toHaveLength(1); // best-effort, fora da transação
    expect(entries[0].status).toBe('error');
  });
});
