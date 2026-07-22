// tests/gdpr-consent.test.js
// F01 — Consent Logging Foundation (ADR-031). Contrato C1–C12.
// O ConsentLog é o registo de PROVA de consentimento: o que se testa aqui é
// sobretudo que a prova não pode ser forjada pelo cliente da API.

import { jest } from '@jest/globals';

const request = (await import('supertest')).default;
const app = (await import('../src/app.js')).default;
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const User = (await import('../src/models/User.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');
const { POLICY_VERSION, noticeHash } = await import('../src/modules/gdpr/policyVersion.js');
const jwt = (await import('jsonwebtoken')).default;

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  jest.clearAllMocks();
});

let contador = 0;

async function criarTenantComCliente(slug, { role = 'admin' } = {}) {
  contador += 1;
  const tenant = await Tenant.create({
    nome: `Clínica ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Utilizador',
    email: `${role}@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role,
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const models = getModels(getTenantDB(tenant._id.toString()));
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria Cliente',
    telefone: `35191000${String(1000 + contador).slice(-4)}`,
  });
  return { tenant, user, token, models, cliente };
}

const corpoValido = (clienteId, extra = {}) => ({
  clienteId: String(clienteId),
  tipo: 'marketing',
  accao: 'granted',
  origem: 'painel',
  evidencia: 'Cliente pediu na recepção a 20/07',
  ...extra,
});

describe('C1 — regista uma entrada imutável', () => {
  it('grava todos os campos, com actor/textoHash do servidor, e aparece no histórico', async () => {
    const { token, cliente, models } = await criarTenantComCliente('c1');

    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      tipo: 'marketing',
      accao: 'granted',
      origem: 'painel',
      actor: 'funcionario',
      versao: POLICY_VERSION,
    });
    expect(res.body.data.textoHash).toBe(noticeHash());
    expect(res.body.data.createdAt).toBeTruthy();

    expect(await models.ConsentLog.countDocuments({})).toBe(1);

    const hist = await request(app)
      .get(`/api/v1/gdpr/consent?clienteId=${cliente._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(hist.status).toBe(200);
    expect(hist.body.data).toHaveLength(1);
  });
});

describe('C2 — append-only', () => {
  it('não existe rota de update nem de delete', async () => {
    const { token, cliente } = await criarTenantComCliente('c2');
    await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id));

    for (const metodo of ['put', 'patch', 'delete']) {
      const res = await request(app)[metodo]('/api/v1/gdpr/consent')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect([404, 405]).toContain(res.status);
    }
  });

  it('o modelo não regista updatedAt', async () => {
    const { token, cliente, models } = await criarTenantComCliente('c2b');
    await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id));

    const doc = await models.ConsentLog.findOne({}).lean();
    expect(doc.createdAt).toBeTruthy();
    expect(doc.updatedAt).toBeUndefined();
  });
});

describe('C3 + C6 — campos do servidor não vêm do corpo', () => {
  it('ignora versao/actor/textoHash/registadoPor/ip/fichaTokenId enviados no body', async () => {
    const { token, cliente, user, models } = await criarTenantComCliente('c3');

    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, {
        versao: '1999-01-01',
        actor: 'titular',
        textoHash: 'sha256:forjado',
        registadoPor: '000000000000000000000000',
        ip: '1.2.3.4',
        fichaTokenId: '000000000000000000000000',
        tenantId: '000000000000000000000000',
      }));

    expect(res.status).toBe(201);
    const doc = await models.ConsentLog.findOne({}).lean();
    expect(doc.versao).toBe(POLICY_VERSION);
    expect(doc.actor).toBe('funcionario');
    expect(doc.textoHash).toBe(noticeHash());
    expect(String(doc.registadoPor)).toBe(String(user._id));
    expect(doc.fichaTokenId).toBeNull();
    expect(String(doc.tenantId)).not.toBe('000000000000000000000000');
  });

  it('rejeita chaves realmente desconhecidas (apanha typos)', async () => {
    const { token, cliente } = await criarTenantComCliente('c3b');
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, { tipoo: 'marketing' }));
    expect(res.status).toBe(400);
  });
});

describe('C4 — cliente tem de existir no tenant', () => {
  it('cliente desconhecido → 404 e nada é gravado', async () => {
    const { token, models } = await criarTenantComCliente('c4');
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido('000000000000000000000000'));

    expect(res.status).toBe(404);
    expect(await models.ConsentLog.countDocuments({})).toBe(0);
  });
});

describe('C5 + C12 — validação de enums e ObjectId', () => {
  it.each([
    ['tipo fora do enum', 'tipo', { tipo: 'inventado' }],
    ['accao fora do enum', 'accao', { accao: 'talvez' }],
    ['origem fora do enum', 'origem', { origem: 'telepatia' }],
    ['politica_privacidade já não é consentimento (C12)', 'politica', { tipo: 'politica_privacidade' }],
  ])('%s → 400', async (_nome, slug, override) => {
    const { token, cliente, models } = await criarTenantComCliente(`c5-${slug}`);
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, override));

    expect(res.status).toBe(400);
    expect(await models.ConsentLog.countDocuments({})).toBe(0);
  });

  it('clienteId inválido → 400', async () => {
    const { token } = await criarTenantComCliente('c5-id');
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido('nao-e-um-objectid'));
    expect(res.status).toBe(400);
  });
});

describe('C7 — histórico: gate de role, ordenação e paginação', () => {
  it('recepcionista → 403; admin → 200', async () => {
    const recep = await criarTenantComCliente('c7-recep', { role: 'recepcionista' });
    const negado = await request(app)
      .get(`/api/v1/gdpr/consent?clienteId=${recep.cliente._id}`)
      .set('Authorization', `Bearer ${recep.token}`);
    expect(negado.status).toBe(403);

    const admin = await criarTenantComCliente('c7-admin');
    const ok = await request(app)
      .get(`/api/v1/gdpr/consent?clienteId=${admin.cliente._id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(ok.status).toBe(200);
  });

  it('ordena do mais recente e limita o limit a 100', async () => {
    const { token, cliente } = await criarTenantComCliente('c7-pag');

    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, { tipo: 'marketing' }));
    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, { tipo: 'whatsapp_optin', accao: 'withdrawn', evidencia: undefined }));

    const res = await request(app)
      .get(`/api/v1/gdpr/consent?clienteId=${cliente._id}&limit=500`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.limit).toBe(100);
    expect(res.body.pagination.total).toBe(2);
    const datas = res.body.data.map((e) => new Date(e.createdAt).getTime());
    expect(datas[0]).toBeGreaterThanOrEqual(datas[1]);
  });
});

