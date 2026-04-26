import request from 'supertest';
import app from '../src/app.js';
import { clearDB, setupTestDB, teardownTestDB } from './setup.js';
import ProcessedMessage from '../src/models/ProcessedMessage.js';
import { jest } from '@jest/globals';

// Mock evolutionClient — o teste valida que o webhook responde rápido
// mesmo quando sendWhatsAppMessage demora (ack-first pattern).
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn(
    () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 3000))
  )
}));

describe('Webhook async processing (ack-first)', () => {
  const WEBHOOK_URL = '/webhook/evolution';
  const VALID_API_KEY = 'test-secret-key';

  beforeAll(async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = VALID_API_KEY;
    await setupTestDB();
  });

  afterAll(teardownTestDB);
  beforeEach(clearDB);

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

  it('responde 200 rapidamente mesmo com sendWhatsAppMessage lento (3s)', async () => {
    const start = Date.now();
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload('msg-async-001', 'sim'));
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(200);
    // Antes do refactor: response esperaria sendWhatsAppMessage completar (3s+)
    // Depois do refactor (ack-first): response retorna logo após Validações 1-4.5
    // Margem generosa de 1500ms cobre overhead de Mongoose connect + queries
    expect(elapsedMs).toBeLessThan(1500);
    expect(res.body.message).toMatch(/processando/i);
  });

  it('persiste ProcessedMessage mesmo no path async (Validação 4.5 corre antes do ack)', async () => {
    // ACK acontece DEPOIS de markMessageSeen — confirma que dedupe é síncrono
    await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload('msg-async-002', 'sim'));

    // Verifica que a mensagem foi marcada (sem timing dependente de fire-and-forget)
    const stored = await ProcessedMessage.findOne({ messageId: 'msg-async-002' });
    expect(stored).not.toBeNull();
    expect(stored.messageId).toBe('msg-async-002');
  });
});
