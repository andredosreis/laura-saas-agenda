import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import { auditMiddleware } from '../src/modules/admin/auditMiddleware.js';
import AuditLog from '../src/models/AuditLog.js';
import User from '../src/models/User.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// O `authenticate` (hardened) revalida `User.findById(decoded.userId)`, pelo que
// o token tem de corresponder a um superadmin REAL persistido. Email único por
// chamada (tokenSeq) evita colisão no índice único { tenantId, email }.
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

// App mínima que exercita o pipeline real: authenticate → requireSuperadmin → auditMiddleware.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', authenticate, requireSuperadmin, auditMiddleware);

  app.get('/api/admin/tenants', (req, res) => {
    req.audit.set({ action: 'tenant.list', metadata: { count: 0 } });
    res.json({ success: true, data: [] });
  });
  app.get('/api/admin/plain', (req, res) => {
    res.json({ success: true, data: {} }); // sem enrich → action derivada de METHOD+path
  });
  app.get('/api/admin/committed', (req, res) => {
    req.audit.committed = true; // simula mutação que já auditou na transação (A3)
    res.json({ success: true, data: {} });
  });
  return app;
}

// O audit do read-path é escrito em res.on('finish') (pós-resposta). Esperamos
// a entrada de forma determinística (poll com limite), sem depender de timing.
async function waitForAudit(filter = {}, ms = 1500) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = await AuditLog.find(filter);
    if (found.length) return found;
    await new Promise((r) => setTimeout(r, 10));
  }
  return AuditLog.find(filter);
}

describe('auditMiddleware — read-path do Gate 2', () => {
  const app = buildApp();

  it('grava entrada "ok" com a action enriquecida pelo handler', async () => {
    await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${await superToken()}`)
      .expect(200);

    const [entry] = await waitForAudit({ action: 'tenant.list' });
    expect(entry).toBeDefined();
    expect(entry.status).toBe('ok');
    expect(entry.metadata.count).toBe(0);
  });

  it('NÃO duplica quando req.audit.committed = true (a cola entre os gates)', async () => {
    await request(app)
      .get('/api/admin/committed')
      .set('Authorization', `Bearer ${await superToken()}`)
      .expect(200);

    // dá folga a um eventual finish-write indevido antes de afirmar o zero
    await new Promise((r) => setTimeout(r, 100));
    const all = await AuditLog.find({});
    expect(all).toHaveLength(0);
  });

  it('deriva a action de METHOD+URL quando o handler não enriquece', async () => {
    await request(app)
      .get('/api/admin/plain')
      .set('Authorization', `Bearer ${await superToken()}`)
      .expect(200);

    const [entry] = await waitForAudit({ action: 'GET /api/admin/plain' });
    expect(entry).toBeDefined();
    expect(entry.status).toBe('ok');
  });
});
