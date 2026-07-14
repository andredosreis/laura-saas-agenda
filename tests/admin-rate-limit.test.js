/**
 * F13 — Dedicated Admin Rate Limiting (ADR-024 Guard #4).
 *
 * `adminLimiter` (src/middlewares/rateLimiter.js) protects src/modules/admin/
 * behind its own IP-keyed limiter, mounted BEFORE authenticate/requireSuperadmin
 * in adminRoutes.js — so unauthenticated probing of the cross-tenant surface is
 * throttled too, and denied-attempt audit-log spam stays bounded.
 *
 * `adminLimiter` itself uses `skip: isTestEnv` (house pattern, rateLimiter.js:3),
 * so under NODE_ENV=test it never actually limits — the rest of the Jest suite
 * (including admin-superadmin-sweep.test.js) is unaffected. To exercise real
 * 429 behaviour without weakening that production `skip`, this file uses
 * test-local mirror limiters (same shape/contract, tiny `limit`) instead of
 * flipping NODE_ENV around the real 300-request limiter.
 */
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { adminLimiter, ADMIN_RATE_LIMIT_MESSAGE } from '../src/middlewares/rateLimiter.js';
import { authenticate } from '../src/middlewares/auth.js';
import adminRouter from '../src/modules/admin/adminRoutes.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// Fonte única: o corpo do 429 vem do próprio módulo de produção (sem duplicação).
const CONTRACT_MESSAGE = ADMIN_RATE_LIMIT_MESSAGE;

// Mirror local — MESMA forma do adminLimiter de produção (windowMs, message,
// standardHeaders, legacyHeaders) mas com `limit` reduzido e sem `skip:isTestEnv`,
// para poder disparar um 429 real dentro da suite sem precisar de 300+ pedidos
// nem tocar no NODE_ENV/skip da instância de produção.
const buildMirrorLimiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    message: CONTRACT_MESSAGE,
    standardHeaders: true,
    legacyHeaders: false,
  });

describe('adminLimiter — export em rateLimiter.js', () => {
  it('é exportado como middleware (função) no estilo dos outros limiters', () => {
    expect(typeof adminLimiter).toBe('function');
  });

  it('está montado como o PRIMEIRO middleware do adminRouter — antes de authenticate/requireSuperadmin', () => {
    // Verificação estrutural (mesmo padrão do sweep test: introspecionar router.stack).
    // Reference equality: adminRoutes.js e este teste importam o MESMO singleton
    // adminLimiter do módulo rateLimiter.js, logo a comparação prova a montagem real.
    const firstLayer = adminRouter.stack[0];
    expect(firstLayer.handle).toBe(adminLimiter);
  });

  it('com NODE_ENV=test (ambiente normal da suite), skip:isTestEnv mantém-se intacto — nunca limita', async () => {
    const app = express();
    app.use(adminLimiter);
    app.get('/ping', (req, res) => res.json({ success: true, data: { pong: true } }));

    // Bem acima do "3º pedido" que dispararia um mirror com limit:2 — prova que,
    // no ambiente real de testes, o adminLimiter de produção nunca intervém e o
    // resto da suite (incluindo admin-superadmin-sweep.test.js) não é afectado.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => request(app).get('/ping'))
    );
    for (const res of responses) {
      expect(res.status).toBe(200);
    }
  });
});

describe('adminLimiter — contrato do 429 (mirror de teste, limit reduzido)', () => {
  it('1º e 2º pedidos passam; o 3º dentro da janela devolve 429 com o corpo do contrato', async () => {
    const app = express();
    app.use(buildMirrorLimiter(2));
    app.get('/ping', (req, res) => res.json({ success: true, data: { pong: true } }));

    const r1 = await request(app).get('/ping');
    const r2 = await request(app).get('/ping');
    const r3 = await request(app).get('/ping');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.body).toEqual(CONTRACT_MESSAGE);
  });

  it('inclui headers RateLimit-* (standardHeaders) e omite X-RateLimit-* (legacyHeaders desligado)', async () => {
    const app = express();
    app.use(buildMirrorLimiter(2));
    app.get('/ping', (req, res) => res.json({ success: true, data: { pong: true } }));

    const res = await request(app).get('/ping');

    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('adminLimiter — ordem de montagem: pedido sem token também é limitado', () => {
  // Replica a ordem real de adminRoutes.js — router.use(adminLimiter) ANTES de
  // router.use(authenticate, requireSuperadmin) — usando o `authenticate` REAL
  // e um mirror de limit reduzido no lugar do adminLimiter de produção (que fica
  // inerte em NODE_ENV=test por via do skip:isTestEnv, testado acima).
  const buildOrderedApp = (limit) => {
    const app = express();
    app.use(buildMirrorLimiter(limit));
    app.use(authenticate);
    app.get('/tenants', (req, res) => res.json({ success: true, data: [] }));
    return app;
  };

  it('pedidos dentro do limite, sem token, chegam a authenticate → 401 (não 429)', async () => {
    const app = buildOrderedApp(2);

    const r1 = await request(app).get('/tenants');
    const r2 = await request(app).get('/tenants');

    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
  });

  it('o 429 dispara ANTES de authenticate — sem token e sem exceder o limite ainda chega a limitar', async () => {
    const app = buildOrderedApp(2);

    const r1 = await request(app).get('/tenants'); // conta 1 — passa ao authenticate → 401
    const r2 = await request(app).get('/tenants'); // conta 2 — passa ao authenticate → 401
    const r3 = await request(app).get('/tenants'); // conta 3 — bloqueado pelo limiter → 429

    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
    expect(r3.status).toBe(429); // se authenticate corresse primeiro, seria 401
    expect(r3.body).toEqual(CONTRACT_MESSAGE);
  });
});
