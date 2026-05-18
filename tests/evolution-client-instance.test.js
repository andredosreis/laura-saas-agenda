/**
 * Phase 0 — ADR-021: evolutionClient.sendWhatsAppMessage aceita override
 * de instanceName, mantendo retrocompat com o env EVOLUTION_INSTANCE.
 */

import { jest } from '@jest/globals';

// Env vars TÊM de ser definidas antes do import dinâmico, porque o módulo
// captura os valores em const no top-level.
process.env.EVOLUTION_API_URL = 'http://evolution.test';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'env-default';

// Mock axios antes de importar o módulo que o usa.
jest.unstable_mockModule('axios', () => ({
  default: {
    post: jest.fn().mockResolvedValue({ data: { messageId: 'mock-id' } }),
  },
}));

// Mock do logger para não poluir output.
jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const axios = (await import('axios')).default;
const { sendWhatsAppMessage } = await import('../src/utils/evolutionClient.js');

beforeEach(() => {
  axios.post.mockClear();
});

describe('sendWhatsAppMessage — instanceName override (ADR-021)', () => {
  it('usa EVOLUTION_INSTANCE do env quando instanceName não é passado', async () => {
    await sendWhatsAppMessage('351912345678', 'Olá');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url] = axios.post.mock.calls[0];
    expect(url).toBe('http://evolution.test/message/sendText/env-default');
  });

  it('usa o instanceName passado como 3º argumento', async () => {
    await sendWhatsAppMessage('351912345678', 'Olá', 'clinica-a');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url] = axios.post.mock.calls[0];
    expect(url).toBe('http://evolution.test/message/sendText/clinica-a');
  });

  it('cai no env default quando instanceName é vazio/whitespace', async () => {
    await sendWhatsAppMessage('351912345678', 'Olá', '');
    await sendWhatsAppMessage('351912345678', 'Olá', '   ');

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][0]).toBe('http://evolution.test/message/sendText/env-default');
    expect(axios.post.mock.calls[1][0]).toBe('http://evolution.test/message/sendText/env-default');
  });

  it('cai no env default quando instanceName é null/undefined', async () => {
    await sendWhatsAppMessage('351912345678', 'Olá', null);
    await sendWhatsAppMessage('351912345678', 'Olá', undefined);

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][0]).toBe('http://evolution.test/message/sendText/env-default');
    expect(axios.post.mock.calls[1][0]).toBe('http://evolution.test/message/sendText/env-default');
  });

  it('preserva o body { number, text } e headers apikey', async () => {
    await sendWhatsAppMessage('912345678', 'mensagem', 'clinic-x');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, body, options] = axios.post.mock.calls[0];
    expect(body).toEqual({ number: '351912345678', text: 'mensagem' });
    expect(options.headers).toMatchObject({
      apikey: 'test-api-key',
      'Content-Type': 'application/json',
    });
  });

  it('devolve { success:false } quando EVOLUTION_API_URL não está configurado', async () => {
    // Salva e remove temporariamente para testar o early return — sem reimportar
    // o módulo, este teste passa somente se o early-return olhar para o snapshot
    // do top-level. Para validar, criamos um path negativo via re-import dinâmico.
    const originalUrl = process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_URL;

    jest.resetModules();
    const mod = await import('../src/utils/evolutionClient.js?nocfg');
    const result = await mod.sendWhatsAppMessage('912345678', 'msg');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Evolution API não configurada/);

    process.env.EVOLUTION_API_URL = originalUrl;
  });
});
