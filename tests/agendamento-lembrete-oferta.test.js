import request from 'supertest';
import { jest } from '@jest/globals';

const sendWhatsAppMessageMock = jest.fn().mockResolvedValue({ success: true });

jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}));

const { default: app } = await import('../src/app.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: User } = await import('../src/models/User.js');
const jwt = (await import('jsonwebtoken')).default;

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
    await clearDB();
    jest.clearAllMocks();
    sendWhatsAppMessageMock.mockResolvedValue({ success: true });
});

async function criarTenantEToken(slug = 'salon-lembrete-oferta') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin Teste',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { token };
}

function dataFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.toISOString().split('T')[0]}T14:00:00-03:00`;
}

describe('Agendamento: lembrete de oferta', () => {
  it('envia lembrete manual para oferta sem pacote', async () => {
    const { token } = await criarTenantEToken();

    const clienteRes = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Oferta', telefone: '918000001' });

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteRes.body.data._id,
        dataHora: dataFutura(),
        servicoTipo: 'oferta',
        servicoAvulsoNome: 'Sessão cortesia',
      });

    expect(criarRes.status).toBe(201);
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();

    const lembreteRes = await request(app)
      .post(`/api/agendamentos/${criarRes.body._id}/enviar-lembrete`)
      .set('Authorization', `Bearer ${token}`);

    expect(lembreteRes.status).toBe(200);
    expect(lembreteRes.body.success).toBe(true);
    expect(sendWhatsAppMessageMock).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMessageMock.mock.calls[0][0]).toBe('918000001');
    expect(sendWhatsAppMessageMock.mock.calls[0][1]).toContain('Sessão cortesia (oferta sem cobrança)');
  });
});
