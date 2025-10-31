import axios from 'axios';

const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_INSTANCE_TOKEN || process.env.ZAPI_TOKEN; // ✅ Aceita ambos os nomes
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_SECURITY_TOKEN; // ✅ Client token para autenticação
const ZAPI_BASE_URL = 'https://api.z-api.io';

const apiClient = axios.create({
  baseURL: ZAPI_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Client-Token': ZAPI_CLIENT_TOKEN // ✅ CORREÇÃO: Z-API usa client-token, não Bearer
  }
});

/**
 * @description Normaliza telefone português adicionando DDI 351 se necessário
 * @param {string} phone - Número de telefone (ex: 912462033 ou 351912462033)
 * @returns {string} - Número no formato 351XXXXXXXXX
 */
const normalizePortuguesePhone = (phone) => {
  // Remove espaços, hífens, parênteses
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');

  // Se já começa com 351, retorna como está
  if (cleaned.startsWith('351')) {
    return cleaned;
  }

  // Se começa com 9 (telemóvel português), adiciona 351
  if (cleaned.startsWith('9')) {
    return `351${cleaned}`;
  }

  // Se começa com 2 (fixo português), adiciona 351
  if (cleaned.startsWith('2')) {
    return `351${cleaned}`;
  }

  // Caso contrário, retorna como está (pode ser DDI de outro país)
  return cleaned;
};

/**
 * @description Envia uma mensagem de texto simples via Z-API.
 * @param {string} to - O número do destinatário (ex: 912462033 ou 351912462033).
 * @param {string} message - O conteúdo da mensagem de texto.
 * @returns {Promise<{success: boolean, result: any, error?: string}>}
 */
export const sendWhatsAppMessage = async (to, message) => {
  const endpoint = `/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;

  // ✅ Normaliza telefone português (adiciona 351 se necessário)
  const phoneNormalized = normalizePortuguesePhone(to);

  try {
    const response = await apiClient.post(endpoint, {
      phone: phoneNormalized,
      message: message,
    });
    console.log(`✅ Z-API: Mensagem enviada para ${phoneNormalized} (original: ${to}). ID: ${response.data.id || response.data.messageId}`);
    return { success: true, result: response.data };
  } catch (error) {
    console.error(`❌ Z-API: Erro ao enviar para ${phoneNormalized}:`, error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
};

/**
 * @description Função genérica que pode ser expandida para outros tipos de mensagem.
 * Por agora, ela redireciona para a função principal.
 */
export const sendZapiWhatsAppMessage = async (to, message) => {
    return await sendWhatsAppMessage(to, message);
};