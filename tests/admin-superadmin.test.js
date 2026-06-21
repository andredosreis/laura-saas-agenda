import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import AuditLog from '../src/models/AuditLog.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// App mínima que exercita os middlewares REAIS (authenticate + requireSuperadmin)
// num pipeline Express real, sem tocar no routing de produção (app.js).
function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/admin/ping', authenticate, requireSuperadmin, (req, res) => {
    res.json({ success: true, data: { pong: true } });
  });
  return app;
}

function tokenComRole(role, extra = {}) {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), role, ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// ──────────────────────────────────────────────
// requireSuperadmin — fronteira de segurança crítica (ADR-024)
// ──────────────────────────────────────────────

describe('Middleware: requireSuperadmin', () => {
  const app = buildApp();

  it('rejeita pedido sem token com 401', async () => {
    const res = await request(app).get('/api/admin/ping');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejeita user admin (não superadmin) com 404 — não revela a superfície', async () => {
    const res = await request(app)
      .get('/api/admin/ping')
      .set('Authorization', `Bearer ${tokenComRole('admin', { tenantId: new mongoose.Types.ObjectId().toString() })}`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('rejeita todas as roles de tenant com 404', async () => {
    for (const role of ['admin', 'gerente', 'recepcionista', 'terapeuta']) {
      const res = await request(app)
        .get('/api/admin/ping')
        .set('Authorization', `Bearer ${tokenComRole(role, { tenantId: new mongoose.Types.ObjectId().toString() })}`);
      expect(res.status).toBe(404);
    }
  });

  it('permite superadmin (global, sem tenantId) com 200', async () => {
    const res = await request(app)
      .get('/api/admin/ping')
      .set('Authorization', `Bearer ${tokenComRole('superadmin')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pong).toBe(true);
  });

  it('audita a negação no AuditLog com status "denied"', async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    await request(app)
      .get('/api/admin/ping')
      .set('Authorization', `Bearer ${tokenComRole('gerente', { tenantId: new mongoose.Types.ObjectId().toString(), userId })}`);

    const entries = await AuditLog.find({ status: 'denied' });
    expect(entries).toHaveLength(1);
    expect(entries[0].actorUserId.toString()).toBe(userId);
    expect(entries[0].metadata.path).toBe('/api/admin/ping');
  });
});

// ──────────────────────────────────────────────
// AuditLog — registo imutável de acções super-admin
// ──────────────────────────────────────────────

describe('Model: AuditLog', () => {
  it('record() cria uma entrada de auditoria', async () => {
    const actorUserId = new mongoose.Types.ObjectId();
    const targetTenantId = new mongoose.Types.ObjectId();
    const entry = await AuditLog.record({
      actorUserId,
      actorEmail: 'super@marcai.pt',
      action: 'tenant.suspend',
      targetTenantId,
      metadata: { motivo: 'falta de pagamento' },
      ip: '127.0.0.1',
    });
    expect(entry._id).toBeDefined();
    expect(entry.action).toBe('tenant.suspend');
    expect(entry.metadata.motivo).toBe('falta de pagamento');
    expect(entry.createdAt).toBeDefined();
  });

  it('é imutável — só tem createdAt, sem updatedAt', async () => {
    const entry = await AuditLog.record({
      actorUserId: new mongoose.Types.ObjectId(),
      action: 'tenant.view',
    });
    expect(entry.createdAt).toBeDefined();
    expect(entry.updatedAt).toBeUndefined();
  });

  it('exige actorUserId e action', async () => {
    await expect(
      AuditLog.create({ action: 'tenant.view' })
    ).rejects.toThrow();
    await expect(
      AuditLog.create({ actorUserId: new mongoose.Types.ObjectId() })
    ).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────
// AuditLog.status — distingue ok / denied / error (grilling ALTO 2)
// ──────────────────────────────────────────────

describe('Model: AuditLog — status', () => {
  it('record() usa status "ok" por defeito', async () => {
    const entry = await AuditLog.record({
      actorUserId: new mongoose.Types.ObjectId(),
      action: 'tenant.view',
    });
    expect(entry.status).toBe('ok');
  });

  it('record() aceita status explícito (ex: denied)', async () => {
    const entry = await AuditLog.record({
      actorUserId: new mongoose.Types.ObjectId(),
      action: 'admin.denied',
      status: 'denied',
    });
    expect(entry.status).toBe('denied');
  });

  it('rejeita status fora do enum', async () => {
    await expect(
      AuditLog.create({
        actorUserId: new mongoose.Types.ObjectId(),
        action: 'tenant.view',
        status: 'bogus',
      })
    ).rejects.toThrow();
  });
});
