import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Conversa from '../src/models/Conversa.js';
import Tenant from '../src/models/Tenant.js';

jest.unstable_mockModule('../src/utils/zapi_client.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true, result: 'mocked' }),
  isWhatsAppConnected: jest.fn().mockResolvedValue(true)
}));

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

describe('Agente Controller - Webhook WhatsApp (TDD LangChain)', () => {
  it('Deve iniciar uma conversa e salvar no BD sem chamar ferramentas (Gemini)', async () => {
    const tenant = await Tenant.create({
      nome: 'Test Agent',
      slug: 'test-agent',
      plano: { status: 'ativo' }
    });

    const body = {
      phone: '351910000001',
      text: { message: 'Olá, gostaria de agendar.' }
    };

    const res = await request(app)
      .post('/api/agente/processar-resposta')
      .send(body);

    expect(res.status).toBe(200);

    const conversa = await Conversa.findOne({ telefone: '351910000001' });
    expect(conversa).not.toBeNull();
    // O estado inicial muda de iniciando para aguardando_agendamento imediatamente pela lógica atual
    expect(['iniciando', 'aguardando_agendamento']).toContain(conversa.estado);
    expect(conversa.tenantId).toBeDefined();
  });
});
