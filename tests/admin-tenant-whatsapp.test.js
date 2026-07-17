/**
 * F21 — Per-Tenant WhatsApp/Evolution Management (ADR-021 Fase 4 / ADR-024 Fase 4).
 *
 * A Evolution API é mockada por INTEIRO (regra da casa, `.claude/rules/testing.md`):
 * estas rotas criam e desligam instâncias reais de WhatsApp de clínicas — nenhum
 * teste toca na rede.
 *
 * Cobertura dos gates do painel (.claude/skills/marcai-superadmin-route):
 *   1. requireSuperadmin → 404 (aqui e, estruturalmente, no sweep parametrizado)
 *   2. AuditLog em leituras e mutações, sem credenciais
 *   4. confinamento: nenhuma rota devolve `instanceToken`
 */

import { jest } from '@jest/globals';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
process.env.PUBLIC_API_URL = 'https://api.test.marcai.pt';

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  createInstance: jest.fn(),
  getConnectQR: jest.fn(),
  getConnectionState: jest.fn(),
  logoutInstance: jest.fn(),
  sendWhatsAppMessage: jest.fn(),
  getMediaBase64: jest.fn(),
  registerSendFailureHandler: jest.fn(),
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const jwt = (await import('jsonwebtoken')).default;
const mongoose = (await import('mongoose')).default;
const { MongoMemoryReplSet } = await import('mongodb-memory-server');
const adminRouter = (await import('../src/modules/admin/adminRoutes.js')).default;
const errorHandler = (await import('../src/middlewares/errorHandler.js')).default;
const AuditLog = (await import('../src/models/AuditLog.js')).default;
const Tenant = (await import('../src/models/Tenant.js')).default;
const User = (await import('../src/models/User.js')).default;
const { createInstance, getConnectQR, getConnectionState, logoutInstance } = await import(
  '../src/utils/evolutionClient.js'
);

// Token da instância: o valor que NUNCA pode aparecer numa resposta nem no audit.
const INSTANCE_TOKEN = 'evo-instance-token-super-secreto';

let replSet;

beforeAll(async () => {
  // ReplSet: `adminMutation` usa `session.withTransaction`, que exige replica set.
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
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
  jest.restoreAllMocks();
});

let superadminId;
let staffUserId;
let staffTenantId;

beforeEach(async () => {
  jest.clearAllMocks();

  const superadmin = await User.createWithPassword({
    nome: 'Superadmin Teste',
    email: 'super@marcai.pt',
    password: 'Senha@Segura123',
    role: 'superadmin',
    emailVerificado: true,
  });
  superadminId = superadmin._id;

  const staffTenant = await Tenant.create({
    nome: 'Tenant Staff',
    slug: 'tenant-staff',
    ativo: true,
    plano: { tipo: 'basico', status: 'ativo', dataInicio: new Date() },
  });
  staffTenantId = staffTenant._id;

  const staff = await User.createWithPassword({
    tenantId: staffTenant._id,
    nome: 'Admin do Tenant',
    email: 'admin@clinica.pt',
    password: 'Senha@Segura123',
    role: 'admin',
    permissoes: User.getDefaultPermissions('admin'),
    emailVerificado: true,
  });
  staffUserId = staff._id;
});

