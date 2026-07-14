import { initEmailService } from '../src/services/emailService.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Configuração do serviço de email', () => {
  it('permite arrancar em produção sem Resend quando email não é obrigatório', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_REQUIRED = 'false';

    await expect(initEmailService()).resolves.toBeUndefined();
  });

  it('falha quando EMAIL_REQUIRED=true e a chave está ausente', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_REQUIRED = 'true';

    await expect(initEmailService()).rejects.toThrow(/RESEND_API_KEY obrigatória/);
  });
});
