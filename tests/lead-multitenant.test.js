/**
 * Phase 1 — isolamento multi-tenant do módulo de Leads.
 *
 * Cobertura mínima requerida pelo `multi-tenant-guard` antes de qualquer merge.
 * Acesso cruzado retorna 404, nunca 403.
 */

import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug) {
  const tenant = await Tenant.create({
    nome: `T-${slug}`,
    slug,
    plano: { tipo: 'pro', status: 'trial', trialDias: 7 },
    limites: { maxLeads: 100, leadsAtivo: true },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin', email: `admin@${slug}.pt`, passwordHash: 'h',
    role: 'admin', emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: 'admin' },
    process.env.JWT_SECRET, { expiresIn: '1h' }
  );
  return { tenant, token };
}

describe('Leads — isolamento multi-tenant', () => {
  it('GET /leads do tenant B não retorna leads do tenant A', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-a');
    const { token: tokenB } = await criarTenantEToken('mt-b');

    await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100001', nome: 'Lead A' });
    await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100002', nome: 'Lead A2' });

    const resB = await request(app).get('/api/leads').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.status).toBe(200);
    expect(resB.body.data).toHaveLength(0);
    expect(resB.body.pagination.total).toBe(0);
  });

  it('GET /leads/:id de outro tenant retorna 404 (nunca 403)', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-c');
    const { token: tokenB } = await criarTenantEToken('mt-d');

    const created = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100010', nome: 'Lead A' });

    const res = await request(app)
      .get(`/api/leads/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(res.status).not.toBe(403);
  });

  it('PUT /leads/:id de outro tenant retorna 404', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-e');
    const { token: tokenB } = await criarTenantEToken('mt-f');

    const created = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100020' });

    const res = await request(app)
      .put(`/api/leads/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ interesse: 'hack' });

    expect(res.status).toBe(404);
  });

  it('DELETE /leads/:id de outro tenant retorna 404 e não apaga nada', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-g');
    const { token: tokenB } = await criarTenantEToken('mt-h');

    const created = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100030' });

    const res = await request(app)
      .delete(`/api/leads/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);

    // Lead ainda existe para o tenant A
    const stillThere = await request(app)
      .get(`/api/leads/${created.body.data._id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(stillThere.status).toBe(200);
  });

  it('PATCH /leads/:id/stage de outro tenant retorna 404', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-i');
    const { token: tokenB } = await criarTenantEToken('mt-j');

    const created = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100040' });

    const res = await request(app)
      .patch(`/api/leads/${created.body.data._id}/stage`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ stage: 'em_conversa' });

    expect(res.status).toBe(404);
  });

  it('POST /leads/:id/convert de outro tenant retorna 404', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-k');
    const { token: tokenB } = await criarTenantEToken('mt-l');

    const created = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100050', nome: 'Lead Conv' });

    const res = await request(app)
      .post(`/api/leads/${created.body.data._id}/convert`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it('mesmo telefone pode existir em 2 tenants diferentes (índice unique é composto)', async () => {
    const { token: tokenA } = await criarTenantEToken('mt-m');
    const { token: tokenB } = await criarTenantEToken('mt-n');

    const a = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenA}`)
      .send({ telefone: '910100060', nome: 'A' });
    const b = await request(app).post('/api/leads').set('Authorization', `Bearer ${tokenB}`)
      .send({ telefone: '910100060', nome: 'B' });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data._id).not.toBe(b.body.data._id);
  });
});
