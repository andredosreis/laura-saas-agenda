// tests/tenant-config-e-alerta-equipa.test.js
// 1) PUT /auth/tenant aceita o payload real do frontend (Configuracoes.jsx)
//    e NÃO apaga switches que não passam por essa rota (iaGlobalAtiva,
//    followUpPosSessaoAtivo, intervaloEntreSessoes).
// 2) POST /api/internal/clientes/:id/alerta-equipa — o "vou pedir à Laura"
//    da IA dispara alerta real (WhatsApp admin).
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import { jest } from '@jest/globals';

const sendMock = jest.fn().mockResolvedValue({ success: true });
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: sendMock,
}));

const request = (await import('supertest')).default;
const app = (await import('../src/app.js')).default;
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const Tenant = (await import('../src/models/Tenant.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  sendMock.mockClear();
});

const API = '/api/v1';
const svc = { 'X-Service-Token': 'test-service-token' };

// Payload idêntico ao que Configuracoes.jsx envia no handleSubmit.
const payloadFrontend = {
  nome: 'La Estética Avançada',
  contato: {
    email: 'laura@clinica.pt',
    telefone: '910000000',
    website: '',
    endereco: { rua: 'Rua X', numero: '1', cidade: 'Lisboa', codigoPostal: '1000-001', pais: 'Portugal' },
  },
  configuracoes: {
    timezone: 'Europe/Lisbon',
    idioma: 'pt-PT',
    moedaDisplay: '€',
    duracaoSessaoPadrao: 60,
    antecedenciaMinAgendamento: 2,
    antecedenciaMaxAgendamento: 30,
    permitirAgendamentoOnline: false,
  },
  whatsapp: { numeroWhatsapp: '351910376276' },
};

async function registarComToken() {
  const res = await request(app).post(`${API}/auth/register`).send({
    nomeEmpresa: 'Clínica Config Teste',
    nome: 'Admin Config',
    email: 'config@teste.pt',
    password: 'Senha@Segura123',
  });
  return { token: res.body.data.tokens.accessToken, tenantId: res.body.data.tenant.id };
}

