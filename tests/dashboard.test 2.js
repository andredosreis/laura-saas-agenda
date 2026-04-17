import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'salon-dash') {
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
  return { tenant, user, token };
}

// ──────────────────────────────────────────────
// Autenticação obrigatória em todos os endpoints
// ──────────────────────────────────────────────

describe('Dashboard — autenticação obrigatória', () => {
  const endpoints = [
    '/api/dashboard/agendamentosHoje',
    '/api/dashboard/contagemAgendamentosAmanha',
    '/api/dashboard/agendamentosAmanha',
    '/api/dashboard/clientesAtendidosSemana',
    '/api/dashboard/totais',
    '/api/dashboard/sessoes-baixas',
    '/api/dashboard/proximos-agendamentos',
    '/api/dashboard/financeiro',
  ];

  for (const endpoint of endpoints) {
    it(`GET ${endpoint} → 401 sem token`, async () => {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    });
  }
});

// ──────────────────────────────────────────────
// GET /api/dashboard/totais
// ──────────────────────────────────────────────

describe('GET /api/dashboard/totais', () => {
  it('retorna estrutura correcta com zeros para tenant vazio', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .get('/api/dashboard/totais')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalClientes', 0);
    expect(res.body).toHaveProperty('totalPacotes', 0);
    expect(res.body).toHaveProperty('totalAgendamentosGeral', 0);
    expect(res.body).toHaveProperty('totalAgendamentosFuturos', 0);
  });

  it('isolamento — Tenant A não vê dados de Tenant B', async () => {
    const { token: tokenA } = await criarTenantEToken('dash-iso-a');
    const { token: tokenB } = await criarTenantEToken('dash-iso-b');

    // Criar cliente no tenant B via API
    await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ nome: 'Cliente B', telefone: '920000099' });

    // Tenant A deve ver 0 clientes
    const res = await request(app)
      .get('/api/dashboard/totais')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.totalClientes).toBe(0);
  });
});

// ──────────────────────────────────────────────
// GET /api/dashboard/agendamentosHoje
// ──────────────────────────────────────────────

describe('GET /api/dashboard/agendamentosHoje', () => {
  it('retorna array (vazio para tenant sem agendamentos hoje)', async () => {
    const { token } = await criarTenantEToken('dash-hoje');
    const res = await request(app)
      .get('/api/dashboard/agendamentosHoje')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// GET /api/dashboard/contagemAgendamentosAmanha
// ──────────────────────────────────────────────

describe('GET /api/dashboard/contagemAgendamentosAmanha', () => {
  it('retorna { contagem: 0 } para tenant vazio', async () => {
    const { token } = await criarTenantEToken('dash-amanha');
    const res = await request(app)
      .get('/api/dashboard/contagemAgendamentosAmanha')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contagem', 0);
  });
});

// ──────────────────────────────────────────────
// GET /api/dashboard/proximos-agendamentos
// ──────────────────────────────────────────────

describe('GET /api/dashboard/proximos-agendamentos', () => {
  it('retorna { total, agendamentos } para tenant vazio', async () => {
    const { token } = await criarTenantEToken('dash-prox');
    const res = await request(app)
      .get('/api/dashboard/proximos-agendamentos')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total', 0);
    expect(Array.isArray(res.body.agendamentos)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// GET /api/dashboard/financeiro
// ──────────────────────────────────────────────

describe('GET /api/dashboard/financeiro', () => {
  it('retorna estrutura financeira correcta para tenant vazio', async () => {
    const { token } = await criarTenantEToken('dash-fin');
    const res = await request(app)
      .get('/api/dashboard/financeiro')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('faturamentoMensal', 0);
    expect(res.body).toHaveProperty('taxaComparecimento', 0);
    expect(res.body).toHaveProperty('agendamentosTotaisMes', 0);
  });

  it('isolamento — Tenant A não vê faturamento de Tenant B', async () => {
    const { token: tokenA } = await criarTenantEToken('dash-fin-a');
    const { token: tokenB } = await criarTenantEToken('dash-fin-b');

    // Criar transação no Tenant B via API
    await request(app)
      .post('/api/transacoes')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        tipo: 'Receita',
        categoria: 'Serviço Avulso',
        valor: 500,
        descricao: 'Serviço teste B',
      });

    // Tenant A deve ver faturamento 0
    const res = await request(app)
      .get('/api/dashboard/financeiro')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.faturamentoMensal).toBe(0);
  });
});

// ──────────────────────────────────────────────
// GET /api/dashboard/sessoes-baixas
// ──────────────────────────────────────────────

describe('GET /api/dashboard/sessoes-baixas', () => {
  it('retorna { total, clientes } para tenant vazio', async () => {
    const { token } = await criarTenantEToken('dash-sessoes');
    const res = await request(app)
      .get('/api/dashboard/sessoes-baixas')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total', 0);
    expect(Array.isArray(res.body.clientes)).toBe(true);
  });
});
