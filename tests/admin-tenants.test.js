import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import AuditLog from '../src/models/AuditLog.js';
import { TENANT_DETAIL_FIELDS } from '../src/modules/admin/adminController.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// O `authenticate` reforçado revalida o utilizador na DB (findById + ativo).
// Tokens têm de referenciar utilizadores realmente persistidos, senão devolvem
// 401 antes de chegarem ao `requireSuperadmin`. O superadmin é persistido a
// cada teste (a DB é limpa no beforeEach anterior). NÃO tem tenantId, logo não
// polui os testes que contam tenants.
let superadminId;

beforeEach(async () => {
  const superadmin = await User.createWithPassword({
    nome: 'Superadmin Teste',
    email: 'super@marcai.pt',
    password: 'Senha@Segura123',
    role: 'superadmin',
    emailVerificado: true,
  });
  superadminId = superadmin._id;
});

function superToken() {
  return jwt.sign(
    { userId: superadminId.toString(), email: 'super@marcai.pt', role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Persiste um admin não-superadmin + o respectivo tenant activo, apenas onde é
// preciso (evita poluir os testes de listagem de tenants). O tenant tem de ser
// activo/trial para o `authenticate` deixar passar até ao `requireSuperadmin`.
async function tenantToken(role = 'admin') {
  const tenant = await Tenant.create({
    nome: 'Tenant Nao-Super',
    slug: 'tenant-nao-super',
    ativo: true,
    plano: { tipo: 'basico', status: 'ativo', dataInicio: new Date() },
  });
  const admin = await User.createWithPassword({
    tenantId: tenant._id,
    nome: 'Admin Nao-Super',
    email: 'admin-nao-super@marcai.pt',
    password: 'Senha@Segura123',
    role,
    permissoes: User.getDefaultPermissions(role),
    emailVerificado: true,
  });
  return jwt.sign(
    { userId: admin._id.toString(), tenantId: tenant._id.toString(), role },
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

async function waitForAudit(action, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const audit = await AuditLog.findOne({ action }).lean();
    if (audit) return audit;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
}

describe('GET /api/v1/admin/tenants', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/v1/admin/tenants');
    expect(res.status).toBe(401);
  });

  it('404 para não-superadmin — não revela a superfície', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${await tenantToken('admin')}`);
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

  it('pagina 120 tenants no servidor e pesquisa nome/slug sem distinguir maiúsculas', async () => {
    await seedTenants(120);

    const list = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`);

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(20);
    expect(list.body.pagination).toMatchObject({ total: 120, page: 1, pages: 6, limit: 20 });

    const byName = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ search: 'SALÃO 42' })
      .set('Authorization', `Bearer ${superToken()}`);
    expect(byName.status).toBe(200);
    expect(byName.body.data.map((tenant) => tenant.slug)).toEqual(['salao-42']);
    expect(byName.body.pagination.total).toBe(1);

    const bySlug = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ search: 'SALAO-77' })
      .set('Authorization', `Bearer ${superToken()}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data.map((tenant) => tenant.nome)).toEqual(['Salão 77']);
    expect(bySlug.body.pagination.total).toBe(1);
  });

  it('escapa metacaracteres regex da pesquisa', async () => {
    await seedTenants(2);

    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ search: 'a+b(' })
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('aplica filtros plano/status e combina-os com AND no find e count', async () => {
    await Tenant.insertMany([
      { nome: 'Pro Ativo', slug: 'pro-ativo', plano: { tipo: 'pro', status: 'ativo' } },
      { nome: 'Pro Trial', slug: 'pro-trial', plano: { tipo: 'pro', status: 'trial' } },
      { nome: 'Elite Ativo', slug: 'elite-ativo', plano: { tipo: 'elite', status: 'ativo' } },
      { nome: 'Elite Suspenso', slug: 'elite-suspenso', plano: { tipo: 'elite', status: 'suspenso' } },
    ]);

    const byPlan = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ plano: 'pro' })
      .set('Authorization', `Bearer ${superToken()}`);
    expect(byPlan.status).toBe(200);
    expect(byPlan.body.data).toHaveLength(2);
    expect(byPlan.body.pagination.total).toBe(2);
    expect(byPlan.body.data.every((tenant) => tenant.plano.tipo === 'pro')).toBe(true);

    const byStatus = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ status: 'ativo' })
      .set('Authorization', `Bearer ${superToken()}`);
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data).toHaveLength(2);
    expect(byStatus.body.pagination.total).toBe(2);
    expect(byStatus.body.data.every((tenant) => tenant.plano.status === 'ativo')).toBe(true);

    const combined = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ plano: 'elite', status: 'ativo' })
      .set('Authorization', `Bearer ${superToken()}`);
    expect(combined.status).toBe(200);
    expect(combined.body.data.map((tenant) => tenant.slug)).toEqual(['elite-ativo']);
    expect(combined.body.pagination.total).toBe(1);
  });

  it.each([
    ['plano', 'premium'],
    ['status', 'pausado'],
    ['limit', '101'],
  ])('rejeita query inválida: %s=%s', async (key, value) => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .query({ [key]: value })
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.error).toBe('string');
  });

  it('responde também no alias legacy /api/admin/tenants', async () => {
    const res = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/admin/tenants/stats', () => {
  it('devolve total e contagens exactas por status/tipo, incluindo zeros, e audita', async () => {
    await Tenant.insertMany([
      { nome: 'Básico Trial', slug: 'basico-trial', plano: { tipo: 'basico', status: 'trial' } },
      { nome: 'Pro Ativo 1', slug: 'pro-ativo-1', plano: { tipo: 'pro', status: 'ativo' } },
      { nome: 'Pro Ativo 2', slug: 'pro-ativo-2', plano: { tipo: 'pro', status: 'ativo' } },
      { nome: 'Elite Suspenso', slug: 'elite-suspenso-stats', plano: { tipo: 'elite', status: 'suspenso' } },
      { nome: 'Custom Cancelado', slug: 'custom-cancelado', plano: { tipo: 'custom', status: 'cancelado' } },
    ]);

    const res = await request(app)
      .get('/api/v1/admin/tenants/stats')
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        total: 5,
        porStatus: { trial: 1, ativo: 2, suspenso: 1, cancelado: 1, expirado: 0 },
        porTipo: { basico: 1, pro: 2, elite: 1, custom: 1 },
      },
    });

    const audit = await waitForAudit('tenant.stats');
    expect(audit).toMatchObject({ action: 'tenant.stats', status: 'ok' });
  });

  it('404 para não-superadmin — não revela a rota', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/stats')
      .set('Authorization', `Bearer ${await tenantToken('admin')}`);

    expect(res.status).toBe(404);
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

// F15 — allowlist explícita substitui a denylist anterior em obterTenant.
describe('GET /api/v1/admin/tenants/:id — allowlist de campos (F15)', () => {
  // Campos que a resposta pode legitimamente conter para além do TENANT_DETAIL_FIELDS
  // "cru": `_id` vem por defeito do Mongoose; `id` é o virtual embutido do Mongoose
  // (string de `_id`, activado por `toJSON: { virtuals: true }` no schema, não é
  // um path allowlisted); os restantes são virtuals de negócio derivados (não secrets).
  const EXTRA_ALLOWED_TOP_LEVEL = new Set(['_id', 'id', 'isTrialExpired', 'diasRestantesTrial']);

  it('nunca expõe segredos, mesmo com todos os campos sensíveis populados', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Seguro',
      slug: 'salao-seguro',
      plano: { tipo: 'pro', status: 'ativo' },
      whatsapp: { instanceName: 'salao-seguro', instanceToken: 'sekret-instance' },
    });
    // `zapiToken`/`zapiClientToken` já não existem no schema actual (migração p/
    // Evolution API) — simula um documento legado inserindo directamente na
    // colecção (bypass ao strict mode do Mongoose), para provar que a projecção
    // no Mongo protege mesmo esses casos, não apenas os campos do schema vivo.
    await Tenant.collection.updateOne(
      { _id: tenant._id },
      { $set: { 'whatsapp.zapiToken': 'sekret-zapi', 'whatsapp.zapiClientToken': 'sekret-client' } }
    );

    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    // Uma única substring apanha as 3 — todos os secrets seeded partilham o
    // prefixo "sekret" (ver spec F15: JSON.stringify(body) não deve conter-la).
    expect(JSON.stringify(res.body)).not.toContain('sekret');

    // Exclusões duras explícitas — nunca podem aparecer, independentemente do schema.
    const whatsapp = res.body.data.tenant.whatsapp ?? {};
    expect(whatsapp.instanceToken).toBeUndefined();
    expect(whatsapp.zapiToken).toBeUndefined();
    expect(whatsapp.zapiClientToken).toBeUndefined();

    // Nenhum campo, em nenhum nível, tem um nome que bata em /token|secret|key|password/i.
    const suspiciousKeys = [];
    const scan = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [key, value] of Object.entries(obj)) {
        if (/token|secret|key|password/i.test(key)) suspiciousKeys.push(key);
        if (value && typeof value === 'object') scan(value);
      }
    };
    scan(res.body.data.tenant);
    expect(suspiciousKeys).toEqual([]);
  });

  it('shape lock — todo top-level key de data.tenant está na allowlist (ou é virtual/_id)', async () => {
    const t = await Tenant.create({
      nome: 'Salão Shape',
      slug: 'salao-shape',
      plano: { tipo: 'basico', status: 'ativo' },
    });
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${t._id}`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    const allowedTopLevel = new Set([
      ...TENANT_DETAIL_FIELDS.map((f) => f.split('.')[0]),
      ...EXTRA_ALLOWED_TOP_LEVEL,
    ]);

    for (const key of Object.keys(res.body.data.tenant)) {
      expect(allowedTopLevel.has(key)).toBe(true);
    }
  });

  it('mantém os campos que o frontend precisa: nome, slug, plano.tipo, limites, totalUsuarios', async () => {
    const t = await Tenant.create({
      nome: 'Salão Positivo',
      slug: 'salao-positivo',
      plano: { tipo: 'elite', status: 'ativo' },
    });
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${t._id}`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tenant.nome).toBe('Salão Positivo');
    expect(res.body.data.tenant.slug).toBe('salao-positivo');
    expect(res.body.data.tenant.plano.tipo).toBe('elite');
    expect(res.body.data.tenant.limites).toBeDefined();
    expect(res.body.data.tenant.limites.maxClientes).toBeDefined();
    expect(res.body.data.totalUsuarios).toBe(0);
  });
});
