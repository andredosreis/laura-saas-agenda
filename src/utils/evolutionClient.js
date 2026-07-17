import axios from 'axios';
import logger from './logger.js';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'marcai';

// Handler reactivo opcional: chamado quando um envio falha (para o health check).
// Registado no arranque por evolutionHealthJob; nunca importa o serviço aqui
// (evita ciclo de imports).
let sendFailureHandler = null;
export function registerSendFailureHandler(fn) {
  sendFailureHandler = typeof fn === 'function' ? fn : null;
}

const normalizePortuguesePhone = (phone) => {
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('351')) return cleaned;
  if (cleaned.startsWith('9') || cleaned.startsWith('2')) return `351${cleaned}`;
  return cleaned;
};

/**
 * Envia mensagem WhatsApp via Evolution API.
 *
 * @param {string} to                 telefone destino
 * @param {string} message            corpo da mensagem
 * @param {string} [instanceName]     instância Evolution a usar; se omisso, cai para EVOLUTION_INSTANCE
 * @returns {Promise<{success:boolean, result?, error?}>}
 */
export const sendWhatsAppMessage = async (to, message, instanceName) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    logger.warn({ to }, '[Evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurado — mensagem não enviada');
    return { success: false, error: 'Evolution API não configurada' };
  }

  const phoneNormalized = normalizePortuguesePhone(to);
  const instance = (instanceName && String(instanceName).trim()) || EVOLUTION_INSTANCE;

  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${instance}`,
      { number: phoneNormalized, text: message },
      { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' } }
    );
    logger.info({ to: phoneNormalized, instance }, '[Evolution] Mensagem enviada');
    return { success: true, result: response.data };
  } catch (error) {
    const errPayload = error.response?.data || error.message;
    logger.error({ to: phoneNormalized, instance, err: errPayload }, '[Evolution] Erro ao enviar mensagem');
    if (sendFailureHandler) {
      try { sendFailureHandler(instance, errPayload); }
      catch (cbErr) { logger.error({ err: cbErr.message }, '[Evolution] sendFailureHandler lançou'); }
    }
    return { success: false, error: errPayload };
  }
};

/**
 * Descarrega o conteúdo (base64) de uma mensagem de media (ex.: nota de voz).
 *
 * Usa o endpoint `POST /chat/getBase64FromMediaMessage/{instance}` do Evolution
 * v2, passando a `key` da mensagem recebida no webhook.
 *
 * @param {object} messageKey         msgData.key da mensagem (id, remoteJid, ...)
 * @param {string} [instanceName]     instância Evolution; cai para EVOLUTION_INSTANCE
 * @returns {Promise<{success:boolean, base64?:string, mimetype?:string|null, error?}>}
 */
export const getMediaBase64 = async (messageKey, instanceName) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    logger.warn('[Evolution] EVOLUTION_API_URL/KEY não configurado — media não descarregada');
    return { success: false, error: 'Evolution API não configurada' };
  }

  const instance = (instanceName && String(instanceName).trim()) || EVOLUTION_INSTANCE;

  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance}`,
      { message: { key: messageKey }, convertToMp4: false },
      { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' } }
    );
    const base64 = response.data?.base64;
    const mimetype = response.data?.mimetype || response.data?.mediaType || null;
    if (!base64) {
      logger.warn({ instance }, '[Evolution] resposta sem base64');
      return { success: false, error: 'sem base64 na resposta' };
    }
    return { success: true, base64, mimetype };
  } catch (error) {
    logger.error({ instance, err: error.response?.data || error.message }, '[Evolution] Erro ao descarregar media');
    return { success: false, error: error.response?.data || error.message };
  }
};

/**
 * Consulta o estado de ligação de uma instância Evolution.
 * @param {string} [instanceName]  cai para EVOLUTION_INSTANCE se omisso
 * @returns {Promise<{ok:true,state:string}|{ok:false,unreachable:true,error:*}>}
 */
