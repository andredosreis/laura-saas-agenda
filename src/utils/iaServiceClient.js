/**
 * iaServiceClient — cliente axios para o ia-service Python.
 * Usado pelo webhookController para delegar mensagens não-confirmação.
 */
import axios from 'axios';

const IA_SERVICE_URL = process.env.IA_SERVICE_URL;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_000;

function buildClient() {
  if (!IA_SERVICE_URL) return null;
  return axios.create({
    baseURL: IA_SERVICE_URL,
    timeout: TIMEOUT_MS,
    headers: {
      'X-Service-Token': INTERNAL_SERVICE_TOKEN || '',
      'Content-Type': 'application/json',
    },
  });
}

const _client = buildClient();

async function withRetry(fn, retries = 1) {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

export const processLead = async ({
  tenantId, instanceName, telefone, mensagem,
  messageId, timestamp, clienteId = null, leadId = null,
}) => {
  if (!_client) throw new Error('IA_SERVICE_URL não configurado — defina no .env');
  const { data } = await withRetry(() =>
    _client.post('/process-lead', {
      tenant_id: tenantId,
      instance_name: instanceName,
      telefone,
      mensagem,
      message_id: messageId,
      timestamp,
      cliente_id: clienteId,
      lead_id: leadId,
    })
  );
  return data;
};

export const checkHealth = async () => {
  if (!_client) return { reachable: false, reason: 'IA_SERVICE_URL not set' };
  try {
    const { data } = await _client.get('/health', { timeout: 5_000 });
    return { reachable: true, ...data };
  } catch {
    return { reachable: false };
  }
};
