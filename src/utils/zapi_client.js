import axios from 'axios';

const ZAPI_INSTANCE_ID = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ZAPI_BASE_URL = 'https://api.z-api.io';

const apiClient = axios.create({
  baseURL: ZAPI_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ZAPI_TOKEN}` // Assumindo Bearer token, ajuste se for diferente
  }
});

/**
 * @description Envia uma mensagem de texto simples via Z-API.
 * @param {string} to - O número do destinatário no formato 55DDDXXXXYYYYY.
 * @param {string} message - O conteúdo da mensagem de texto.
 * @returns {Promise<{success: boolean, result: any, error?: string}>}
 */
export const sendWhatsAppMessage = async (to, message) => {
  const endpoint = `/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`;
  try {
    const response = await apiClient.post(endpoint, {
      phone: to,
      message: message,
    });
    console.log(`Z-API: Mensagem enviada para ${to}. ID: ${response.data.id}`);
    return { success: true, result: response.data };
  } catch (error) {
    console.error(`Z-API: Erro ao enviar mensagem para ${to}:`, error.response?.data || error.message);
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