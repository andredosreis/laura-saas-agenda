import { jest } from '@jest/globals';

process.env.EVOLUTION_API_URL = 'http://evolution.test';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'env-default';

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const axios = (await import('axios')).default;
const { getConnectionState, registerSendFailureHandler, sendWhatsAppMessage } =
  await import('../src/utils/evolutionClient.js');

beforeEach(() => { axios.get.mockReset(); axios.post.mockReset(); });

describe('getConnectionState', () => {
  it('caminho feliz → { ok:true, state }', async () => {
    axios.get.mockResolvedValue({ data: { instance: { instanceName: 'marcai', state: 'open' } } });
    const r = await getConnectionState('marcai');
    expect(r).toEqual({ ok: true, state: 'open' });
    expect(axios.get.mock.calls[0][0]).toBe('http://evolution.test/instance/connectionState/marcai');
    expect(axios.get.mock.calls[0][1].headers).toMatchObject({ apikey: 'test-api-key' });
  });
  it('erro de rede → { ok:false, unreachable:true }', async () => {
    axios.get.mockRejectedValue({ message: 'ECONNREFUSED' });
    const r = await getConnectionState('marcai');
    expect(r.ok).toBe(false);
    expect(r.unreachable).toBe(true);
  });
});

describe('registerSendFailureHandler', () => {
  it('invoca o handler com (instance, errorPayload) quando o envio falha', async () => {
    axios.post.mockRejectedValue({ response: { data: { response: { message: 'Connection Closed' } } } });
    const handler = jest.fn();
    registerSendFailureHandler(handler);
    await sendWhatsAppMessage('912345678', 'oi', 'marcai');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe('marcai');
    registerSendFailureHandler(null); // limpa para não afectar outros testes
  });
  it('não invoca handler quando o envio tem sucesso', async () => {
    axios.post.mockResolvedValue({ data: { ok: true } });
    const handler = jest.fn();
    registerSendFailureHandler(handler);
    await sendWhatsAppMessage('912345678', 'oi', 'marcai');
    expect(handler).not.toHaveBeenCalled();
    registerSendFailureHandler(null);
  });
});
