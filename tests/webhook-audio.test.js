/**
 * Testes do fluxo de áudio (notas de voz): o webhook descarrega o áudio do
 * Evolution, transcreve via ia-service (Gemini) e injecta a transcrição no
 * pipeline normal — como se fosse uma mensagem de texto.
 *
 * Mocks: evolutionClient.getMediaBase64 + iaServiceClient.transcribeAudio
 * (e processLead/processClient) para não tocar em serviços externos.
 */

import { jest } from '@jest/globals';

const processLeadCalls = [];
const transcribeCalls = [];
let transcribeText = 'quero marcar para sexta às 15h';
let mediaResult = { success: true, base64: 'AUDIO_B64', mimetype: 'audio/ogg' };

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
  getMediaBase64: jest.fn().mockImplementation(() => Promise.resolve(mediaResult)),
}));
jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead: jest.fn().mockImplementation((args) => {
    processLeadCalls.push(args);
    return Promise.resolve({ success: true, source: 'agent' });
  }),
  processClient: jest.fn().mockResolvedValue({ success: true, source: 'agent' }),
  transcribeAudio: jest.fn().mockImplementation((args) => {
    transcribeCalls.push(args);
    return Promise.resolve({ text: transcribeText });
  }),
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../src/app.js');
const { clearDB, setupTestDB, teardownTestDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const evolutionMock = await import('../src/utils/evolutionClient.js');
const iaServiceMock = await import('../src/utils/iaServiceClient.js');

const WEBHOOK_URL = '/webhook/evolution';
const VALID_API_KEY = 'test-secret-key';
const flushAsync = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

function buildAudioPayload({ messageId, phone, mimetype = 'audio/ogg', instance = 'marcai' }) {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000),
      messageType: 'audioMessage',
      message: { audioMessage: { mimetype } },
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

describe('Webhook — áudio (transcrição)', () => {
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
    transcribeCalls.length = 0;
    transcribeText = 'quero marcar para sexta às 15h';
    mediaResult = { success: true, base64: 'AUDIO_B64', mimetype: 'audio/ogg' };
    evolutionMock.getMediaBase64.mockClear();
    iaServiceMock.transcribeAudio.mockClear();
    iaServiceMock.processLead.mockClear();
  });

  test('áudio → descarrega, transcreve e a transcrição entra no pipeline', async () => {
    await createTenant();

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildAudioPayload({ messageId: 'aud-1', phone: '351999000111' }));

    expect(res.status).toBe(200);
    await flushAsync();

    // Descarregou o áudio e transcreveu com o base64 recebido.
    expect(evolutionMock.getMediaBase64).toHaveBeenCalledTimes(1);
    expect(transcribeCalls).toHaveLength(1);
    expect(transcribeCalls[0].audioBase64).toBe('AUDIO_B64');

    // A transcrição entrou no pipeline (telefone desconhecido → IA_LEAD).
    expect(processLeadCalls).toHaveLength(1);
    expect(processLeadCalls[0].mensagem).toBe('quero marcar para sexta às 15h');
    expect(processLeadCalls[0].telefone).toBe('351999000111');
  });

  test('transcrição vazia (áudio sem fala) → não entra no pipeline', async () => {
    await createTenant();
    transcribeText = '';

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildAudioPayload({ messageId: 'aud-empty', phone: '351999000111' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(transcribeCalls).toHaveLength(1);
    expect(processLeadCalls).toHaveLength(0);
  });

  test('download do áudio falha → não transcreve nem entra no pipeline', async () => {
    await createTenant();
    mediaResult = { success: false, error: 'boom' };

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildAudioPayload({ messageId: 'aud-faildl', phone: '351999000111' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(evolutionMock.getMediaBase64).toHaveBeenCalledTimes(1);
    expect(transcribeCalls).toHaveLength(0);
    expect(processLeadCalls).toHaveLength(0);
  });
});
