import request from 'supertest';
import app from '../src/app.js';
import { clearDB, setupTestDB, teardownTestDB } from './setup.js';
import { jest } from '@jest/globals';

// Mock evolutionClient to prevent actual HTTP calls during testing
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true })
}));

describe('Webhook Evolution API', () => {
  const WEBHOOK_URL = '/webhook/evolution';
  const VALID_API_KEY = 'test-secret-key';
  
  beforeAll(async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = VALID_API_KEY;
    await setupTestDB();
  });
  
  afterAll(teardownTestDB);
  beforeEach(clearDB);

  describe('Auth Middleware (validateWebhook)', () => {
    it('returns 401 when apikey header is missing', async () => {
      const response = await request(app)
        .post(WEBHOOK_URL)
        .send({ event: 'messages.upsert' });
        
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Webhook não autorizado');
    });

    it('returns 401 when apikey header is invalid', async () => {
      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('apikey', 'wrong-key')
        .send({ event: 'messages.upsert' });
        
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Controller Logic (webhookController)', () => {
    it('ignores empty payloads or invalid events', async () => {
      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('apikey', VALID_API_KEY)
        .send({ event: 'some.other.event' });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Evento ignorado');
    });

    it('ignores messages from the system itself (fromMe)', async () => {
      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('apikey', VALID_API_KEY)
        .send({
          event: 'messages.upsert',
          data: {
            key: { fromMe: true }
          }
        });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Mensagem do salão ignorada');
    });

    it('defensively falls back and ignores @lid identifiers (ADR-016)', async () => {
      const response = await request(app)
        .post(WEBHOOK_URL)
        .set('apikey', VALID_API_KEY)
        .send({
          event: 'messages.upsert',
          data: {
            messageTimestamp: Math.floor(Date.now() / 1000), // recent message
            key: {
              fromMe: false,
              remoteJid: '123456789@lid'
            },
            message: {
              conversation: 'sim'
            }
          }
        });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('LID ignorado, aguardando resolução');
    });
  });
});
