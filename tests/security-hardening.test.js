import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import UserSubscription from '../src/models/UserSubscription.js';
import { sanitizeBody } from '../src/middlewares/requestLogger.js';
import { authenticate, authorize } from '../src/middlewares/auth.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function tenantUser({
  slug = 'security-hardening',
  role = 'admin',
  permissoes = User.getDefaultPermissions(role),
  ativo = true,
  planoStatus = 'trial',
} = {}) {
  const tenant = await Tenant.create({
    nome: `Tenant ${slug}`,
    slug,
    ativo: true,
    plano: { tipo: 'basico', status: planoStatus, trialDias: 7 },
  });
  const user = await User.createWithPassword({
    tenantId: tenant._id,
    nome: 'Utilizador Segurança',
    email: `${role}@${slug}.pt`,
    password: 'Senha@Segura123',
    role,
    permissoes,
    ativo,
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  return { tenant, user, token };
}

describe('P0: superfícies legacy e internas', () => {
  it('webhook Z-API legacy foi removido', async () => {
    const res = await request(app)
      .post('/api/v1/whatsapp/webhook')
      .send({ message: 'teste sem assinatura' });

    expect(res.status).toBe(404);
  });

  it('migração não está montada no runtime HTTP, mesmo para superadmin', async () => {
    const superadmin = await User.createWithPassword({
      nome: 'Superadmin Segurança',
      email: 'superadmin@security.pt',
      password: 'Senha@Segura123',
      role: 'superadmin',
      emailVerificado: true,
    });
    const token = jwt.sign(
      { userId: superadmin._id, role: 'superadmin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .post('/api/v1/migration/run')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetTenantId: '000000000000000000000001' });

    expect(res.status).toBe(404);
  });
});

describe('P0: Web Push autenticado e vinculado à identidade', () => {
  const subscription = {
    endpoint: 'https://push.example.test/subscription/security',
    keys: { p256dh: 'p256dh-test', auth: 'auth-test' },
  };

  it('rejeita subscrição sem JWT', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .send({ subscription });

    expect(res.status).toBe(401);
  });

  it('associa a subscrição ao user e tenant do JWT', async () => {
    const { tenant, user, token } = await tenantUser({ slug: 'push-owner' });
    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscription });

    expect(res.status).toBe(201);
    const stored = await UserSubscription.findOne({ endpoint: subscription.endpoint }).lean();
    expect(stored.userId).toBe(String(user._id));
    expect(String(stored.tenantId)).toBe(String(tenant._id));
  });

  it('rejeita superadmin sem tenant com 403, sem gerar erro interno', async () => {
    const superadmin = await User.createWithPassword({
      nome: 'Superadmin Push',
      email: 'superadmin-push@security.pt',
      password: 'Senha@Segura123',
      role: 'superadmin',
      emailVerificado: true,
    });
    const token = jwt.sign(
      { userId: superadmin._id, role: 'superadmin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .post('/api/v1/notifications/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ subscription });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('P0/P1: autorização actual e revogação', () => {
  it('nega criação de cliente quando criarClientes=false', async () => {
    const { token } = await tenantUser({
      slug: 'permission-client',
      role: 'terapeuta',
      permissoes: { ...User.getDefaultPermissions('terapeuta'), criarClientes: false },
    });

    const res = await request(app)
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Indevido', telefone: '912345678' });

    expect(res.status).toBe(403);
  });

  it('nega alteração do tenant quando editarConfiguracoes=false', async () => {
    const { token } = await tenantUser({
      slug: 'permission-config',
      role: 'recepcionista',
      permissoes: { ...User.getDefaultPermissions('recepcionista'), editarConfiguracoes: false },
    });

    const res = await request(app)
      .put('/api/v1/auth/tenant')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Nome não autorizado' });

    expect(res.status).toBe(403);
  });

  it('rejeita imediatamente access token de utilizador desactivado', async () => {
    const { user, token } = await tenantUser({ slug: 'revoked-user' });
    await User.findByIdAndUpdate(user._id, { $set: { ativo: false } });

    const res = await request(app)
      .get('/api/v1/clientes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('admin não ignora uma restrição de role', () => {
    let statusCode = null;
    let nextCalled = false;
    const res = {
      status(code) { statusCode = code; return this; },
      json() { return this; },
    };

    authorize('gerente')(
      { user: { role: 'admin' } },
      res,
      () => { nextCalled = true; },
    );

    expect(statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  it('preenche permissões novas com defaults sem substituir false explícito', async () => {
    const { user, token } = await tenantUser({ slug: 'permission-backfill', role: 'admin' });
    await User.collection.updateOne(
      { _id: user._id },
      { $unset: { 'permissoes.criarClientes': '' } },
    );

    const res = await request(app)
      .post('/api/v1/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Permitido', telefone: '912345679' });

    expect(res.status).toBe(201);
  });

  it('bloqueia login de tenant suspenso de forma consistente', async () => {
    await tenantUser({ slug: 'suspended-login', role: 'admin', planoStatus: 'suspenso' });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@suspended-login.pt', password: 'Senha@Segura123' });

    expect(res.status).toBe(403);
    expect(res.body.planoStatus).toBe('suspenso');
  });

  it('mantém ids autenticados como strings', async () => {
    const { token } = await tenantUser({ slug: 'auth-id-types' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    let nextCalled = false;
    const res = {
      status() { return this; },
      json() { return this; },
    };

    await authenticate(req, res, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(typeof req.user.userId).toBe('string');
    expect(typeof req.user.tenantId).toBe('string');
  });

  it('terapeuta pode criar histórico sem receber editarClientes', async () => {
    const { tenant, token } = await tenantUser({ slug: 'therapist-history', role: 'terapeuta' });
    const { Cliente } = getModels(getTenantDB(String(tenant._id)));
    const cliente = await Cliente.create({
      tenantId: tenant._id,
      nome: 'Cliente Histórico',
      telefone: '913456789',
    });

    const res = await request(app)
      .post('/api/v1/historico-atendimentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: String(cliente._id), servico: 'Massagem terapêutica' });

    expect(res.status).toBe(201);
  });

  it('recepcionista pode chegar à regra de negócio do pagamento avulso', async () => {
    const { token } = await tenantUser({ slug: 'reception-payment', role: 'recepcionista' });

    const res = await request(app)
      .post('/api/v1/agendamentos/000000000000000000000001/pagamento')
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: 20, formaPagamento: 'Dinheiro' });

    expect(res.status).toBe(404);
  });

  it('separa leitura e escrita financeira', async () => {
    const { token } = await tenantUser({
      slug: 'finance-write',
      role: 'gerente',
      permissoes: {
        ...User.getDefaultPermissions('gerente'),
        verFinanceiro: true,
        editarFinanceiro: false,
      },
    });

    const res = await request(app)
      .post('/api/v1/transacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.requiredPermission).toBe('editarFinanceiro');
  });
});

describe('P1: sessões e redaction', () => {
  it('guarda apenas hash do refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      nomeEmpresa: 'Tenant Refresh Hash',
      nome: 'Admin Refresh',
      email: 'refresh-hash@test.pt',
      password: 'Senha@Segura123',
    });

    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'refresh-hash@test.pt' });
    expect(user.refreshTokens).toHaveLength(1);
    expect(user.refreshTokens[0].token).toBeUndefined();
    expect(user.refreshTokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('consome refresh token atomicamente em pedidos concorrentes', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      nomeEmpresa: 'Tenant Refresh Race',
      nome: 'Admin Refresh Race',
      email: 'refresh-race@test.pt',
      password: 'Senha@Segura123',
    });
    const refreshToken = reg.body.data.tokens.refreshToken;

    const responses = await Promise.all([
      request(app).post('/api/v1/auth/refresh').send({ refreshToken }),
      request(app).post('/api/v1/auth/refresh').send({ refreshToken }),
    ]);

    expect(responses.map((res) => res.status).sort()).toEqual([200, 401]);
  });

  it('redige segredos aninhados no modo de diagnóstico', () => {
    const sanitized = sanitizeBody({
      subscription: { keys: { auth: 'secret-auth', p256dh: 'secret-p256dh' } },
      nested: { refreshToken: 'secret-refresh' },
    });

    expect(sanitized.subscription.keys.auth).toBe('[REDACTED]');
    expect(sanitized.subscription.keys.p256dh).toBe('[REDACTED]');
    expect(sanitized.nested.refreshToken).toBe('[REDACTED]');
  });
});
