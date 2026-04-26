import request from 'supertest';
import app from '../src/app.js';
import { clearDB, setupTestDB, teardownTestDB } from './setup.js';
import { jest } from '@jest/globals';

// Mock evolutionClient para evitar chamadas HTTP reais
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true })
}));

describe('Webhook anti-replay protection', () => {
  const WEBHOOK_URL = '/webhook/evolution';
  const VALID_API_KEY = 'test-secret-key';

  beforeAll(async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = VALID_API_KEY;
    await setupTestDB();
  });

  afterAll(teardownTestDB);
  beforeEach(clearDB);

  /**
   * Constrói payload Evolution API válido com messageId customizável.
   * O telefone usado não corresponde a nenhum cliente/lead criado nos testes,
   * mas isso é irrelevante para verificar a Validação 4.5 (anti-replay).
   * O webhook responde 200 antes de chegar à resolução de cliente.
   */
  const buildPayload = (messageId, mensagem = 'sim') => ({
    event: 'messages.upsert',
    data: {
      key: {
        id: messageId,
        remoteJid: '351912345678@s.whatsapp.net',
        fromMe: false
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: mensagem }
    }
  });

  it('processa primeira mensagem e bloqueia replay com mesmo messageId', async () => {
    const payload = buildPayload('msg-replay-001');

    // 1ª chamada — deve passar a Validação 4.5 (não duplicada)
    const res1 = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.message).not.toMatch(/duplicada/i);

    // 2ª chamada com mesmo messageId — deve ser bloqueada
    const res2 = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.message).toMatch(/duplicada/i);
  });

  it('processa mensagens distintas (messageIds diferentes) sem bloquear', async () => {
    const res1 = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload('msg-001'));

    const res2 = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload('msg-002'));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.message).not.toMatch(/duplicada/i);
    expect(res2.body.message).not.toMatch(/duplicada/i);
  });

  it('não bloqueia quando messageId está ausente (graceful: processar)', async () => {
    // Payload sem key.id — não há como dedupe
    const payload = {
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '351912345678@s.whatsapp.net',
          fromMe: false
          // id omitido propositadamente
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        message: { conversation: 'sim' }
      }
    };

    const res1 = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(payload);

    const res2 = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(payload);

    // Ambas devem passar (sem ID, sem dedupe)
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.message).not.toMatch(/duplicada/i);
    expect(res2.body.message).not.toMatch(/duplicada/i);
  });
});
