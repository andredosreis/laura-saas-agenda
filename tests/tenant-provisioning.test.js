/**
 * Rede de segurança para o provisionamento de tenants (ADR-024 — painel super-admin).
 *
 * Corre 100% em memória (mongodb-memory-server, ver tests/setup.js) — NUNCA toca
 * no cluster Atlas onde vive a Laura em produção. É seguro correr quantas vezes
 * quiseres: cada teste regista um tenant fictício e a DB é descartada no fim.
 *
 * Objectivo duplo:
 *   1. Provar que criar um cliente novo funciona (Tenant + User + DB-per-tenant + login).
 *   2. Documentar EXACTAMENTE o que falta a um tenant recém-criado para ficar
 *      operacional — em especial o WhatsApp/Evolution (teste 6), que é o passo
 *      que o painel terá de cobrir para "activar" clientes, não só os criar.
 *
 * Quando mexeres no `register` para o ligar a um `tenantProvisioningService`,
 * este ficheiro deve continuar verde — se partir, partiste a entrada de clientes.
 */
import request from 'supertest';
import app from '../src/app.js';
import Tenant from '../src/models/Tenant.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const API = '/api/v1';

const novoTenant = {
  nomeEmpresa: 'Clínica Teste Provisionamento',
  nome: 'Admin Teste',
  email: 'admin@clinica-teste.pt',
  password: 'Senha@Segura123',
};

const registar = (overrides = {}) =>
  request(app).post(`${API}/auth/register`).send({ ...novoTenant, ...overrides });

describe('Provisionamento de tenant — criar cliente novo (isolado da Laura)', () => {
  it('1) cria Tenant + User admin e devolve tokens', async () => {
    const res = await registar();

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenant.nome).toBe(novoTenant.nomeEmpresa);
    expect(res.body.data.user.email).toBe(novoTenant.email);
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.tokens).toHaveProperty('accessToken');
    expect(res.body.data.tokens).toHaveProperty('refreshToken');
  });

  it('2) o admin recém-criado consegue fazer login', async () => {
    await registar();

    const res = await request(app)
      .post(`${API}/auth/login`)
      .send({ email: novoTenant.email, password: novoTenant.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens).toHaveProperty('accessToken');
  });

  it('3) o tenant nasce em trial com limites de plano por defeito', async () => {
    const res = await registar();
    const tenant = await Tenant.findById(res.body.data.tenant.id).lean();

    expect(tenant).not.toBeNull();
    expect(['ativo', 'trial']).toContain(tenant.plano.status);
    expect(tenant.plano.status).toBe('trial');
    expect(tenant.limites.maxClientes).toBeGreaterThan(0);
    expect(tenant.limites.maxUsuarios).toBe(1);
  });

  it('4) a DB-per-tenant funciona: o admin cria um cliente (201)', async () => {
    const reg = await registar();
    const token = reg.body.data.tokens.accessToken;

    // Exercita o getTenantDB lazy: a base tenant_<id> é criada na 1ª escrita.
    const res = await request(app)
      .post(`${API}/clientes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Cliente Um', telefone: '910000001' });

    expect(res.status).toBe(201);
    expect(res.body.data._id).toBeDefined();
  });

  it('5) isolamento: outro tenant não vê o cliente do primeiro (404, nunca 403)', async () => {
    // Tenant A cria um cliente
    const regA = await registar();
    const tokenA = regA.body.data.tokens.accessToken;
    const clienteA = await request(app)
      .post(`${API}/clientes`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ nome: 'Cliente do A', telefone: '910000002' });
    const clienteId = clienteA.body.data._id;

    // Tenant B — empresa + email diferentes
    const regB = await registar({
      nomeEmpresa: 'Outra Clínica',
      email: 'admin@outra-clinica.pt',
    });
    const tokenB = regB.body.data.tokens.accessToken;

    const res = await request(app)
      .get(`${API}/clientes/${clienteId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404); // 404 — não revelar que o recurso existe noutro tenant
  });

  it('6) GAP: o tenant NASCE SEM WhatsApp/Evolution provisionado', async () => {
    // Este teste é deliberadamente um documento vivo do gap de activação.
    // Um tenant criado pelo `register` está pronto para a app web, MAS não está
    // operacional em WhatsApp: falta criar a instância Evolution e o webhook.
    const res = await registar();
    const tenant = await Tenant.findById(res.body.data.tenant.id).lean();

    // Sinais de "não operacional em WhatsApp" no nascimento:
    expect(tenant.whatsapp?.instanceName).toBeFalsy(); // sem instância Evolution dedicada
    expect(tenant.whatsapp?.instanceToken).toBeFalsy(); // sem token de instância
    expect(tenant.whatsapp?.webhookConfigured).toBe(false); // webhook por configurar
    expect(tenant.limites.whatsappAutomacao).toBe(false); // automação WhatsApp desligada

    // Observação adicional (não-bloqueante): o provider arranca em 'zapi' por
    // defeito no schema, apesar da migração para Evolution API (ADR-014). O passo
    // de activação no painel terá de definir provider='evolution' + instanceName.
    expect(tenant.whatsapp?.provider).toBe('zapi');

    // CONCLUSÃO documentada: o painel super-admin precisa de um passo explícito de
    // "activar WhatsApp" (provider + instanceName + instância Evolution + webhook).
    // Criar o tenant != tornar o tenant operacional.
  });
});
