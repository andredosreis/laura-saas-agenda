/**
 * Integration tests — Inbox de Conversas (FDD fdd-conversas-inbox.md).
 *
 * Cobre os 4 endpoints consolidados (list / mensagens / reply / pause-ai)
 * e o isolamento multi-tenant. Evolution é mockado (nunca envia WhatsApp real).
 *
 * Dados de conversa vivem na DB-per-tenant (ADR-001), por isso são semeados
 * via `getModels(getTenantDB(id))` — o mesmo caminho que `req.models` usa.
 */

import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));

const { default: app } = await import('../src/app.js');
const { sendWhatsAppMessage } = await import('../src/utils/evolutionClient.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: User } = await import('../src/models/User.js');
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');
const jwt = (await import('jsonwebtoken')).default;

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  jest.clearAllMocks();
});

async function criarTenantEToken(slug = 'inbox-salon') {
  const tenant = await Tenant.create({
    nome: 'Salão Inbox',
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
    whatsapp: { instanceName: slug },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  return { tenant, user, token, models: getModels(getTenantDB(tenant._id.toString())) };
}

/**
 * Semeia um cliente + uma thread: 1 saida (IA) seguida de 2 entradas (cliente),
 * de modo que a última direcção seja 'entrada' e naoLidas = 2.
 * Mensagens guardadas com indicativo (351...), cliente sem indicativo — testa
 * a fusão por telefone canónico.
 */
async function seedConversaCliente(tenant, models, { iaAtiva = true } = {}) {
  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: 'André Cliente',
    telefone: '912462033',
    iaAtiva,
  });
  const conversa = await models.Conversa.create({
    tenantId: tenant._id,
    telefone: '912462033',
    estado: 'aguardando_agendamento',
  });
  const base = new Date('2026-05-31T10:00:00Z').getTime();
  await models.Mensagem.create([
    { tenantId: tenant._id, telefone: '351912462033', mensagem: 'Olá, em que posso ajudar?', origem: 'laura', direcao: 'saida', geradoPor: 'ia', data: new Date(base), conversa: conversa._id },
    { tenantId: tenant._id, telefone: '351912462033', mensagem: 'Queria marcar', origem: 'cliente', direcao: 'entrada', data: new Date(base + 60_000), conversa: conversa._id },
    { tenantId: tenant._id, telefone: '351912462033', mensagem: 'Para quinta?', origem: 'cliente', direcao: 'entrada', data: new Date(base + 120_000), conversa: conversa._id },
  ]);
  return { cliente, conversa };
}

// ── GET /conversas ───────────────────────────────────────────────────

describe('GET /api/conversas', () => {
  it('lista consolidada com selo de cliente, última mensagem e não-lidas', async () => {
    const { tenant, token, models } = await criarTenantEToken();
    await seedConversaCliente(tenant, models);

    const res = await request(app)
      .get('/api/conversas')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    const conv = res.body.data[0];
    expect(conv.telefone).toBe('912462033');
    expect(conv.tipo).toBe('cliente');
    expect(conv.nome).toBe('André Cliente');
    expect(conv.iaAtiva).toBe(true);
    expect(conv.ultimaMensagem).toBe('Para quinta?');
    expect(conv.ultimaDirecao).toBe('entrada');
    expect(conv.naoLidas).toBe(2);
    expect(res.body.pagination.total).toBe(1);
  });

  it('filtra por tipo=clientes', async () => {
    const { tenant, token, models } = await criarTenantEToken();
    await seedConversaCliente(tenant, models);

    const res = await request(app)
      .get('/api/conversas?tipo=leads')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0); // a única conversa é de cliente
  });
});

// ── GET /conversas/:telefone/mensagens ────────────────────────────────

describe('GET /api/conversas/:telefone/mensagens', () => {
  it('devolve a thread em ordem cronológica', async () => {
    const { tenant, token, models } = await criarTenantEToken();
    await seedConversaCliente(tenant, models);

    const res = await request(app)
      .get('/api/conversas/912462033/mensagens')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].mensagem).toBe('Olá, em que posso ajudar?');
    expect(res.body.data[0].geradoPor).toBe('ia');
    expect(res.body.data[2].mensagem).toBe('Para quinta?');
  });
});

