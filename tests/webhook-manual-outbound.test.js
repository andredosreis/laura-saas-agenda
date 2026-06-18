/**
 * Testes do registo de saídas manuais (fromMe) — a profissional responde pelo
 * telemóvel pessoal e a mensagem tem de ficar gravada no inbox.
 *
 * Cobre:
 *   - fromMe com texto → Mensagem(origem='laura', direcao='saida', geradoPor='humano')
 *   - dedup do eco: fromMe cujo texto já existe como saída recente → NÃO duplica
 *   - fromMe NUNCA invoca a IA (anti-loop preservado)
 *   - fromMe sem texto (ex.: media) → ignorado
 *
 * @see src/modules/messaging/handlers/manualOutbound.js
 */

import { jest } from '@jest/globals';

const processLeadCalls = [];
const processClientCalls = [];

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));
jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead: jest.fn().mockImplementation((args) => {
    processLeadCalls.push(args);
    return Promise.resolve({ success: true, source: 'agent' });
  }),
  processClient: jest.fn().mockImplementation((args) => {
    processClientCalls.push(args);
    return Promise.resolve({ success: true, source: 'agent' });
  }),
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../src/app.js');
const { clearDB, setupTestDB, teardownTestDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

const WEBHOOK_URL = '/webhook/evolution';
const VALID_API_KEY = 'test-secret-key';

const flushAsync = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

function buildFromMePayload({ messageId, phone, text, instance = 'marcai' }) {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: true },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: text },
    },
  };
}

function createTenant() {
  return Tenant.create({
    nome: 'Marcai Test',
    slug: 'marcai-test',
    plano: { tipo: 'pro', status: 'ativo', trialDias: 7 },
    limites: { maxLeads: 100, leadsAtivo: true },
    whatsapp: { instanceName: 'marcai' },
  });
}

describe('Webhook — registo de saídas manuais (fromMe)', () => {
  beforeAll(async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = VALID_API_KEY;
    process.env.IA_SERVICE_URL = 'http://ia-service-test.local';
    process.env.IA_SERVICE_ENABLED = 'true';
    await setupTestDB();
  });

  afterAll(teardownTestDB);

  afterEach(async () => {
    await flushAsync(500);
  });

  beforeEach(async () => {
    await clearDB();
    processLeadCalls.length = 0;
    processClientCalls.length = 0;
  });

  test('fromMe com texto → grava saída humana, pausa a IA e NÃO invoca a IA', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Mensagem, Cliente } = getModels(getTenantDB(tenantId));

    // Cliente com a IA ativa — deve ficar pausado após a resposta manual.
    const cliente = await Cliente.create({
      tenantId,
      nome: 'Maria',
      telefone: '351912345678',
      iaAtiva: true,
    });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildFromMePayload({ messageId: 'out-1', phone: '351912345678', text: 'Olá, pode vir às 15h' }));

    expect(res.status).toBe(200);
    await flushAsync();

    const msgs = await Mensagem.find({ direcao: 'saida' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].origem).toBe('laura');
    expect(msgs[0].geradoPor).toBe('humano');
    expect(msgs[0].mensagem).toBe('Olá, pode vir às 15h');
    expect(msgs[0].conversa).toBeTruthy();

    // Handoff automático: a IA fica pausada neste contacto.
    const clienteAtual = await Cliente.findById(cliente._id);
    expect(clienteAtual.iaAtiva).toBe(false);

    // Anti-loop: a IA nunca é invocada para uma saída.
    expect(processLeadCalls).toHaveLength(0);
    expect(processClientCalls).toHaveLength(0);
  });

  test('dedup do eco: fromMe cujo texto já existe como saída recente não duplica', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Mensagem, Conversa, Cliente } = getModels(getTenantDB(tenantId));

    // Cliente com IA ativa — o eco NÃO deve pausá-la.
    const cliente = await Cliente.create({
      tenantId,
      nome: 'João',
      telefone: '351912345678',
      iaAtiva: true,
    });

    // Simula uma saída já gravada no envio (ex.: resposta da IA).
    const conversa = await Conversa.create({
      tenantId,
      telefone: '912345678',
      estado: 'aguardando_agendamento',
    });
    await Mensagem.create({
      tenantId,
      telefone: '912345678',
      mensagem: 'Confirmado para as 15h ✅',
      origem: 'laura',
      direcao: 'saida',
      geradoPor: 'ia',
      conversa: conversa._id,
      data: new Date(),
    });

    // Eco do Evolution com o MESMO texto.
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildFromMePayload({ messageId: 'out-echo', phone: '351912345678', text: 'Confirmado para as 15h ✅' }));

    expect(res.status).toBe(200);
    await flushAsync();

    const saidas = await Mensagem.find({ direcao: 'saida' });
    expect(saidas).toHaveLength(1); // não duplicou
    expect(saidas[0].geradoPor).toBe('ia');

    // O eco não é resposta manual → não pausa a IA.
    const clienteAtual = await Cliente.findById(cliente._id);
    expect(clienteAtual.iaAtiva).toBe(true);
  });

  test('fromMe sem texto e sem media (vazio) é ignorado', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Mensagem } = getModels(getTenantDB(tenantId));

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildFromMePayload({ messageId: 'out-vazio', phone: '351912345678', text: '' }));

    expect(res.status).toBe(200);
    await flushAsync();

    const msgs = await Mensagem.find({ direcao: 'saida' });
    expect(msgs).toHaveLength(0);
  });

  function buildFromMeMediaPayload({ messageId, phone, message, messageType, instance = 'marcai' }) {
    return {
      event: 'messages.upsert',
      instance,
      data: {
        key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: true },
        messageTimestamp: Math.floor(Date.now() / 1000),
        messageType,
        message,
      },
    };
  }

  test('fromMe com áudio (sem texto) → grava placeholder 🎤 [áudio] na thread', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Mensagem } = getModels(getTenantDB(tenantId));

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildFromMeMediaPayload({
        messageId: 'out-audio',
        phone: '351912345678',
        messageType: 'audioMessage',
        message: { audioMessage: { mimetype: 'audio/ogg' } },
      }));

    expect(res.status).toBe(200);
    await flushAsync();

    const msgs = await Mensagem.find({ direcao: 'saida' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].mensagem).toBe('🎤 [áudio]');
    expect(msgs[0].origem).toBe('laura');
    expect(msgs[0].geradoPor).toBe('humano');
  });

  test('fromMe com imagem (sem texto) → grava placeholder 🖼️ [imagem]', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Mensagem } = getModels(getTenantDB(tenantId));

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildFromMeMediaPayload({
        messageId: 'out-img',
        phone: '351912345678',
        messageType: 'imageMessage',
        message: { imageMessage: { mimetype: 'image/jpeg' } },
      }));

    expect(res.status).toBe(200);
    await flushAsync();

    const msgs = await Mensagem.find({ direcao: 'saida' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].mensagem).toBe('🖼️ [imagem]');
  });
});
