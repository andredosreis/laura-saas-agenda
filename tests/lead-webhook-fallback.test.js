import request from 'supertest';
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
  checkHealth: jest.fn().mockResolvedValue({ reachable: false }),
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

describe('Webhook fallback quando ia-service falha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EVOLUTION_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.IA_SERVICE_URL = 'http://unreachable:8000';
    process.env.IA_SERVICE_ENABLED = 'true';
  });

  it('ACK 200 mesmo quando ia-service falha (fallback transparente)', async () => {
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', WEBHOOK_SECRET)
      .send({
        event: 'messages.upsert',
        instance: 'marcai',
        data: {
          key: { remoteJid: '351912000001@s.whatsapp.net', fromMe: false, id: `fallback_${Date.now()}` },
          message: { conversation: 'Olá' },
          messageTimestamp: Math.floor(Date.now() / 1000),
          messageType: 'conversation',
        },
      });

    expect(res.status).toBe(200);
  });
});
