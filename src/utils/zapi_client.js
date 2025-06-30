const axios = require('axios');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config();

/**
 * Cliente para integração com ZAPI - LA Estética Avançada
 */
class ZAPIClient {
    /**
     * Inicializa o cliente ZAPI com configurações do ambiente
     */
    constructor() {
        // Pegando as variáveis do ambiente ou valores padrão
        this.instanceId = process.env.ZAPI_INSTANCE_ID || '3E34E13FC965B0D13ECE2A88B4975A95';
        this.instanceToken = process.env.ZAPI_INSTANCE_TOKEN || '4AE171061B08EF4E77E010A3';
        this.securityToken = process.env.ZAPI_SECURITY_TOKEN || 'Faea87dee35294aff8e386f2633cf79c0S';

        // baseUrl SEM /send-text no final!
        this.baseUrl = `https://api.z-api.io/instances/${this.instanceId}/token/${this.instanceToken}`;

        // Headers padrão para todas as requisições
        this.headers = {
            'Content-Type': 'application/json',
            'Client-Token': this.securityToken // Aqui vai o token de segurança da conta!
        };
        console.log('Token de segurança:', this.securityToken);
        console.log(`ZAPI Client inicializado - Instance: ${this.instanceId}`);
    }

    /**
     * Envia mensagem de texto via ZAPI
     * 
     * @param {string} phone - Número do telefone (formato: 5511999999999)
     * @param {string} message - Mensagem a ser enviada
     * @returns {Promise<Object>} Resposta da API
     */
    async sendTextMessage(phone, message) {
        // URL correta para envio de texto
        const url = `${this.baseUrl}/send-text`;
        
        // Payload da requisição
        const payload = {
            phone: phone,
            message: message
        };

        try {
            console.log(`Enviando mensagem para ${phone}`);
            console.log(`URL: ${url}`);
            console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

            const response = await axios.post(url, payload, {
                headers: this.headers,
                timeout: 30000
            });

            // Log da resposta
            console.log(`Status Code: ${response.status}`);
            console.log(`Response: ${JSON.stringify(response.data, null, 2)}`);

            if (response.status === 200) {
                console.log('Mensagem enviada com sucesso!');
                return {
                    success: true,
                    data: response.data,
                    message: 'Mensagem enviada com sucesso'
                };
            } else {
                console.warn(`Resposta inesperada: ${response.status}`);
                return {
                    success: false,
                    error: `Status code inesperado: ${response.status}`,
                    data: response.data
                };
            }

        } catch (error) {
            console.error(`Erro na requisição: ${error.message}`);
            
            if (error.response) {
                // Erro de resposta HTTP
                return {
                    success: false,
                    error: `Erro HTTP ${error.response.status}: ${error.response.statusText}`,
                    data: error.response.data
                };
            } else if (error.request) {
                // Erro de rede/timeout
                return {
                    success: false,
                    error: `Erro de rede: ${error.message}`,
                    data: null
                };
            } else {
                // Erro inesperado
                return {
                    success: false,
                    error: `Erro inesperado: ${error.message}`,
                    data: null
                };
            }
        }
    }

    /**
     * Verifica se a conexão com ZAPI está funcionando
     * 
     * @returns {Promise<Object>} Status da conexão
     */
    async checkConnection() {
        const url = `${this.baseUrl}/status`;

        try {
            console.log('Verificando status da conexão ZAPI...');

            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 10000
            });

            console.log(`Status da conexão: ${JSON.stringify(response.data, null, 2)}`);

            return {
                success: true,
                data: response.data,
                message: 'Conexão verificada com sucesso'
            };

        } catch (error) {
            console.error(`Erro ao verificar conexão: ${error.message}`);
            return {
                success: false,
                error: `Erro ao verificar conexão: ${error.message}`,
                data: null
            };
        }
    }

    /**
     * Valida formato do número de telefone
     * 
     * @param {string} phone - Número do telefone
     * @returns {boolean} True se válido
     */
    validatePhoneNumber(phone) {
        // Formato esperado: 5511999999999 (país + DDD + número)
        const phoneRegex = /^55\d{10,11}$/;
        return phoneRegex.test(phone);
    }

    /**
     * Formata número de telefone para o padrão ZAPI
     * 
     * @param {string} phone - Número do telefone
     * @returns {string} Número formatado
     */
    formatPhoneNumber(phone) {
        // Remove caracteres não numéricos
        const cleanPhone = phone.replace(/\D/g, '');
        
        // Se não começar com 55, adiciona
        if (!cleanPhone.startsWith('55')) {
            return `55${cleanPhone}`;
        }
        
        return cleanPhone;
    }
}

/**
 * Função de conveniência para enviar mensagem WhatsApp
 * 
 * @param {string} phone - Número do telefone
 * @param {string} message - Mensagem
 * @returns {Promise<Object>} Resultado do envio
 */
async function sendWhatsAppMessage(phone, message) {
    const client = new ZAPIClient();
    return await client.sendTextMessage(phone, message);
}

// Exportar classe e função
module.exports = {
    ZAPIClient,
    sendWhatsAppMessage
};

// Teste rápido se executado diretamente
if (require.main === module) {
    (async () => {
        const client = new ZAPIClient();
        
        // Verificar conexão
        const status = await client.checkConnection();
        console.log('Status da conexão:', JSON.stringify(status, null, 2));
        
        // Exemplo de envio (descomente para testar)
        const result = await client.sendTextMessage("5511999999999", "Teste de mensagem da LA Estética Avançada!");
        console.log('Resultado:', JSON.stringify(result, null, 2));
    })();
}