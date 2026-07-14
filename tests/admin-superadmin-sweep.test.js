import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import adminRouter from '../src/modules/admin/adminRoutes.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

let tokenSeq = 0;
async function tenantToken(role = 'recepcionista') {
  tokenSeq += 1;
  const tenant = await Tenant.create({
    nome: `Tenant sweep ${tokenSeq}`,
    slug: `tenant-sweep-${tokenSeq}`,
    ativo: true,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'User sweep',
    email: `sweep-${tokenSeq}@test.pt`,
    passwordHash: 'hash-placeholder',
    role,
    ativo: true,
    emailVerificado: true,
    permissoes: User.getDefaultPermissions(role),
  });
  return jwt.sign(
    { userId: user._id, tenantId: tenant._id, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Introspeciona o router e devolve { method, path } de cada rota montada.
function listRoutes(router) {
  const out = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) {
      if (layer.route.methods[method]) out.push({ method, path: layer.route.path });
    }
  }
  return out;
}

// ──────────────────────────────────────────────
// Gate 3 (A6) — TODA rota do painel devolve 404 a um não-superadmin.
// Cobertura estrutural: uma rota nova fica protegida no minuto em que é montada.
// ──────────────────────────────────────────────
describe('Sweep — adminRouter exige superadmin (404) em todas as rotas', () => {
  const routes = listRoutes(adminRouter);

  it('o adminRouter tem pelo menos uma rota (sanity)', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const { method, path } of routes) {
    // params (:id) recebem valor concreto — o requireSuperadmin rejeita antes de os resolver
    const concrete = path.replace(/:[^/]+/g, 'x');
    it(`${method.toUpperCase()} /api/v1/admin${concrete} → 404 sem superadmin`, async () => {
      const res = await request(app)[method](`/api/v1/admin${concrete}`)
        .set('Authorization', `Bearer ${await tenantToken()}`);
      expect(res.status).toBe(404);
    });
  }
});
