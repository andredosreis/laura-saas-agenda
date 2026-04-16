import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'salon-trans') {
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

const transacaoValida = {
  tipo: 'Receita',
  categoria: 'Serviço Avulso',
  valor: 100,
  descricao: 'Serviço de teste',
};

// ──────────────────────────────────────────────
// Autenticação obrigatória
// ──────────────────────────────────────────────

describe('Transações — autenticação obrigatória', () => {
  it('GET /api/transacoes → 401 sem token', async () => {
    const res = await request(app).get('/api/transacoes');
    expect(res.status).toBe(401);
  });

  it('POST /api/transacoes → 401 sem token', async () => {
    const res = await request(app).post('/api/transacoes').send(transacaoValida);
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────
// POST /api/transacoes — Criar transação
// ──────────────────────────────────────────────

describe('POST /api/transacoes', () => {
  it('cria transação com sucesso', async () => {
    const { token } = await criarTenantEToken();
    const res = await request(app)
      .post('/api/transacoes')
      .set('Authorization', `Bearer ${token}`)
      .send(transacaoValida);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('transacao');
    expect(res.body.transacao.valor).toBe(100);
    expect(res.body.transacao.tipo).toBe('Receita');
  });

  it('rejeita criação sem campos obrigatórios → 400', async () => {
    const { token } = await criarTenantEToken('trans-400');
    const res = await request(app)
      .post('/api/transacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'Receita' }); // faltam categoria, valor, descricao

    expect(res.status).toBe(400);
  });

  it('rejeita valor zero ou negativo → 400', async () => {
    const { token } = await criarTenantEToken('trans-neg');
    const res = await request(app)
      .post('/api/transacoes')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...transacaoValida, valor: -10 });

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────
// GET /api/transacoes — Listar
// ──────────────────────────────────────────────

describe('GET /api/transacoes', () => {
  it('retorna lista paginada com sucesso', async () => {
    const { token } = await criarTenantEToken('trans-list');
    const res = await request(app)
      .get('/api/transacoes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('lista inclui transação criada pelo mesmo tenant', async () => {
    const { token } = await criarTenantEToken('trans-list2');

    await request(app)
      .post('/api/transacoes')
      .set('Authorization', `Bearer ${token}`)
      .send(transacaoValida);

    const res = await request(app)
      .get('/api/transacoes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────
// Isolamento multi-tenant
// ──────────────────────────────────────────────

describe('Transações — isolamento multi-tenant', () => {
  it('Tenant B não consegue ver transação de Tenant A → 404', async () => {
    const { token: tokenA } = await criarTenantEToken('trans-iso-a');
    const { token: tokenB } = await criarTenantEToken('trans-iso-b');

    const criar = await request(app)
      .post('/api/transacoes')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(transacaoValida);

    const transacaoId = criar.body.transacao._id;

    const res = await request(app)
      .get(`/api/transacoes/${transacaoId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// GET /api/transacoes/:id — ID inválido
// ──────────────────────────────────────────────

describe('GET /api/transacoes/:id — validação de ID', () => {
  it('retorna 400 para ID inválido', async () => {
    const { token } = await criarTenantEToken('trans-id');
    const res = await request(app)
      .get('/api/transacoes/id-invalido')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('retorna 404 para ID válido mas inexistente', async () => {
    const { token } = await criarTenantEToken('trans-404');
    const res = await request(app)
      .get('/api/transacoes/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// GET /api/transacoes/relatorio/periodo
// ──────────────────────────────────────────────

describe('GET /api/transacoes/relatorio/periodo', () => {
  it('retorna relatório com datas válidas', async () => {
    const { token } = await criarTenantEToken('trans-rel');
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

    const res = await request(app)
      .get(`/api/transacoes/relatorio/periodo?dataInicio=${inicio}&dataFim=${fim}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
