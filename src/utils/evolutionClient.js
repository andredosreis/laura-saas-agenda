import axios from 'axios';
import logger from './logger.js';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'marcai';

const normalizePortuguesePhone = (phone) => {
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('351')) return cleaned;
  if (cleaned.startsWith('9') || cleaned.startsWith('2')) return `351${cleaned}`;
  return cleaned;
};

export const sendWhatsAppMessage = async (to, message) => {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    logger.warn({ to }, '[Evolution] EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurado — mensagem não enviada');
    return { success: false, error: 'Evolution API não configurada' };
  }

  const phoneNormalized = normalizePortuguesePhone(to);

  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
      { number: phoneNormalized, text: message },
      { headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' } }
    );
    logger.info({ to: phoneNormalized }, '[Evolution] Mensagem enviada');
    return { success: true, result: response.data };
  } catch (error) {
    logger.error({ to: phoneNormalized, err: error.response?.data || error.message }, '[Evolution] Erro ao enviar mensagem');
    return { success: false, error: error.response?.data || error.message };
  }
};
