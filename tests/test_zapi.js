
const { ZAPIClient, sendWhatsAppMessage } = require('.laura-saas-agenda/src/utils/zapi_client');

const axios = require('axios');

// Mock do axios para testes
jest.mock('axios');
const mockedAxios = axios;

describe('ZAPIClient', () => {
    let client;

    beforeEach(() => {
        client = new ZAPIClient();
        jest.clearAllMocks();
    });

    describe('Inicialização', () => {
        test('deve inicializar com configurações corretas', () => {
            expect(client.baseUrl).toBeDefined();
            expect(client.token).toBeDefined();
            expect(client.instanceId).toBeDefined();
            expect(client.headers['Client-Token']).toBe(client.token);
            expect(client.headers['Content-Type']).toBe('application/json');
        });
    });

    describe('sendTextMessage', () => {
        test('deve enviar mensagem com sucesso', async () => {
            // Mock da resposta bem-sucedida
            const mockResponse = {
                status: 200,
                data: {
                    success: true,
                    messageId: '12345',
                    phone: '5511999999999'
                }
            };
            mockedAxios.post.mockResolvedValue(mockResponse);

            // Teste
            const result = await client.sendTextMessage('5511999999999', 'Teste');

            // Verificações
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
            
            // Verificar URL e payload
            const [url, payload, config] = mockedAxios.post.mock.calls[0];
            expect(url).toBe(`${client.baseUrl}/send-text`);
            expect(payload.phone).toBe('5511999999999');
            expect(payload.message).toBe('Teste');
            expect(config.headers['Client-Token']).toBe(client.token);
        });

        test('deve tratar erro de requisição', async () => {
            // Mock de erro
            mockedAxios.post.mockRejectedValue(new Error('Erro de conexão'));

            // Teste
            const result = await client.sendTextMessage('5511999999999', 'Teste');

            // Verificações
            expect(result.success).toBe(false);
            expect(result.error).toContain('Erro de conexão');
        });

        test('deve tratar erro HTTP', async () => {
            // Mock de erro HTTP
            const error = new Error('Request failed');
            error.response = {
                status: 400,
                statusText: 'Bad Request',
                data: { error: 'Invalid phone number' }
            };
            mockedAxios.post.mockRejectedValue(error);

            // Teste
            const result = await client.sendTextMessage('invalid', 'Teste');

            // Verificações
            expect(result.success).toBe(false);
            expect(result.error).toContain('Erro HTTP 400');
            expect(result.data).toEqual({ error: 'Invalid phone number' });
        });
    });

    describe('checkConnection', () => {
        test('deve verificar conexão com sucesso', async () => {
            // Mock da resposta
            const mockResponse = {
                status: 200,
                data: { connected: true, instance: 'active' }
            };
            mockedAxios.get.mockResolvedValue(mockResponse);

            // Teste
            const result = await client.checkConnection();

            // Verificações
            expect(result.success).toBe(true);
            expect(result.data.connected).toBe(true);
            expect(mockedAxios.get).toHaveBeenCalledWith(
                `${client.baseUrl}/status`,
                expect.objectContaining({
                    headers: client.headers,
                    timeout: 10000
                })
            );
        });

        test('deve tratar erro na verificação de conexão', async () => {
            // Mock de erro
            mockedAxios.get.mockRejectedValue(new Error('Network error'));

            // Teste
            const result = await client.checkConnection();

            // Verificações
            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('validatePhoneNumber', () => {
        test('deve validar números corretos', () => {
            expect(client.validatePhoneNumber('5511999999999')).toBe(true);
            expect(client.validatePhoneNumber('5521987654321')).toBe(true);
        });

        test('deve rejeitar números incorretos', () => {
            expect(client.validatePhoneNumber('11999999999')).toBe(false);
            expect(client.validatePhoneNumber('5511999')).toBe(false);
            expect(client.validatePhoneNumber('abc123')).toBe(false);
        });
    });

    describe('formatPhoneNumber', () => {
        test('deve formatar números corretamente', () => {
            expect(client.formatPhoneNumber('(11) 99999-9999')).toBe('5511999999999');
            expect(client.formatPhoneNumber('11999999999')).toBe('5511999999999');
            expect(client.formatPhoneNumber('5511999999999')).toBe('5511999999999');
        });
    });
});

describe('sendWhatsAppMessage', () => {
    test('deve usar função de conveniência', async () => {
        // Mock da resposta
        const mockResponse = {
            status: 200,
            data: { success: true }
        };
        mockedAxios.post.mockResolvedValue(mockResponse);

        // Teste
        const result = await sendWhatsAppMessage('5511999999999', 'Teste');

        // Verificações
        expect(result.success).toBe(true);
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
});

// Teste real de conexão (comentado por padrão)
describe('Teste Real', () => {
    test.skip('deve conectar com API real', async () => {
        // ATENÇÃO: Este teste faz chamada real para a API!
        // Descomente apenas para testar conexão real
        const client = new ZAPIClient();
        const result = await client.checkConnection();
        console.log('Resultado do teste real:', JSON.stringify(result, null, 2));
        expect(result).toBeDefined();
    });
});

// Executar testes se chamado diretamente
if (require.main === module) {
    console.log('Execute os testes com: npm test');
    console.log('Ou com Jest: npx jest test_zapi.js');
}