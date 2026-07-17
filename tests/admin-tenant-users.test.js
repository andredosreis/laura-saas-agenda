import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import AuditLog from '../src/models/AuditLog.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// O `authenticate` reforçado revalida o utilizador na DB (findById + ativo).
// Tokens têm de referenciar utilizadores realmente persistidos, senão devolvem
// 401 antes de chegarem ao `requireSuperadmin`. O superadmin é persistido a
// cada teste (a DB é limpa no beforeEach anterior). NÃO tem tenantId, logo não
// polui os testes que contam utilizadores de um tenant.
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
// preciso. O tenant tem de ser activo/trial para o `authenticate` deixar
// passar até ao `requireSuperadmin`.
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

async function waitForAudit(action, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const audit = await AuditLog.findOne({ action }).lean();
    if (audit) return audit;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return null;
}

describe('GET /api/v1/admin/tenants/:id/users', () => {
  it('401 sem token', async () => {
    const res = await request(app).get(`/api/v1/admin/tenants/${new mongoose.Types.ObjectId()}/users`);
    expect(res.status).toBe(401);
  });

  it('404 para não-superadmin — não revela a rota', async () => {
    const tenant = await Tenant.create({ nome: 'Salão X', slug: 'salao-x-users', plano: { tipo: 'pro', status: 'ativo' } });
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users`)
      .set('Authorization', `Bearer ${await tenantToken('admin')}`);
    expect(res.status).toBe(404);
  });

  it('400 para ObjectId inválido', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants/not-an-id/users')
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 para tenant inexistente', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${new mongoose.Types.ObjectId()}/users`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(404);
  });

  it('lista utilizadores ordenados por createdAt asc, com o dono (1º admin) em primeiro', async () => {
    const tenant = await Tenant.create({ nome: 'Salão Dono', slug: 'salao-dono', plano: { tipo: 'pro', status: 'ativo' } });
    const base = Date.now();

    // Criados fora de ordem cronológica de chamada, mas com createdAt explícito
    // a fixar a ordem esperada: dono (1º admin) < recepcionista < 2º admin.
    await User.createWithPassword({
      tenantId: tenant._id,
      nome: 'Segundo Admin',
      email: 'admin2@salao-dono.pt',
      password: 'Senha@Segura123',
      role: 'admin',
      emailVerificado: true,
      createdAt: new Date(base + 2000),
    });
    await User.createWithPassword({
      tenantId: tenant._id,
      nome: 'Dono Original',
      email: 'dono@salao-dono.pt',
      password: 'Senha@Segura123',
      role: 'admin',
      emailVerificado: true,
      createdAt: new Date(base),
    });
    await User.createWithPassword({
      tenantId: tenant._id,
      nome: 'Recepcionista',
      email: 'recep@salao-dono.pt',
      password: 'Senha@Segura123',
      role: 'recepcionista',
      emailVerificado: true,
      createdAt: new Date(base + 1000),
    });

    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.map((u) => u.email)).toEqual([
      'dono@salao-dono.pt',
      'recep@salao-dono.pt',
      'admin2@salao-dono.pt',
    ]);
    expect(res.body.data[0].role).toBe('admin');
  });

  it('allowlist — nunca expõe passwordHash/refreshTokens/permissoes/twoFactor/dadosBancarios/tokens de reset', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Seguro',
      slug: 'salao-seguro-users',
      plano: { tipo: 'pro', status: 'ativo' },
    });
    await User.createWithPassword({
      tenantId: tenant._id,
      nome: 'Perigoso',
      email: 'perigoso@salao-seguro-users.pt',
      password: 'Senha@Segura123',
      role: 'admin',
      emailVerificado: true,
      dadosBancarios: { titular: 'Perigoso Lda', iban: 'PT50000201231234567890154', banco: 'Banco Sekret' },
      twoFactor: { enabled: true, secret: 'sekret-totp-secret' },
      // Os dois piores campos da lista: um reset token vazado é takeover directo
      // da conta do admin do tenant. Semeados para o canário `sekret` os cobrir.
      resetPasswordToken: 'sekret-reset-token',
      emailVerificationToken: 'sekret-verify-token',
    });

    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash/i);
    expect(body).not.toMatch(/refreshTokens/i);
    expect(body).not.toMatch(/permissoes/i);
    expect(body).not.toMatch(/twoFactor/i);
    expect(body).not.toMatch(/dadosBancarios/i);
    expect(body).not.toMatch(/authVersion/i);
    expect(body).not.toMatch(/resetPasswordToken/i);
    expect(body).not.toMatch(/emailVerificationToken/i);
    // O secret TOTP + IBAN + tokens de reset/verificação semeados nunca podem
    // transbordar para a resposta.
    expect(body).not.toContain('sekret');

    const user = res.body.data[0];
    expect(Object.keys(user)).toEqual(
      expect.arrayContaining(['nome', 'email', 'role', 'ativo', 'emailVerificado', 'createdAt'])
    );
  });

  it('pagina com default 20, cap 100, e sem page/limit no URL aplica o default (não NaN)', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Paginado',
      slug: 'salao-paginado',
      plano: { tipo: 'pro', status: 'ativo' },
    });
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        User.createWithPassword({
          tenantId: tenant._id,
          nome: `User ${i}`,
          email: `user${i}@salao-paginado.pt`,
          password: 'Senha@Segura123',
          role: 'recepcionista',
          emailVerificado: true,
        })
      )
    );

    // Sem page/limit no URL — regressão do bug "limit vira NaN e devolve tudo".
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.pagination).toMatchObject({ total: 25, page: 1, pages: 2, limit: 20 });

    const page2 = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users?page=2`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(5);
    expect(page2.body.pagination.page).toBe(2);

    const overCap = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users?limit=101`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(overCap.status).toBe(400);
  });

  it('audita a leitura com action tenant.users e targetTenantId', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Auditado',
      slug: 'salao-auditado',
      plano: { tipo: 'pro', status: 'ativo' },
    });
    await User.createWithPassword({
      tenantId: tenant._id,
      nome: 'Admin Auditado',
      email: 'audit@salao-auditado.pt',
      password: 'Senha@Segura123',
      role: 'admin',
      emailVerificado: true,
    });

    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenant._id}/users`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(200);

    const audit = await waitForAudit('tenant.users');
    expect(audit).toMatchObject({ action: 'tenant.users', status: 'ok' });
    expect(String(audit.targetTenantId)).toBe(String(tenant._id));
  });

  it('isolamento — utilizadores de outro tenant nunca aparecem', async () => {
    const tenantA = await Tenant.create({ nome: 'Tenant A', slug: 'tenant-a-users', plano: { tipo: 'pro', status: 'ativo' } });
    const tenantB = await Tenant.create({ nome: 'Tenant B', slug: 'tenant-b-users', plano: { tipo: 'pro', status: 'ativo' } });

    await User.createWithPassword({
      tenantId: tenantA._id,
      nome: 'User A',
      email: 'usera@tenant-a-users.pt',
      password: 'Senha@Segura123',
      role: 'admin',
      emailVerificado: true,
    });
    await User.createWithPassword({
      tenantId: tenantB._id,
      nome: 'User B',
      email: 'userb@tenant-b-users.pt',
      password: 'Senha@Segura123',
      role: 'admin',
      emailVerificado: true,
    });

    const res = await request(app)
      .get(`/api/v1/admin/tenants/${tenantA._id}/users`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('usera@tenant-a-users.pt');
  });

  it('responde também no alias legacy /api/admin/tenants/:id/users', async () => {
    const tenant = await Tenant.create({
      nome: 'Salão Legacy',
      slug: 'salao-legacy-users',
      plano: { tipo: 'pro', status: 'ativo' },
    });
    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/users`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(200);
  });
});
