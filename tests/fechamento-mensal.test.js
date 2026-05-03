import request from 'supertest';
import { DateTime } from 'luxon';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug, role = 'admin') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Test',
    email: `${slug}@test.pt`,
    passwordHash: 'hash-placeholder',
    role,
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  const models = getModels(getTenantDB(tenant._id.toString()));
  return { tenant, user, token, models };
}

// Cria um Pagamento Receita 100€ no mês alvo (para o snapshot ter conteúdo).
async function semearReceita(models, tenantId, ano, mes, valor = 100) {
  const data = DateTime.fromObject({ year: ano, month: mes, day: 15 }, { zone: 'Europe/Lisbon' }).toJSDate();
  const t = await models.Transacao.create({
    tenantId,
    tipo: 'Receita',
    categoria: 'Pacote',
    valor,
    valorFinal: valor,
    descricao: 'Seed receita',
    statusPagamento: 'Pago',
    formaPagamento: 'Dinheiro',
    dataPagamento: data,
  });
  await models.Pagamento.create({
    tenantId, transacao: t._id, valor, formaPagamento: 'Dinheiro', dataPagamento: data,
  });
}

// ──────────────────────────────────────────────
// Autenticação e autorização
// ──────────────────────────────────────────────

describe('POST /api/fechamentos-mensais — auth/role', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/fechamentos-mensais')
      .send({ ano: 2026, mes: 4 });
    expect(res.status).toBe(401);
  });

  it('retorna 403 quando role não é admin', async () => {
    const { token } = await criarTenantEToken('rec-403', 'recepcionista');
    const res = await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`)
      .send({ ano: 2026, mes: 4 });
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────
// Criação e re-fechamento (idempotente)
// ──────────────────────────────────────────────

describe('POST /api/fechamentos-mensais — criar e re-fechar', () => {
  it('cria snapshot 201 com versao=1, totais calculados a partir das Transacoes/Pagamentos', async () => {
    const { token, tenant, models } = await criarTenantEToken('cria');
    await semearReceita(models, tenant._id, 2026, 4, 250);

    const res = await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`)
      .send({ ano: 2026, mes: 4 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ano).toBe(2026);
    expect(res.body.data.mes).toBe(4);
    expect(res.body.data.versao).toBe(1);
    expect(res.body.data.totais.receitas).toBe(250);
    expect(res.body.data.totais.saldo).toBe(250);
  });

  it('re-fechar o mesmo mês incrementa versao e actualiza totais', async () => {
    const { token, tenant, models } = await criarTenantEToken('refechar');
    await semearReceita(models, tenant._id, 2026, 4, 100);

    const r1 = await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`)
      .send({ ano: 2026, mes: 4 });
    expect(r1.body.data.versao).toBe(1);
    expect(r1.body.data.totais.receitas).toBe(100);

    // Adiciona mais receita e re-fecha
    await semearReceita(models, tenant._id, 2026, 4, 50);

    const r2 = await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`)
      .send({ ano: 2026, mes: 4 });
    expect(r2.body.data.versao).toBe(2);
    expect(r2.body.data.totais.receitas).toBe(150);
  });
});

// ──────────────────────────────────────────────
// GET — listagem e detalhe
// ──────────────────────────────────────────────

describe('GET /api/fechamentos-mensais', () => {
  it('lista fechamentos paginados ordenados por (ano, mes) desc', async () => {
    const { token } = await criarTenantEToken('lista');

    // Criar 3 fechamentos
    for (const mes of [3, 4, 5]) {
      await request(app)
        .post('/api/fechamentos-mensais')
        .set('Authorization', `Bearer ${token}`)
        .send({ ano: 2026, mes });
    }

    const res = await request(app)
      .get('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.map(f => f.mes)).toEqual([5, 4, 3]);
    expect(res.body.pagination.total).toBe(3);
  });

  it('GET /:ano/:mes retorna o snapshot', async () => {
    const { token } = await criarTenantEToken('detalhe');
    await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`)
      .send({ ano: 2026, mes: 4 });

    const res = await request(app)
      .get('/api/fechamentos-mensais/2026/4')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.ano).toBe(2026);
    expect(res.body.data.mes).toBe(4);
  });

  it('GET /:ano/:mes inexistente → 404', async () => {
    const { token } = await criarTenantEToken('det-404');
    const res = await request(app)
      .get('/api/fechamentos-mensais/2026/4')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// DELETE
// ──────────────────────────────────────────────

describe('DELETE /api/fechamentos-mensais/:ano/:mes', () => {
  it('admin remove fechamento existente', async () => {
    const { token } = await criarTenantEToken('del');
    await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${token}`)
      .send({ ano: 2026, mes: 4 });

    const res = await request(app)
      .delete('/api/fechamentos-mensais/2026/4')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.removido).toBe(true);

    // Confirmar remoção
    const get = await request(app)
      .get('/api/fechamentos-mensais/2026/4')
      .set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(404);
  });

  it('recepcionista (não-admin) não pode remover → 403', async () => {
    const { token: tokenAdmin } = await criarTenantEToken('admin-del');
    const { token: tokenRec, tenant } = await criarTenantEToken('rec-del', 'recepcionista');

    // Admin cria; recepcionista do MESMO tenant tenta apagar.
    // Como é o mesmo tenant precisamos do mesmo tenant — refazer.
    const adminUser = await User.create({
      tenantId: tenant._id,
      nome: 'Admin do tenant rec-del',
      email: 'admin@rec-del.test',
      passwordHash: 'hash-placeholder',
      role: 'admin',
      emailVerificado: true,
    });
    const adminToken = jwt.sign(
      { userId: adminUser._id, tenantId: tenant._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    void tokenAdmin; // silenciar — usámos o adminToken acima

    await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ano: 2026, mes: 4 });

    const res = await request(app)
      .delete('/api/fechamentos-mensais/2026/4')
      .set('Authorization', `Bearer ${tokenRec}`);

    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────
// Multi-tenant isolation
// ──────────────────────────────────────────────

describe('Isolamento multi-tenant — Fechamento', () => {
  it('Tenant B não consegue ver fechamento do Tenant A → 404', async () => {
    const a = await criarTenantEToken('iso-a');
    const b = await criarTenantEToken('iso-b');

    await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ ano: 2026, mes: 4 });

    const res = await request(app)
      .get('/api/fechamentos-mensais/2026/4')
      .set('Authorization', `Bearer ${b.token}`);

    expect(res.status).toBe(404);
  });

  it('listagem de B não inclui fechamentos de A', async () => {
    const a = await criarTenantEToken('iso2-a');
    const b = await criarTenantEToken('iso2-b');

    await request(app)
      .post('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ ano: 2026, mes: 4 });

    const res = await request(app)
      .get('/api/fechamentos-mensais')
      .set('Authorization', `Bearer ${b.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });
});