export const getConnectionState = async (instanceName) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return { ok: false, unreachable: true, error: 'Evolution API não configurada' };
  }
  const instance = (instanceName && String(instanceName).trim()) || EVOLUTION_INSTANCE;
  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connectionState/${instance}`,
      { headers: { apikey: EVOLUTION_API_KEY } },
    );
    const state = response.data?.instance?.state || response.data?.state || null;
    return { ok: true, state };
  } catch (error) {
    return { ok: false, unreachable: true, error: error.response?.data || error.message };
  }
};

// ---------------------------------------------------------------------------
// Gestão de instância (F21 — ADR-021 Fase 4 / ADR-024 Fase 4)
//
// Endpoints Evolution v2 (`evoapicloud/evolution-api:v2.3.7`, docker-compose.prod.yml):
//   POST   /instance/create               — cria instância (+ webhook no mesmo pedido)
//   GET    /instance/connect/{instance}   — QR / pairing code
//   DELETE /instance/logout/{instance}    — termina a sessão do dispositivo
//   GET    /instance/connectionState/{i}  — estado (já existia, ver acima)
//
// Todas devolvem `{ ok: true, ... }` / `{ ok: false, ... }` — nunca lançam. É a
// convenção das funções acima e o que permite ao painel degradar (Evolution em
// baixo → 200 com `evolutionReachable: false`) em vez de 500.
// ---------------------------------------------------------------------------

// Timeout explícito: sem ele o painel fica pendurado numa Evolution em baixo até
// ao timeout do SO. As funções de mensagem acima não o têm por razão histórica —
// não é alterado aqui para não mexer no caminho de envio em produção.
const INSTANCE_TIMEOUT_MS = Number(process.env.EVOLUTION_TIMEOUT_MS) || 15000;

const instanceHeaders = () => ({ apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' });

const missingConfig = () => ({ ok: false, unreachable: true, error: 'Evolution API não configurada' });

/**
 * Cria uma instância Evolution dedicada e, no mesmo pedido, configura o webhook.
 *
 * O webhook é configurado na criação (e não num follow-up) para não existir uma
 * janela em que a instância aceita mensagens sem as entregar ao backend. O
 * formato replica `scripts/tools/webhook-restore-prod.sh` (a convenção real de
 * produção): header `apikey` com EVOLUTION_WEBHOOK_SECRET — que é exactamente o
 * que `src/middlewares/webhookAuth.js` valida — e `events: ['MESSAGES_UPSERT']`.
 *
 * @param {string} instanceName        slug único da instância
 * @param {object} [opts]
 * @param {string} [opts.webhookUrl]   URL pública de `/webhook/evolution`; sem ela a instância nasce muda
 * @returns {Promise<{ok:true,instanceToken:string|null,state:string,webhookConfigured:boolean}
 *                  |{ok:false,conflict?:boolean,unreachable?:boolean,error:*}>}
 */
export const createInstance = async (instanceName, { webhookUrl } = {}) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return missingConfig();

  const instance = String(instanceName || '').trim();
  if (!instance) return { ok: false, error: 'instanceName obrigatório' };

  const payload = {
    instanceName: instance,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  };

  if (webhookUrl) {
    payload.webhook = {
      url: webhookUrl,
      byEvents: false,
      base64: false,
      headers: { apikey: process.env.EVOLUTION_WEBHOOK_SECRET, 'Content-Type': 'application/json' },
      events: ['MESSAGES_UPSERT'],
    };
  }

  try {
    const response = await axios.post(`${EVOLUTION_API_URL}/instance/create`, payload, {
      headers: instanceHeaders(),
      timeout: INSTANCE_TIMEOUT_MS,
    });

    // v2.2+ devolve `hash` string; versões anteriores devolvem `{ hash: { apikey } }`.
    const hash = response.data?.hash;
    const instanceToken = typeof hash === 'string' ? hash : (hash?.apikey ?? null);
    const state = response.data?.instance?.status || response.data?.instance?.state || 'connecting';

    // NUNCA logar `response.data` — contém o token da instância.
    logger.info({ instance, webhookConfigured: Boolean(webhookUrl) }, '[Evolution] Instância criada');
    return { ok: true, instanceToken, state, webhookConfigured: Boolean(webhookUrl) };
  } catch (error) {
    const status = error.response?.status;
    const errPayload = error.response?.data || error.message;
    logger.error({ instance, status, err: errPayload }, '[Evolution] Erro ao criar instância');
    // A Evolution recusa nome já em uso com 403 (e 409 nalgumas versões).
    return { ok: false, conflict: status === 403 || status === 409, error: errPayload };
  }
};

/**
 * Obtém o QR code / pairing code para ligar o dispositivo a uma instância.
 *
 * O payload é uma credencial de sessão: nunca é logado nem auditado — só chega
 * ao operador, na resposta.
 *
 * @param {string} instanceName
 * @returns {Promise<{ok:true,qrBase64:string|null,pairingCode:string|null}
 *                  |{ok:false,notFound?:boolean,unreachable?:boolean,error:*}>}
 */
export const getConnectQR = async (instanceName) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return missingConfig();

  const instance = String(instanceName || '').trim();
  if (!instance) return { ok: false, error: 'instanceName obrigatório' };

  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connect/${encodeURIComponent(instance)}`,
      { headers: { apikey: EVOLUTION_API_KEY }, timeout: INSTANCE_TIMEOUT_MS },
    );
    return {
      ok: true,
      qrBase64: response.data?.base64 ?? null,
      pairingCode: response.data?.pairingCode ?? null,
    };
  } catch (error) {
    const status = error.response?.status;
    // Só o status é logado — o corpo de erro da Evolution pode ecoar o `code`.
    logger.error({ instance, status }, '[Evolution] Erro ao obter QR');
    return { ok: false, notFound: status === 404, error: error.response?.data || error.message };
  }
};

/**
 * Termina a sessão WhatsApp de uma instância (logout do dispositivo).
 *
 * NÃO remove a instância da Evolution — o registo e o webhook sobrevivem, e a
 * mesma instância volta a ligar-se com um novo QR. É deliberado: `instanceName`
 * continua a resolver o tenant no webhook (ADR-021).
 *
 * @param {string} instanceName
 * @returns {Promise<{ok:true}|{ok:false,notFound?:boolean,unreachable?:boolean,error:*}>}
 */
export const logoutInstance = async (instanceName) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) return missingConfig();

  const instance = String(instanceName || '').trim();
  if (!instance) return { ok: false, error: 'instanceName obrigatório' };

  try {
    await axios.delete(`${EVOLUTION_API_URL}/instance/logout/${encodeURIComponent(instance)}`, {
      headers: { apikey: EVOLUTION_API_KEY },
      timeout: INSTANCE_TIMEOUT_MS,
    });
    logger.info({ instance }, '[Evolution] Sessão terminada');
    return { ok: true };
  } catch (error) {
    const status = error.response?.status;
    const errPayload = error.response?.data || error.message;
    logger.error({ instance, status, err: errPayload }, '[Evolution] Erro ao terminar sessão');
    return { ok: false, notFound: status === 404, error: errPayload };
  }
};
