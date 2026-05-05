import request from 'supertest';
import { jest } from '@jest/globals';

// Mock ANTES de importar app
jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead: jest.fn().mockResolvedValue({ status: 'processed', lead_id: 'lead123' }),
  checkHealth: jest.fn().mockResolvedValue({ reachable: true }),
}));

jest.unstable_mockModule('../src/utils/webhookDedupe.js', () => ({
  markMessageSeen: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));

const { default: app } = await import('../src/app.js');

const WEBHOOK_SECRET = 'test-secret-key';
const WEBHOOK_URL = '/webhook/evolution';

const buildPayload = (mensagem = 'Olá, quero saber mais', instance = 'marcai') => ({
  event: 'messages.upsert',
  instance,
  data: {
    key: { remoteJid: '351912345678@s.whatsapp.net', fromMe: false, id: `msg_${Date.now()}` },
    message: { conversation: mensagem },
    messageTimestamp: Math.floor(Date.now() / 1000),
    messageType: 'conversation',
  },
});

describe('Webhook gateway → ia-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.IA_SERVICE_URL = 'http://mock-ia-service:8000';
    process.env.IA_SERVICE_ENABLED = 'true';
    process.env.INTERNAL_SERVICE_TOKEN = 'test-token';
  });

  it('ACK 200 imediato para mensagem não-confirmação', async () => {
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', WEBHOOK_SECRET)
      .send(buildPayload('Quero saber sobre drenagem'));

    expect(res.status).toBe(200);
  });

  it('evento não messages.upsert → 200 Evento ignorado', async () => {
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', WEBHOOK_SECRET)
      .send({ event: 'connection.update', data: {} });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/ignorado/i);
  });

  it('mensagem fromMe → ignorada', async () => {
    const payload = buildPayload('qualquer coisa');
    payload.data.key.fromMe = true;
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', WEBHOOK_SECRET)
      .send(payload);

    expect(res.status).toBe(200);
  });
});
