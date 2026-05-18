/**
 * Phase 1 — Lead CRUD via /api/leads.
 *
 * Cobre:
 *   - criação manual (com/sem leadsAtivo)
 *   - listagem + filtros + paginação
 *   - get/update/delete com validação ObjectId
 *   - dedupe por telefone
 *   - PATCH /:id/stage com transições válidas e inválidas
 *   - POST /:id/pause-ai
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

async function criarTenantEToken({ slug = 'test-salon', leadsAtivo = true, role = 'admin' } = {}) {
  const tenant = await Tenant.create({
    nome: 'Salão Teste',
    slug,
    plano: { tipo: 'pro', status: 'trial', trialDias: 7 },
    limites: { maxLeads: 100, leadsAtivo },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role,
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, user, token };
}

async function criarLead(token, body = {}) {
  const res = await request(app)
    .post('/api/leads')
    .set('Authorization', `Bearer ${token}`)
    .send({ telefone: '912345678', nome: 'Lead Teste', ...body });
  return res;
}

describe('POST /api/leads', () => {
  it('cria um lead manualmente quando leadsAtivo=true', async () => {
    const { token } = await criarTenantEToken();
    const res = await criarLead(token, { telefone: '912345001', nome: 'Maria' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nome).toBe('Maria');
    expect(res.body.data.telefone).toBe('912345001');
    expect(res.body.data.status).toBe('novo');
    expect(res.body.data.origem).toBe('manual'); // default p/ origem POST manual
  });

  it('rejeita criação com 403 quando leadsAtivo=false', async () => {
    const { token } = await criarTenantEToken({ leadsAtivo: false, slug: 'sem-leads' });
    const res = await criarLead(token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('leads_inactive');
  });

  it('rejeita 409 quando o telefone já existe no tenant', async () => {
    const { token } = await criarTenantEToken({ slug: 'dup' });
    await criarLead(token, { telefone: '912345002' });
    const res = await criarLead(token, { telefone: '912345002', nome: 'Outro' });

    expect(res.status).toBe(409);
  });

  it('rejeita telefone inválido (curto/regex) com 400 do Zod', async () => {
    const { token } = await criarTenantEToken({ slug: 'badtel' });
    const res = await criarLead(token, { telefone: '12' });

    expect(res.status).toBe(400);
  });

  it('respeita maxLeads (limite atingido → 403)', async () => {
    const tenant = await Tenant.create({
      nome: 'Lim',
      slug: 'lim',
      plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
      limites: { maxLeads: 1, leadsAtivo: true },
    });
    const user = await User.create({
      tenantId: tenant._id,
      nome: 'A', email: 'a@lim.pt', passwordHash: 'h',
      role: 'admin', emailVerificado: true,
    });
    const token = jwt.sign(
      { userId: user._id, tenantId: tenant._id, role: 'admin' },
      process.env.JWT_SECRET, { expiresIn: '1h' }
    );

    const r1 = await criarLead(token, { telefone: '910000001' });
    expect(r1.status).toBe(201);
    const r2 = await criarLead(token, { telefone: '910000002' });
    expect(r2.status).toBe(403);
    expect(r2.body.error).toMatch(/maxLeads/);
  });
});

describe('GET /api/leads (lista + filtros)', () => {
  it('lista leads do tenant com paginação correcta', async () => {
    const { token } = await criarTenantEToken({ slug: 'list' });
    await criarLead(token, { telefone: '910000001', nome: 'A' });
    await criarLead(token, { telefone: '910000002', nome: 'B' });

    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(2);
  });

  it('filtra por status', async () => {
    const { token } = await criarTenantEToken({ slug: 'filt' });
    const created = await criarLead(token, { telefone: '910000010', nome: 'X' });
    // move para em_conversa
    await request(app)
      .patch(`/api/leads/${created.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'em_conversa' });

    await criarLead(token, { telefone: '910000011', nome: 'Y' });

    const res = await request(app)
      .get('/api/leads?status=em_conversa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].telefone).toBe('910000010');
  });

  it('rejeita query com status inválido', async () => {
    const { token } = await criarTenantEToken({ slug: 'badq' });
    const res = await request(app)
      .get('/api/leads?status=stage_que_nao_existe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('GET/PUT/DELETE /api/leads/:id', () => {
  it('GET devolve o lead com a sua conversa associada (null se não houver)', async () => {
    const { token } = await criarTenantEToken({ slug: 'getone' });
    const c = await criarLead(token, { telefone: '910000020' });
    const res = await request(app)
      .get(`/api/leads/${c.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.lead._id).toBe(c.body.data._id);
    expect(res.body.data.conversa).toBeNull();
  });

  it('GET 404 para id inexistente', async () => {
    const { token } = await criarTenantEToken({ slug: 'g404' });
    const res = await request(app)
      .get('/api/leads/664f1c2e8b3a4d0012345678')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('GET 400 para id mal formado', async () => {
    const { token } = await criarTenantEToken({ slug: 'gbad' });
    const res = await request(app)
      .get('/api/leads/not-a-valid-id')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('PUT actualiza campos básicos', async () => {
    const { token } = await criarTenantEToken({ slug: 'put' });
    const c = await criarLead(token, { telefone: '910000030' });

    const res = await request(app)
      .put(`/api/leads/${c.body.data._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ interesse: 'Drenagem', urgencia: 'alta' });

    expect(res.status).toBe(200);
    expect(res.body.data.interesse).toBe('Drenagem');
    expect(res.body.data.urgencia).toBe('alta');
  });

  it('DELETE remove e devolve o id', async () => {
    const { token } = await criarTenantEToken({ slug: 'del' });
    const c = await criarLead(token, { telefone: '910000040' });

    const res = await request(app)
      .delete(`/api/leads/${c.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .get(`/api/leads/${c.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(404);
  });
});

describe('PATCH /api/leads/:id/stage', () => {
  it('aceita transição válida novo → em_conversa', async () => {
    const { token } = await criarTenantEToken({ slug: 's1' });
    const c = await criarLead(token, { telefone: '910000050' });

    const res = await request(app)
      .patch(`/api/leads/${c.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'em_conversa' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('em_conversa');
  });

  it('recusa salto para "convertido" (uso reservado a /convert)', async () => {
    const { token } = await criarTenantEToken({ slug: 's2' });
    const c = await criarLead(token, { telefone: '910000051' });

    const res = await request(app)
      .patch(`/api/leads/${c.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'convertido' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('restricted_stage');
  });

  it('recusa transição inválida para gerente', async () => {
    const { token } = await criarTenantEToken({ slug: 's3', role: 'gerente' });
    const c = await criarLead(token, { telefone: '910000052' });
    // novo → agendado é inválido (precisa de em_conversa primeiro)
    const res = await request(app)
      .patch(`/api/leads/${c.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'agendado' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_transition');
  });

  it('admin pode forçar transição inválida (ex: novo → agendado)', async () => {
    const { token } = await criarTenantEToken({ slug: 's4', role: 'admin' });
    const c = await criarLead(token, { telefone: '910000053' });

    const res = await request(app)
      .patch(`/api/leads/${c.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'agendado' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('agendado');
  });

  it('exige motivo ao mover para "perdido"', async () => {
    const { token } = await criarTenantEToken({ slug: 's5' });
    const c = await criarLead(token, { telefone: '910000054' });

    const res = await request(app)
      .patch(`/api/leads/${c.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'perdido' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('motivo_required');

    const res2 = await request(app)
      .patch(`/api/leads/${c.body.data._id}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'perdido', motivo: 'Sem orçamento' });

    expect(res2.status).toBe(200);
    expect(res2.body.data.perdido.motivo).toBe('Sem orçamento');
  });
});

describe('POST /api/leads/:id/pause-ai', () => {
  it('alterna iaAtiva on/off', async () => {
    const { token } = await criarTenantEToken({ slug: 'pause' });
    const c = await criarLead(token, { telefone: '910000060' });
    expect(c.body.data.iaAtiva).toBe(true);

    const off = await request(app)
      .post(`/api/leads/${c.body.data._id}/pause-ai`)
      .set('Authorization', `Bearer ${token}`)
      .send({ iaAtiva: false });
    expect(off.status).toBe(200);
    expect(off.body.data.iaAtiva).toBe(false);

    const on = await request(app)
      .post(`/api/leads/${c.body.data._id}/pause-ai`)
      .set('Authorization', `Bearer ${token}`)
      .send({ iaAtiva: true });
    expect(on.body.data.iaAtiva).toBe(true);
  });
});
