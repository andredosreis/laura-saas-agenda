// tests/whatsapp-manual-instancia.test.js
// Rotas manuais de WhatsApp (/whatsapp/notificar e /whatsapp/enviar-direta):
// a mensagem tem de sair pela instância Evolution DO TENANT autenticado.
// Antes desta correcção não era passado instanceName e o evolutionClient caía
// para a EVOLUTION_INSTANCE global — mensagens de um tenant saíam pelo
// WhatsApp de outra clínica.

import { jest } from '@jest/globals';

const sendWhatsAppMessageMock = jest.fn().mockResolvedValue({ success: true, result: { id: 'x' } });
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}));

const request = (await import('supertest')).default;
const app = (await import('../src/app.js')).default;
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const User = (await import('../src/models/User.js')).default;
const jwt = (await import('jsonwebtoken')).default;

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  jest.clearAllMocks();
  sendWhatsAppMessageMock.mockResolvedValue({ success: true, result: { id: 'x' } });
});

async function criarTenantEToken(slug, { instanceName } = {}) {
  const tenant = await Tenant.create({
    nome: `Clínica ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    ...(instanceName ? { whatsapp: { instanceName } } : {}),
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  return { tenant, token };
}

describe('POST /whatsapp/notificar — instância do tenant', () => {
  it('envia pela instância do tenant autenticado', async () => {
    const { token } = await criarTenantEToken('clinica-a', { instanceName: 'instancia-a' });

    const res = await request(app)
      .post('/api/v1/whatsapp/notificar')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '912345678', mensagem: 'Olá' });

    expect(res.status).toBe(200);
    expect(sendWhatsAppMessageMock).toHaveBeenCalledTimes(1);
    // 3º argumento = instanceName; nunca pode ficar undefined (cairia na global)
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith('912345678', 'Olá', 'instancia-a');
  });

  it('recusa com 409 e não envia quando o tenant não tem instância ligada (fail-closed)', async () => {
    const { token } = await criarTenantEToken('clinica-sem-wpp');

    const res = await request(app)
      .post('/api/v1/whatsapp/notificar')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '912345678', mensagem: 'Olá' });

    expect(res.status).toBe(409);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });

  it('valida o corpo antes de tudo', async () => {
    const { token } = await criarTenantEToken('clinica-b', { instanceName: 'instancia-b' });

    const res = await request(app)
      .post('/api/v1/whatsapp/notificar')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '912345678' });

    expect(res.status).toBe(400);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});

describe('POST /whatsapp/enviar-direta — instância do tenant', () => {
  it('envia pela instância do tenant autenticado', async () => {
    const { token } = await criarTenantEToken('clinica-c', { instanceName: 'instancia-c' });

    const res = await request(app)
      .post('/api/v1/whatsapp/enviar-direta')
      .set('Authorization', `Bearer ${token}`)
      .send({ to: '912345678', body: 'Mensagem directa' });

    expect(res.status).toBe(200);
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith('912345678', 'Mensagem directa', 'instancia-c');
  });

  it('recusa com 409 sem instância ligada', async () => {
    const { token } = await criarTenantEToken('clinica-d');

    const res = await request(app)
      .post('/api/v1/whatsapp/enviar-direta')
      .set('Authorization', `Bearer ${token}`)
      .send({ to: '912345678', body: 'Mensagem directa' });

    expect(res.status).toBe(409);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});

describe('Isolamento multi-tenant do canal de envio', () => {
  it('cada tenant envia pela sua própria instância', async () => {
    const a = await criarTenantEToken('tenant-x', { instanceName: 'instancia-x' });
    const b = await criarTenantEToken('tenant-y', { instanceName: 'instancia-y' });

    await request(app)
      .post('/api/v1/whatsapp/notificar')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ telefone: '911111111', mensagem: 'de X' });

    await request(app)
      .post('/api/v1/whatsapp/notificar')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ telefone: '922222222', mensagem: 'de Y' });

    expect(sendWhatsAppMessageMock).toHaveBeenNthCalledWith(1, '911111111', 'de X', 'instancia-x');
    expect(sendWhatsAppMessageMock).toHaveBeenNthCalledWith(2, '922222222', 'de Y', 'instancia-y');
  });
});

describe('POST /whatsapp/lembretes-amanha — removida', () => {
  it('já não existe (lia a BD partilhada sem tenantId e nunca enviava nada)', async () => {
    const { token } = await criarTenantEToken('clinica-e', { instanceName: 'instancia-e' });

    const res = await request(app)
      .post('/api/v1/whatsapp/lembretes-amanha')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
  });
});