// ── POST /conversas/:telefone/reply ───────────────────────────────────

describe('POST /api/conversas/:telefone/reply', () => {
  it('envia via Evolution, persiste outbound geradoPor=humano', async () => {
    const { tenant, token, models } = await criarTenantEToken();
    await seedConversaCliente(tenant, models);

    const res = await request(app)
      .post('/api/conversas/912462033/reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ mensagem: 'Claro, quinta às 15h fica bem?' });

    expect(res.status).toBe(200);
    expect(res.body.data.enviado).toBe(true);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);

    const outbound = await models.Mensagem.findOne({ geradoPor: 'humano' }).lean();
    expect(outbound).not.toBeNull();
    expect(outbound.direcao).toBe('saida');
    expect(outbound.origem).toBe('laura');
  });

  it('com pausarIa=true desliga a IA do cliente', async () => {
    const { tenant, token, models } = await criarTenantEToken();
    const { cliente } = await seedConversaCliente(tenant, models);

    const res = await request(app)
      .post('/api/conversas/912462033/reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ mensagem: 'Eu assumo daqui.', pausarIa: true });

    expect(res.status).toBe(200);
    expect(res.body.data.iaAtiva).toBe(false);
    const atualizado = await models.Cliente.findById(cliente._id).lean();
    expect(atualizado.iaAtiva).toBe(false);
  });

  it('rejeita mensagem vazia com 400', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .post('/api/conversas/912462033/reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ mensagem: '   ' });
    expect(res.status).toBe(400);
  });
});

// ── POST /conversas/:telefone/pause-ai ────────────────────────────────

describe('POST /api/conversas/:telefone/pause-ai', () => {
  it('alterna a IA do cliente (pausar e retomar)', async () => {
    const { tenant, token, models } = await criarTenantEToken();
    const { cliente } = await seedConversaCliente(tenant, models);

    const pausa = await request(app)
      .post('/api/conversas/912462033/pause-ai')
      .set('Authorization', `Bearer ${token}`)
      .send({ ativa: false });
    expect(pausa.status).toBe(200);
    expect(pausa.body.data.iaAtiva).toBe(false);
    expect((await models.Cliente.findById(cliente._id).lean()).iaAtiva).toBe(false);

    const retoma = await request(app)
      .post('/api/conversas/912462033/pause-ai')
      .set('Authorization', `Bearer ${token}`)
      .send({ ativa: true });
    expect(retoma.status).toBe(200);
    expect(retoma.body.data.iaAtiva).toBe(true);
    expect((await models.Cliente.findById(cliente._id).lean()).iaAtiva).toBe(true);
  });

  it('404 quando nenhum contacto casa o telefone', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .post('/api/conversas/919999999/pause-ai')
      .set('Authorization', `Bearer ${token}`)
      .send({ ativa: false });
    expect(res.status).toBe(404);
  });
});

// ── Isolamento multi-tenant ───────────────────────────────────────────

describe('Isolamento multi-tenant — Conversas', () => {
  it('Tenant B não vê a conversa do Tenant A nem pausa a IA do telefone dele', async () => {
    const a = await criarTenantEToken('inbox-a');
    await seedConversaCliente(a.tenant, a.models);

    const b = await criarTenantEToken('inbox-b');

    // B lista — não deve conter a conversa de A
    const lista = await request(app)
      .get('/api/conversas')
      .set('Authorization', `Bearer ${b.token}`);
    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(0);

    // B tenta pausar a IA do telefone de A → 404 (não existe no tenant de B)
    const pausa = await request(app)
      .post('/api/conversas/912462033/pause-ai')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ ativa: false });
    expect(pausa.status).toBe(404);

    // E a IA do cliente de A permanece intacta
    const clienteA = await a.models.Cliente.findOne({ telefone: '912462033' }).lean();
    expect(clienteA.iaAtiva).toBe(true);
  });
});
