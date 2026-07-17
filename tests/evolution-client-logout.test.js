/**
 * F21 — classificação de erros do `logoutInstance` (unidade, sem rede).
 *
 * Prova que o CLIENT distingue "instância já desligada / inexistente" (idempotente)
 * de uma falha genuína — em vez de deixar isso a um mock no teste do controller.
 * O corpo de erro da Evolution é o real: `{ status, response: { message: [...] } }`.
 */

import { jest } from '@jest/globals';

process.env.EVOLUTION_API_URL = 'http://evolution.test';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'env-default';

jest.unstable_mockModule('axios', () => ({
  default: {
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const axios = (await import('axios')).default;
const { logoutInstance } = await import('../src/utils/evolutionClient.js');

// Réplica de um erro axios: `error.response.data` é o corpo devolvido pela Evolution.
const axiosError = (status, data) => Object.assign(new Error('Request failed'), { response: { status, data } });

beforeEach(() => {
  axios.delete.mockReset();
});

describe('logoutInstance — classificação de erros (F21)', () => {
  it('sucesso → { ok: true }', async () => {
    axios.delete.mockResolvedValue({ data: { status: 'SUCCESS', error: false } });
    const res = await logoutInstance('inst-a');
    expect(res).toEqual({ ok: true });
    expect(axios.delete).toHaveBeenCalledWith(
      'http://evolution.test/instance/logout/inst-a',
      expect.objectContaining({ headers: { apikey: 'test-api-key' }, timeout: expect.any(Number) }),
    );
  });

  it('404 (instância inexistente) → notFound:true', async () => {
    axios.delete.mockRejectedValue(
      axiosError(404, { status: 404, error: 'Not Found', response: { message: ['The "x" instance does not exist'] } }),
    );
    const res = await logoutInstance('inst-x');
    expect(res.ok).toBe(false);
    expect(res.notFound).toBe(true);
    expect(res.alreadyOff).toBe(false);
  });

  it('"is not connected" no corpo (array) → alreadyOff:true', async () => {
    axios.delete.mockRejectedValue(
      axiosError(400, { status: 400, error: 'Bad Request', response: { message: ['Instance "inst-b" is not connected'] } }),
    );
    const res = await logoutInstance('inst-b');
    expect(res.ok).toBe(false);
    expect(res.alreadyOff).toBe(true);
    expect(res.notFound).toBe(false);
  });

  it('"not connected" no corpo (string em message) → alreadyOff:true', async () => {
    axios.delete.mockRejectedValue(axiosError(500, { message: 'The instance is not connected' }));
    const res = await logoutInstance('inst-c');
    expect(res.alreadyOff).toBe(true);
  });

  it('falha genuína (Evolution em baixo, sem corpo) → nem notFound nem alreadyOff', async () => {
    axios.delete.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const res = await logoutInstance('inst-d');
    expect(res.ok).toBe(false);
    expect(res.notFound).toBe(false);
    expect(res.alreadyOff).toBe(false);
  });

  it('erro 500 com mensagem não relacionada → NÃO é idempotente', async () => {
    axios.delete.mockRejectedValue(axiosError(500, { response: { message: ['Internal server error'] } }));
    const res = await logoutInstance('inst-e');
    expect(res.alreadyOff).toBe(false);
    expect(res.notFound).toBe(false);
  });
});