describe('C8 — isolamento multi-tenant', () => {
  it('Tenant B não regista consentimento contra cliente do Tenant A → 404', async () => {
    const a = await criarTenantComCliente('c8-a');
    const b = await criarTenantComCliente('c8-b');

    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${b.token}`)
      .send(corpoValido(a.cliente._id));

    expect(res.status).toBe(404);
    expect(await a.models.ConsentLog.countDocuments({})).toBe(0);
    expect(await b.models.ConsentLog.countDocuments({})).toBe(0);
  });

  it('Tenant B não lê o histórico do cliente do Tenant A', async () => {
    const a = await criarTenantComCliente('c8-c');
    const b = await criarTenantComCliente('c8-d');

    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${a.token}`)
      .send(corpoValido(a.cliente._id));

    const res = await request(app)
      .get(`/api/v1/gdpr/consent?clienteId=${a.cliente._id}`)
      .set('Authorization', `Bearer ${b.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('C9 — registar é aberto a qualquer staff', () => {
  it('recepcionista consegue registar (mesmo sem poder ler o histórico)', async () => {
    const { token, cliente, models } = await criarTenantComCliente('c9', { role: 'recepcionista' });
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id));

    expect(res.status).toBe(201);
    expect(await models.ConsentLog.countDocuments({})).toBe(1);
  });
});

describe('C10 — concessão assistida exige evidência; retirada não', () => {
  it('granted sem evidencia → 400 e nada gravado', async () => {
    const { token, cliente, models } = await criarTenantComCliente('c10-a');
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send({ clienteId: String(cliente._id), tipo: 'marketing', accao: 'granted', origem: 'painel' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/evidencia/i);
    expect(await models.ConsentLog.countDocuments({})).toBe(0);
  });

  it('granted com evidencia → 201 e evidência guardada', async () => {
    const { token, cliente } = await criarTenantComCliente('c10-b');
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, { evidencia: 'Pedido verbal, com a gerente presente' }));

    expect(res.status).toBe(201);
    expect(res.body.data.evidencia).toBe('Pedido verbal, com a gerente presente');
  });

  it('withdrawn sem evidencia → 201 (opor-se é sem fricção)', async () => {
    const { token, cliente } = await criarTenantComCliente('c10-c');
    const res = await request(app)
      .post('/api/v1/gdpr/consent')
      .set('Authorization', `Bearer ${token}`)
      .send({ clienteId: String(cliente._id), tipo: 'marketing', accao: 'withdrawn', origem: 'painel' });

    expect(res.status).toBe(201);
    expect(res.body.data.evidencia).toBeNull();
  });
});

describe('C11 — NoticeReceipt existe, é append-only e não tem rotas', () => {
  it('nenhuma rota HTTP sob /gdpr o expõe', async () => {
    const { token } = await criarTenantComCliente('c11-a');
    for (const caminho of ['/api/v1/gdpr/notice', '/api/v1/gdpr/notice-receipt', '/api/v1/gdpr/avisos']) {
      const res = await request(app).get(caminho).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    }
  });

  it('record() grava versao/textoHash/canal e não regista updatedAt', async () => {
    const { tenant, cliente, models } = await criarTenantComCliente('c11-b');

    await models.NoticeReceipt.record({
      tenantId: tenant._id,
      clienteId: cliente._id,
      versao: POLICY_VERSION,
      textoHash: noticeHash(),
      canal: 'formulario',
      ip: '127.0.0.1',
    });

    const doc = await models.NoticeReceipt.findOne({}).lean();
    expect(doc).toMatchObject({ versao: POLICY_VERSION, canal: 'formulario' });
    expect(doc.textoHash).toBe(noticeHash());
    expect(doc.createdAt).toBeTruthy();
    expect(doc.updatedAt).toBeUndefined();
  });
});

describe('estadoAtual — derivação única do estado (R3, consumida por F02/F09/F10)', () => {
  it('sem entradas → tudo pendente', async () => {
    const { tenant, cliente, models } = await criarTenantComCliente('ea-a');
    const estado = await models.ConsentLog.estadoAtual(tenant._id, cliente._id);

    expect(estado.dados_saude).toMatchObject({ estado: 'pendente', data: null });
    expect(estado.whatsapp_optin.estado).toBe('pendente');
    expect(estado.marketing.estado).toBe('pendente');
  });

  it('reduz ao mais recente por tipo, sem misturar tipos', async () => {
    const { token, tenant, cliente, models } = await criarTenantComCliente('ea-b');

    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, { tipo: 'marketing', accao: 'granted' }));
    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${token}`)
      .send({ clienteId: String(cliente._id), tipo: 'marketing', accao: 'withdrawn', origem: 'painel' });
    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${token}`)
      .send(corpoValido(cliente._id, { tipo: 'dados_saude', accao: 'granted' }));

    const estado = await models.ConsentLog.estadoAtual(tenant._id, cliente._id);

    expect(estado.marketing.estado).toBe('withdrawn');
    expect(estado.dados_saude.estado).toBe('granted');
    expect(estado.dados_saude.actor).toBe('funcionario');
    expect(estado.whatsapp_optin.estado).toBe('pendente');
  });

  it('é tenant-scoped', async () => {
    const a = await criarTenantComCliente('ea-c');
    const b = await criarTenantComCliente('ea-d');

    await request(app).post('/api/v1/gdpr/consent').set('Authorization', `Bearer ${a.token}`)
      .send(corpoValido(a.cliente._id, { tipo: 'dados_saude' }));

    const estadoB = await b.models.ConsentLog.estadoAtual(b.tenant._id, a.cliente._id);
    expect(estadoB.dados_saude.estado).toBe('pendente');
  });
});
