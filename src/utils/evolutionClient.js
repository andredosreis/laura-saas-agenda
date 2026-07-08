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