const superToken = () =>
  jwt.sign({ userId: superadminId.toString(), email: 'super@marcai.pt', role: 'superadmin' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const staffToken = () =>
  jwt.sign(
    {
      userId: staffUserId.toString(),
      tenantId: staffTenantId.toString(),
      email: 'admin@clinica.pt',
      role: 'admin',
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

function buildApp() {
  const app = express();
  app.use(express.json());
  // adminRouter traz os seus próprios gates (limiter → authenticate → requireSuperadmin → audit).
  app.use('/api/admin', adminRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

let tenantSeq = 0;
async function seedTenant(overrides = {}) {
  tenantSeq += 1;
  return Tenant.create({
    nome: 'Clínica Teste',
    slug: `clinica-teste-${tenantSeq}`,
    plano: { tipo: 'basico', status: 'ativo', dataInicio: new Date() },
    ...overrides,
  });
}

/** Tenant já com instância Evolution configurada (inclui o token secreto). */
async function seedTenantComInstancia(instanceName = 'clinica-com-instancia') {
  return seedTenant({
    whatsapp: {
      provider: 'evolution',
      instanceName,
      instanceToken: INSTANCE_TOKEN,
      numeroWhatsapp: '351912000111',
      webhookConfigured: true,
      webhookUrl: 'https://api.test.marcai.pt/webhook/evolution',
    },
  });
}

// ===========================================================================
// Gate 1 + Gate 4 — confinamento do painel
// ===========================================================================
describe('F21 — Gates do painel super-admin', () => {
  const rotas = [
    ['get', (id) => `/api/admin/tenants/${id}/whatsapp`],
    ['get', (id) => `/api/admin/tenants/${id}/whatsapp/qr`],
    ['post', (id) => `/api/admin/tenants/${id}/whatsapp/instancia`],
    ['post', (id) => `/api/admin/tenants/${id}/whatsapp/logout`],
  ];

  it.each(rotas)('%s %s → 404 para não-superadmin (nunca 403)', async (method, path) => {
    const tenant = await seedTenantComInstancia();
    const res = await request(app)[method](path(tenant._id)).set('Authorization', `Bearer ${staffToken()}`).send({});

    expect(res.status).toBe(404);
    // O 404 não pode revelar nada sobre o tenant nem sobre a instância.
    expect(JSON.stringify(res.body)).not.toContain('clinica-com-instancia');
    expect(JSON.stringify(res.body)).not.toContain(INSTANCE_TOKEN);
  });

  it.each(rotas)('%s %s → 401 sem token', async (method, path) => {
    const tenant = await seedTenantComInstancia();
    const res = await request(app)[method](path(tenant._id)).send({});
    expect(res.status).toBe(401);
  });

  it('negação de não-superadmin fica auditada como `denied`', async () => {
    const tenant = await seedTenantComInstancia();
    await request(app).get(`/api/admin/tenants/${tenant._id}/whatsapp`).set('Authorization', `Bearer ${staffToken()}`);

    // O requireSuperadmin audita a negação de forma best-effort (fora do request).
    await new Promise((r) => setTimeout(r, 50));
    const denied = await AuditLog.findOne({ status: 'denied' });
    expect(denied).toBeTruthy();
  });

  it('nenhuma das rotas chama a Evolution para um não-superadmin', async () => {
    const tenant = await seedTenantComInstancia();
    await Promise.all(
      rotas.map(([method, path]) =>
        request(app)[method](path(tenant._id)).set('Authorization', `Bearer ${staffToken()}`).send({}),
      ),
    );

    expect(createInstance).not.toHaveBeenCalled();
    expect(getConnectQR).not.toHaveBeenCalled();
    expect(logoutInstance).not.toHaveBeenCalled();
    expect(getConnectionState).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /tenants/:id/whatsapp — view
// ===========================================================================
describe('F21 — GET /tenants/:id/whatsapp', () => {
  it('tenant sem instância → connectionState `unknown`, sem contactar a Evolution', async () => {
    const tenant = await seedTenant();

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.instanceName).toBeNull();
    expect(res.body.data.connectionState).toBe('unknown');
    expect(res.body.data.evolutionReachable).toBe(false);
    expect(getConnectionState).not.toHaveBeenCalled();
  });

  it('tenant com instância → funde o estado vivo da Evolution', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(getConnectionState).toHaveBeenCalledWith('clinica-com-instancia');
    expect(res.body.data).toMatchObject({
      provider: 'evolution',
      instanceName: 'clinica-com-instancia',
      numeroWhatsapp: '351912000111',
      webhookConfigured: true,
      connectionState: 'open',
      evolutionReachable: true,
    });
  });

  it('NUNCA devolve o instanceToken', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(JSON.stringify(res.body)).not.toContain(INSTANCE_TOKEN);
    expect(res.body.data.instanceToken).toBeUndefined();
  });

  it('Evolution em baixo → 200 com evolutionReachable:false (nunca 500)', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectionState.mockResolvedValue({ ok: false, unreachable: true, error: 'ECONNREFUSED' });

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.connectionState).toBe('unknown');
    expect(res.body.data.evolutionReachable).toBe(false);
    // Dados guardados continuam a ser servidos.
    expect(res.body.data.instanceName).toBe('clinica-com-instancia');
  });

  it('leitura fica auditada (`tenant.whatsapp.view`)', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectionState.mockResolvedValue({ ok: true, state: 'open' });

    await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp`)
      .set('Authorization', `Bearer ${superToken()}`);

    await new Promise((r) => setTimeout(r, 50));
    const audit = await AuditLog.findOne({ action: 'tenant.whatsapp.view' });
    expect(audit).toBeTruthy();
    expect(String(audit.targetTenantId)).toBe(String(tenant._id));
    expect(JSON.stringify(audit.toObject())).not.toContain(INSTANCE_TOKEN);
  });

  it('ID inválido → 400', async () => {
    const res = await request(app).get('/api/admin/tenants/nao-e-objectid/whatsapp').set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(400);
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .get(`/api/admin/tenants/${new mongoose.Types.ObjectId()}/whatsapp`)
      .set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST /tenants/:id/whatsapp/instancia — create
// ===========================================================================
describe('F21 — POST /tenants/:id/whatsapp/instancia', () => {
  const okCreate = () =>
    createInstance.mockResolvedValue({
      ok: true,
      instanceToken: INSTANCE_TOKEN,
      state: 'connecting',
      webhookConfigured: true,
    });

  it('happy path — persiste no Tenant e devolve instanceName + connectionState', async () => {
    const tenant = await seedTenant({ slug: 'clinica-nova' });
    okCreate();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(200); // adminMutation responde 200 (ver relatório: spec pedia 201)
    expect(res.body.data).toEqual({ instanceName: 'clinica-nova', connectionState: 'connecting' });

    const updated = await Tenant.findById(tenant._id);
    expect(updated.whatsapp.instanceName).toBe('clinica-nova');
    expect(updated.whatsapp.instanceToken).toBe(INSTANCE_TOKEN);
    expect(updated.whatsapp.provider).toBe('evolution');
    expect(updated.whatsapp.webhookConfigured).toBe(true);
    expect(updated.whatsapp.webhookUrl).toBe('https://api.test.marcai.pt/webhook/evolution');
  });

  it('deriva o instanceName do slug e configura o webhook público', async () => {
    const tenant = await seedTenant({ slug: 'clinica-do-porto' });
    okCreate();

    await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(createInstance).toHaveBeenCalledWith('clinica-do-porto', {
      webhookUrl: 'https://api.test.marcai.pt/webhook/evolution',
    });
  });

  it('aceita instanceName explícito no body', async () => {
    const tenant = await seedTenant({ slug: 'clinica-slug' });
    okCreate();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({ instanceName: 'nome-escolhido' });

    expect(res.status).toBe(200);
    expect(createInstance).toHaveBeenCalledWith('nome-escolhido', expect.any(Object));
  });

  it('instanceName inválido → 400 (Zod), sem tocar na Evolution', async () => {
    const tenant = await seedTenant();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({ instanceName: 'Nome Inválido!' });

    expect(res.status).toBe(400);
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('audita UMA entrada `tenant.whatsapp.create` — sem o token', async () => {
    const tenant = await seedTenant({ slug: 'clinica-audit' });
    okCreate();

    await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    const audits = await AuditLog.find({ action: 'tenant.whatsapp.create' });
    expect(audits).toHaveLength(1);
    expect(audits[0].status).toBe('ok');
    expect(String(audits[0].targetTenantId)).toBe(String(tenant._id));
    expect(audits[0].before).toEqual({ instanceName: null, webhookConfigured: false });
    expect(audits[0].after).toEqual({ instanceName: 'clinica-audit', webhookConfigured: true });

    // Varrimento: o token não pode estar em NENHUMA entrada de auditoria.
    const todas = await AuditLog.find({});
    expect(JSON.stringify(todas.map((a) => a.toObject()))).not.toContain(INSTANCE_TOKEN);
  });

  it('a resposta nunca contém o instanceToken', async () => {
    const tenant = await seedTenant({ slug: 'clinica-token' });
    okCreate();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(JSON.stringify(res.body)).not.toContain(INSTANCE_TOKEN);
  });

  it('tenant que já tem instância → 409, sem tocar na Evolution', async () => {
    const tenant = await seedTenantComInstancia();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('instanceName já usado por outro tenant → 409, sem tocar na Evolution', async () => {
    await seedTenantComInstancia('nome-ocupado');
    const outro = await seedTenant({ slug: 'outra-clinica' });

    const res = await request(app)
      .post(`/api/admin/tenants/${outro._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({ instanceName: 'nome-ocupado' });

    expect(res.status).toBe(409);
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('Evolution recusa (nome já em uso) → 409', async () => {
    const tenant = await seedTenant({ slug: 'clinica-conflito' });
    createInstance.mockResolvedValue({ ok: false, conflict: true, error: 'already in use' });

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(409);
    const unchanged = await Tenant.findById(tenant._id);
    expect(unchanged.whatsapp.instanceName).toBeUndefined();
  });

  it('Evolution em baixo → 502 e Tenant intacto', async () => {
    const tenant = await seedTenant({ slug: 'clinica-offline' });
    createInstance.mockResolvedValue({ ok: false, unreachable: true, error: 'ECONNREFUSED' });

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    // Nunca ecoar detalhes internos da Evolution.
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');

    const unchanged = await Tenant.findById(tenant._id);
    expect(unchanged.whatsapp.instanceName).toBeUndefined();
  });

  it('falha da DB depois de criar na Evolution → compensação (logout da órfã)', async () => {
    const tenant = await seedTenant({ slug: 'clinica-compensa' });
    okCreate();
    logoutInstance.mockResolvedValue({ ok: true });
    jest.spyOn(Tenant, 'findOneAndUpdate').mockRejectedValueOnce(new Error('DB indisponível'));

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(500);
    // Compensação best-effort da instância órfã.
    expect(logoutInstance).toHaveBeenCalledWith('clinica-compensa');

    // Nada persistido — a transação fez rollback.
    const unchanged = await Tenant.findById(tenant._id);
    expect(unchanged.whatsapp.instanceName).toBeUndefined();

    // A falha ficou registada.
    const erro = await AuditLog.findOne({ action: 'tenant.whatsapp.create', status: 'error' });
    expect(erro).toBeTruthy();
  });

  it('ID inválido → 400', async () => {
    const res = await request(app)
      .post('/api/admin/tenants/xpto/whatsapp/instancia')
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('tenant inexistente → 404', async () => {
    const res = await request(app)
      .post(`/api/admin/tenants/${new mongoose.Types.ObjectId()}/whatsapp/instancia`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});
    expect(res.status).toBe(404);
    expect(createInstance).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /tenants/:id/whatsapp/qr
// ===========================================================================
describe('F21 — GET /tenants/:id/whatsapp/qr', () => {
  it('devolve o QR ao operador', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectQR.mockResolvedValue({ ok: true, qrBase64: 'data:image/png;base64,AAAA', pairingCode: 'WZYEH1YY' });

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp/qr`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ qrBase64: 'data:image/png;base64,AAAA', pairingCode: 'WZYEH1YY' });
    expect(getConnectQR).toHaveBeenCalledWith('clinica-com-instancia');
  });

  it('o QR NUNCA entra nos metadados de auditoria', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectQR.mockResolvedValue({ ok: true, qrBase64: 'data:image/png;base64,SEGREDO', pairingCode: 'PAIR1234' });

    await request(app).get(`/api/admin/tenants/${tenant._id}/whatsapp/qr`).set('Authorization', `Bearer ${superToken()}`);

    await new Promise((r) => setTimeout(r, 50));
    const audit = await AuditLog.findOne({ action: 'tenant.whatsapp.qr' });
    expect(audit).toBeTruthy();
    expect(String(audit.targetTenantId)).toBe(String(tenant._id));

    const dump = JSON.stringify(audit.toObject());
    expect(dump).not.toContain('SEGREDO');
    expect(dump).not.toContain('PAIR1234');
  });

  it('tenant sem instância → 404', async () => {
    const tenant = await seedTenant();

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp/qr`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(404);
    expect(getConnectQR).not.toHaveBeenCalled();
  });

  it('Evolution em baixo → 502 (o QR não tem fallback)', async () => {
    const tenant = await seedTenantComInstancia();
    getConnectQR.mockResolvedValue({ ok: false, unreachable: true, error: 'timeout of 15000ms exceeded' });

    const res = await request(app)
      .get(`/api/admin/tenants/${tenant._id}/whatsapp/qr`)
      .set('Authorization', `Bearer ${superToken()}`);

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('timeout of 15000ms');
  });

  it('ID inválido → 400', async () => {
    const res = await request(app).get('/api/admin/tenants/abc/whatsapp/qr').set('Authorization', `Bearer ${superToken()}`);
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST /tenants/:id/whatsapp/logout
// ===========================================================================
describe('F21 — POST /tenants/:id/whatsapp/logout', () => {
  it('termina a sessão e devolve connectionState `close`', async () => {
    const tenant = await seedTenantComInstancia();
    logoutInstance.mockResolvedValue({ ok: true });

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ connectionState: 'close' });
    expect(logoutInstance).toHaveBeenCalledWith('clinica-com-instancia');
  });

  it('é auditado (`tenant.whatsapp.logout`) sem credenciais', async () => {
    const tenant = await seedTenantComInstancia();
    logoutInstance.mockResolvedValue({ ok: true });

    await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    const audits = await AuditLog.find({ action: 'tenant.whatsapp.logout' });
    expect(audits).toHaveLength(1);
    expect(audits[0].status).toBe('ok');
    expect(String(audits[0].targetTenantId)).toBe(String(tenant._id));
    expect(JSON.stringify(audits[0].toObject())).not.toContain(INSTANCE_TOKEN);
  });

  it('idempotente — desligar uma instância já desligada sucede', async () => {
    const tenant = await seedTenantComInstancia();
    logoutInstance.mockResolvedValue({ ok: true });

    const primeiro = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});
    const segundo = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(primeiro.status).toBe(200);
    expect(segundo.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'tenant.whatsapp.logout' })).toBe(2);
  });

  it('preserva instanceName e numeroWhatsapp (logout ≠ desconfigurar)', async () => {
    const tenant = await seedTenantComInstancia();
    logoutInstance.mockResolvedValue({ ok: true });

    await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    const after = await Tenant.findById(tenant._id);
    expect(after.whatsapp.instanceName).toBe('clinica-com-instancia');
    expect(after.whatsapp.numeroWhatsapp).toBe('351912000111');
    expect(after.whatsapp.webhookConfigured).toBe(true);
  });

  it('tenant sem instância → 404', async () => {
    const tenant = await seedTenant();

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(404);
    expect(logoutInstance).not.toHaveBeenCalled();
  });

  it('Evolution em baixo → 502 e nada é auditado como sucesso', async () => {
    const tenant = await seedTenantComInstancia();
    logoutInstance.mockResolvedValue({ ok: false, unreachable: true, error: 'ECONNREFUSED' });

    const res = await request(app)
      .post(`/api/admin/tenants/${tenant._id}/whatsapp/logout`)
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});

    expect(res.status).toBe(502);
    expect(await AuditLog.countDocuments({ action: 'tenant.whatsapp.logout', status: 'ok' })).toBe(0);
  });

  it('ID inválido → 400', async () => {
    const res = await request(app)
      .post('/api/admin/tenants/abc/whatsapp/logout')
      .set('Authorization', `Bearer ${superToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(logoutInstance).not.toHaveBeenCalled();
  });
});
