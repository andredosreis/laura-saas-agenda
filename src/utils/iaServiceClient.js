/**
 * iaServiceClient — cliente axios para o ia-service Python.
 * Usado pelo webhookController para delegar mensagens não-confirmação.
 */
import axios from 'axios';

const IA_SERVICE_URL = process.env.IA_SERVICE_URL;
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
// 120s: turnos com tool-calls em modelos maiores (gemini-3.5-flash) levam
// 15-40s. Com 20s o backend dava timeout com o ia-service AINDA A TRABALHAR
// → retry reprocessava (resposta duplicada) e o handler caía no greeting
// legacy (3 mensagens para um "olá" — caso real 2026-07-06 14:52).
const TIMEOUT_MS = 120_000;
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
    // Timeout ≠ serviço em baixo: o ia-service provavelmente continua a
    // processar e vai entregar a resposta ao cliente. Repetir duplicava a
    // resposta; propagar já, marcado, para o handler decidir não fazer
    // fallback. Retry fica só para erros de ligação (serviço mesmo down).
    if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
      err.isTimeout = true;
      throw err;
    }
    if (retries > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

export const processLead = async ({
  tenantId, instanceName, telefone, mensagem,
  messageId, timestamp, clienteId = null, leadId = null, avisoIA = null,
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
      aviso_clinica: avisoIA,
    })
  );
  return data;
};

export const processClient = async ({
  tenantId, instanceName, telefone, mensagem,
  messageId, timestamp, clienteId, clienteNome = null, avisoIA = null,
}) => {
  if (!_client) throw new Error('IA_SERVICE_URL não configurado — defina no .env');
  const { data } = await withRetry(() =>
    _client.post('/process-client', {
      tenant_id: tenantId,
      instance_name: instanceName,
      telefone,
      mensagem,
      message_id: messageId,
      timestamp,
      cliente_id: clienteId,
      cliente_nome: clienteNome,
      aviso_clinica: avisoIA,
    })
  );
  return data;
};

/**
 * Transcreve um áudio (base64) via Gemini no ia-service.
 * @param {object} args
 * @param {string} args.audioBase64
 * @param {string} [args.mimeType]
 * @returns {Promise<{ text: string }>}
 */
export const transcribeAudio = async ({ audioBase64, mimeType = 'audio/ogg' }) => {
  if (!_client) throw new Error('IA_SERVICE_URL não configurado — defina no .env');
  const { data } = await withRetry(() =>
    _client.post('/transcribe', {
      audio_base64: audioBase64,
      mime_type: mimeType,
    })
  );
  return data;
};

/**
 * Interpreta uma resposta do número pessoal da equipa.
 * O ia-service devolve apenas destinatário/texto; a resolução do contacto
 * e o envio permanecem no backend tenant-scoped.
 */
export const parseTeamReply = async ({ tenantId, message, pendingRequests = [] }) => {
  if (!_client) throw new Error('IA_SERVICE_URL não configurado — defina no .env');
  const { data } = await withRetry(() =>
    _client.post('/parse-team-reply', {
      tenant_id: tenantId,
      message,
      pending_requests: pendingRequests.slice(0, 10).map((request) => ({
        name: String(request.name || '').slice(0, 200),
        reason: String(request.reason || '').slice(0, 500),
      })),
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
