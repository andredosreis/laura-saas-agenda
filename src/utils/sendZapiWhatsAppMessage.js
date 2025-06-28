// Importa a biblioteca axios para fazer requisições HTTP em Node.js
const axios = require('axios');

// Função assíncrona para enviar mensagem pelo WhatsApp usando a Z-API
async function sendZapiWhatsAppMessage(phone, message) {
  // Pega as credenciais da Z-API do arquivo .env ou, se não tiver, usa os valores fixos (só para testes!)
  const instanceId = process.env.ZAPI_INSTANCE_ID || '3E34E13FC965B0D13ECE2A88B4975A95';
  const token = process.env.ZAPI_TOKEN || '4AE171061B08EF4E77E010A3';

  // Monta a URL de envio de texto da Z-API
  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  // Prepara o corpo (payload) da requisição: phone precisa do DDI (ex: 351912345678)
  const payload = {
    phone,    // número do cliente
    message   // texto a ser enviado
  };

  try {
    // Envia um POST para a URL da Z-API com o payload
    const response = await axios.post(url, payload);
    // Se chegar aqui, mensagem enviada! Retorna sucesso e os dados da resposta da Z-API
    return { success: true, result: response.data };
  } catch (error) {
    // Se deu erro, mostra no console para ajudar debug e retorna erro
    console.error('Erro ao enviar mensagem Z-API:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

// Exporta a função para ser usada em outros arquivos (por exemplo, no controller)
module.exports = { sendZapiWhatsAppMessage };
