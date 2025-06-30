const axios = require('axios');
require('dotenv').config();

class ZAPIClient {
  constructor() {
    this.baseUrl = process.env.ZAPI_BASE_URL || 'https://api.z-api.io/instances/3E34E13FC965B0D13ECE2A88B4975A95';

    this.token = process.env.ZAPI_TOKEN || '4AE171061B08EF4E77E010A3';
    this.headers = {
      'Content-Type': 'application/json',
      'Client-Token': this.token
    };
    console.log(`ZAPI Client inicializado - BaseURL: ${this.baseUrl}`);
  }

  // Enviar mensagem de texto
  async sendTextMessage(phone, message) {
    const url = `${this.baseUrl}/send-text`;
    const payload = { phone, message };
    try {
      const response = await axios.post(url, payload, {
        headers: this.headers,
        timeout: 30000
      });
      if (response.status === 200) {
        return { success: true, data: response.data, message: 'Mensagem enviada com sucesso' };
      }
    } catch (error) {
      if (error.response) {
        return { success: false, error: `Erro HTTP ${error.response.status}: ${error.response.statusText}`, data: error.response.data };
      } else if (error.request) {
        return { success: false, error: `Erro de rede: ${error.message}`, data: null };
      } else {
        return { success: false, error: `Erro inesperado: ${error.message}`, data: null };
      }
    }
  }

  // Verificar conexão com ZAPI
  async checkConnection() {
    const url = `${this.baseUrl}/status`;
    try {
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: 10000
      });
      return { success: true, data: response.data, message: 'Conexão verificada com sucesso' };
    } catch (error) {
      return { success: false, error: `Erro ao verificar conexão: ${error.message}`, data: null };
    }
  }

  // Validação do número
  validatePhoneNumber(phone) {
    const phoneRegex = /^55\d{10,11}$/;
    return phoneRegex.test(phone);
  }

  // Formatação do número
  formatPhoneNumber(phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('55')) {
      return `55${cleanPhone}`;
    }
    return cleanPhone;
  }
}

// Função para uso externo
async function sendWhatsAppMessage(phone, message) {
  const client = new ZAPIClient();
  return await client.sendTextMessage(phone, message);
}

module.exports = { ZAPIClient, sendWhatsAppMessage };
