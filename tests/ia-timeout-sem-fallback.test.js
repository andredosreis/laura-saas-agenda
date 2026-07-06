// tests/ia-timeout-sem-fallback.test.js
// Caso real 2026-07-06 14:52 (upgrade p/ gemini-3.5-flash): turno de 25s
// estourava o timeout de 20s do backend → retry reprocessava (resposta
// duplicada) e o handler caía no greeting legacy — 3 mensagens para um "olá".
// Timeout agora: sem retry, sem fallback (a resposta segue pelo ia-service).
// Ligação recusada (serviço down): fallback mantém-se.
import { jest } from '@jest/globals';

const processLead = jest.fn();
const processClient = jest.fn();
jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead,
  processClient,
}));

const legacyHandle = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../src/modules/messaging/handlers/legacyFallback.js', () => ({
  handle: legacyHandle,
}));

const { handle: handleLead } = await import('../src/modules/messaging/handlers/iaLeadLifecycle.js');
const { handle: handleClient } = await import('../src/modules/messaging/handlers/iaClientLifecycle.js');

const baseInput = {
  tenant: { configuracoes: { avisoIA: '' } },
  tenantId: '695413fb6ce936a9097af750',
  telefoneNormalizado: '351912000001',
  mensagem: 'olá',
  messageId: 'm1',
  timestamp: new Date(),
  instanceName: 'marcai',
};

const timeoutErr = () =>
  Object.assign(new Error('timeout of 120000ms exceeded'), { isTimeout: true });

beforeEach(() => jest.clearAllMocks());

describe('iaLeadLifecycle — timeout vs serviço em baixo', () => {
  const input = {
    ...baseInput,
    persistedState: { existingClient: null, existingLead: { _id: 'l1', iaAtiva: true } },
  };

  it('timeout: NÃO cai no greeting legacy (a resposta segue pelo serviço)', async () => {
    processLead.mockRejectedValueOnce(timeoutErr());

    const r = await handleLead(input);

    expect(r).toEqual({ delivered: true, source: 'ia_service' });
    expect(legacyHandle).not.toHaveBeenCalled();
  });

  it('ligação recusada: cai no greeting legacy', async () => {
    processLead.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const r = await handleLead(input);

    expect(r).toEqual({ delivered: true, source: 'fallback' });
    expect(legacyHandle).toHaveBeenCalledTimes(1);
  });
});

describe('iaClientLifecycle — timeout vs serviço em baixo', () => {
  const input = {
    ...baseInput,
    persistedState: {
      existingClient: { _id: 'c1', nome: 'Maria' },
      existingLead: null,
    },
  };

  it('timeout: NÃO cai no greeting legacy', async () => {
    processClient.mockRejectedValueOnce(timeoutErr());

    const r = await handleClient(input);

    expect(r).toEqual({ delivered: true, source: 'ia_service' });
    expect(legacyHandle).not.toHaveBeenCalled();
  });

  it('ligação recusada: cai no greeting legacy', async () => {
    processClient.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const r = await handleClient(input);

    expect(r).toEqual({ delivered: true, source: 'fallback' });
    expect(legacyHandle).toHaveBeenCalledTimes(1);
  });
});