describe('PUT /auth/tenant — payload real das Configurações', () => {
  it('aceita o payload do frontend (whatsapp objecto + configuracoes completas)', async () => {
    const { token, tenantId } = await registarComToken();

    const res = await request(app)
      .put(`${API}/auth/tenant`)
      .set('Authorization', `Bearer ${token}`)
      .send(payloadFrontend);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const tenant = await Tenant.findById(tenantId).lean();
    expect(tenant.whatsapp.numeroWhatsapp).toBe('351910376276');
    expect(tenant.configuracoes.duracaoSessaoPadrao).toBe(60);
    expect(tenant.contato.endereco.cidade).toBe('Lisboa');
  });

  it('register, login, /auth/me e updateTenant devolvem o MESMO shape de tenant', async () => {
    // Shapes divergentes custaram dados reais (2026-07-06): o login não
    // trazia `configuracoes`, o form de Configurações hidratava vazio a
    // partir dele e o save gravava "" por cima do avisoIA em produção.
    const camposObrigatorios = (tenant) => {
      expect(tenant.configuracoes).toBeDefined();
      expect(tenant.configuracoes.timezone).toBeDefined();
      expect(tenant.contato).toBeDefined();
      expect(tenant.whatsapp).toBeDefined();
      expect(typeof tenant.whatsapp.numeroWhatsapp).toBe('string');
      expect(tenant.limites).toBeDefined();
      expect(tenant.plano).toBeDefined();
    };

    const reg = await request(app).post(`${API}/auth/register`).send({
      nomeEmpresa: 'Clínica Shape Teste',
      nome: 'Admin Shape',
      email: 'shape@teste.pt',
      password: 'Senha@Segura123',
    });
    expect(reg.status).toBe(201);
    camposObrigatorios(reg.body.data.tenant);
    const token = reg.body.data.tokens.accessToken;

    const login = await request(app).post(`${API}/auth/login`).send({
      email: 'shape@teste.pt',
      password: 'Senha@Segura123',
    });
    expect(login.status).toBe(200);
    camposObrigatorios(login.body.data.tenant);

    const me = await request(app)
      .get(`${API}/auth/me`)
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    camposObrigatorios(me.body.data.tenant);

    const upd = await request(app)
      .put(`${API}/auth/tenant`)
      .set('Authorization', `Bearer ${token}`)
      .send(payloadFrontend);
    expect(upd.status).toBe(200);
    camposObrigatorios(upd.body.data.tenant);
    expect(upd.body.data.tenant.whatsapp.numeroWhatsapp).toBe('351910376276');
  });

  it('NÃO apaga iaGlobalAtiva/followUpPosSessaoAtivo/intervaloEntreSessoes ao gravar', async () => {
    const { token, tenantId } = await registarComToken();

    // Estado real de produção: switches desligados + intervalo configurado
    // por caminhos próprios (inbox / script) — a rota de Configurações não
    // os conhece e não os pode destruir.
    await Tenant.updateOne(
      { _id: tenantId },
      {
        $set: {
          'configuracoes.iaGlobalAtiva': false,
          'configuracoes.followUpPosSessaoAtivo': false,
          'configuracoes.intervaloEntreSessoes': 15,
        },
      }
    );

    const res = await request(app)
      .put(`${API}/auth/tenant`)
      .set('Authorization', `Bearer ${token}`)
      .send(payloadFrontend);
    expect(res.status).toBe(200);

    const tenant = await Tenant.findById(tenantId).lean();
    expect(tenant.configuracoes.iaGlobalAtiva).toBe(false);
    expect(tenant.configuracoes.followUpPosSessaoAtivo).toBe(false);
    expect(tenant.configuracoes.intervaloEntreSessoes).toBe(15);
  });

  it('rejeita iaGlobalAtiva por esta rota (strict — o switch tem caminho próprio)', async () => {
    const { token } = await registarComToken();

    const res = await request(app)
      .put(`${API}/auth/tenant`)
      .set('Authorization', `Bearer ${token}`)
      .send({ configuracoes: { iaGlobalAtiva: true } });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/internal/clientes/:id/alerta-equipa', () => {
  async function seed(slug) {
    const tenant = await Tenant.create({
      nome: `Clínica ${slug}`,
      slug,
      plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
      whatsapp: { numeroWhatsapp: '351910376276', provider: 'evolution' },
    });
    const models = getModels(getTenantDB(String(tenant._id)));
    const cliente = await models.Cliente.create({
      tenantId: tenant._id,
      nome: 'Maria Teste',
      telefone: `35191${Math.floor(1000000 + Math.random() * 8999999)}`,
    });
    return { tenant, cliente };
  }

  it('envia WhatsApp ao admin com o motivo', async () => {
    const { tenant, cliente } = await seed('alerta-a');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/alerta-equipa`)
      .set(svc)
      .send({ tenantId: String(tenant._id), motivo: 'Cliente diz ter 3 sessões; ficha mostra 1' });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [numero, alerta] = sendMock.mock.calls[0];
    expect(numero).toBe('351910376276');
    expect(alerta).toContain('Maria Teste');
    expect(alerta).toContain('Cliente diz ter 3 sessões; ficha mostra 1');
    expect(alerta).toContain('Podes responder por texto ou áudio');

    const models = getModels(getTenantDB(String(tenant._id)));
    const pedido = await models.PedidoEquipa.findOne({
      tenantId: tenant._id,
      contactoId: cliente._id,
    }).lean();
    expect(pedido).toMatchObject({
      contactoTipo: 'cliente',
      contactoNome: 'Maria Teste',
      status: 'pendente',
    });
  });

  it('cliente de outro tenant → 404 (isolamento)', async () => {
    const { cliente } = await seed('alerta-b');
    const { tenant: tenantB } = await seed('alerta-c');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/alerta-equipa`)
      .set(svc)
      .send({ tenantId: String(tenantB._id), motivo: 'x' });

    expect(res.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sem tenantId → 400', async () => {
    const { cliente } = await seed('alerta-d');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/alerta-equipa`)
      .set(svc)
      .send({ motivo: 'x' });

    expect(res.status).toBe(400);
  });

  it('contato.telefone público não recebe alerta nem cria pedido pendente', async () => {
    const { tenant, cliente } = await seed('alerta-publico');
    await Tenant.updateOne(
      { _id: tenant._id },
      {
        $unset: { 'whatsapp.numeroWhatsapp': 1 },
        $set: { 'contato.telefone': '351910376276' },
      },
    );

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/alerta-equipa`)
      .set(svc)
      .send({ tenantId: String(tenant._id), motivo: 'Pedido privado' });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
    const models = getModels(getTenantDB(String(tenant._id)));
    expect(await models.PedidoEquipa.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('lead: alerta-equipa envia WhatsApp com urgência e notas da ficha', async () => {
    const { tenant } = await seed('alerta-lead');
    const models = getModels(getTenantDB(String(tenant._id)));
    const lead = await models.Lead.create({
      tenantId: tenant._id,
      nome: 'Hayzel Teste',
      telefone: '13478930000',
      origem: 'whatsapp',
      urgencia: 'alta',
      observacoes: 'Estadia em Portugal apenas até 15 de julho.',
    });

    const res = await request(app)
      .post(`/api/internal/leads/${lead._id}/alerta-equipa`)
      .set(svc)
      .send({ tenantId: String(tenant._id), motivo: 'Sem vagas antes de 15/07 — verificar desistências' });

    expect(res.status).toBe(200);
    expect(res.body.data.whatsappEnviado).toBe(true);
    const [, alerta] = sendMock.mock.calls[0];
    expect(alerta).toContain('Hayzel Teste');
    expect(alerta).toContain('verificar desistências');
    expect(alerta).toContain('alta');
    expect(alerta).toContain('15 de julho');

    const pedido = await models.PedidoEquipa.findOne({
      tenantId: tenant._id,
      contactoId: lead._id,
    }).lean();
    expect(pedido).toMatchObject({
      contactoTipo: 'lead',
      contactoNome: 'Hayzel Teste',
      status: 'pendente',
    });
  });

  it('2º alerta do mesmo cliente em <10 min é deduplicado (anti-spam)', async () => {
    const { tenant, cliente } = await seed('alerta-e');
    const body = { tenantId: String(tenant._id), motivo: 'Cliente contesta sessões' };

    const primeiro = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/alerta-equipa`)
      .set(svc)
      .send(body);
    expect(primeiro.body.data.whatsappEnviado).toBe(true);

    const segundo = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/alerta-equipa`)
      .set(svc)
      .send({ ...body, motivo: 'Outro texto, mesmo cliente' });

    expect(segundo.status).toBe(200);
    expect(segundo.body.data.deduplicado).toBe(true);
    expect(segundo.body.data.whatsappEnviado).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
