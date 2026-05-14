/**
 * Phase 1 — endpoints internos /api/internal/leads/* protegidos por
 * X-Service-Token. Usado pelo `ia-service` Python (Phase 2+).
 */

import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';

const SERVICE_TOKEN = 'phase1-test-token';

beforeAll(async () => {
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  await setupTestDB();
});
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantAtivo({ slug = 'svc', leadsAtivo = true, maxLeads = 100, planoStatus = 'ativo' } = {}) {
  return Tenant.create({
    nome: 'Svc Tenant',
    slug,
    plano: { tipo: 'pro', status: planoStatus, trialDias: 7 },
    limites: { maxLeads, leadsAtivo },
  });
}

describe('Auth do X-Service-Token', () => {
  it('retorna 401 sem header', async () => {
    const res = await request(app).post('/api/internal/leads').send({ tenantId: 'x', telefone: '912345678' });
    expect(res.status).toBe(401);
  });

  it('retorna 401 com token errado', async () => {
    const res = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', 'wrong')
      .send({ tenantId: 'x', telefone: '912345678' });
    expect(res.status).toBe(401);
  });

  it('aceita token correcto e valida payload normalmente', async () => {
    const tenant = await criarTenantAtivo();

    const res = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345001' });

    expect(res.status).toBe(201);
    expect(res.body.data.telefone).toBe('912345001');
    expect(res.body.data.origem).toBe('whatsapp');
    expect(res.body.data.status).toBe('novo');
  });
});

describe('POST /api/internal/leads', () => {
  it('rejeita 400 sem telefone', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-2' });
    const res = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id) });
    expect(res.status).toBe(400);
  });

  it('rejeita 400 com tenantId inválido', async () => {
    const res = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: 'not-an-id', telefone: '912345678' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('tenant_invalid');
  });

  it('rejeita 403 quando leadsAtivo=false', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-3', leadsAtivo: false });
    const res = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345002' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('leads_inactive');
  });

  it('é idempotente para o mesmo telefone (alreadyExisted=true)', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-4' });
    const r1 = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345003' });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345003', nome: 'Mesma pessoa' });
    expect(r2.status).toBe(200);
    expect(r2.body.alreadyExisted).toBe(true);
    expect(r2.body.data._id).toBe(r1.body.data._id);
  });

  it('respeita maxLeads do tenant (lead_limit_reached)', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-5', maxLeads: 1 });
    const r1 = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345010' });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345011' });
    expect(r2.status).toBe(403);
    expect(r2.body.code).toBe('lead_limit_reached');
  });
});

describe('PATCH /api/internal/leads/:id/stage (transições internas)', () => {
  it('aceita transição válida', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-6' });
    const created = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345020' });

    const res = await request(app)
      .patch(`/api/internal/leads/${created.body.data._id}/stage`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), stage: 'em_conversa' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('em_conversa');
  });

  it('recusa transição inválida (sem privilégios admin nas internas)', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-7' });
    const created = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345021' });

    // novo → agendado é proibido sem passar por em_conversa/qualificado
    const res = await request(app)
      .patch(`/api/internal/leads/${created.body.data._id}/stage`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), stage: 'agendado' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_transition');
  });

  it('recusa convertido (reservado a /convert)', async () => {
    const tenant = await criarTenantAtivo({ slug: 'svc-8' });
    const created = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), telefone: '912345022' });

    const res = await request(app)
      .patch(`/api/internal/leads/${created.body.data._id}/stage`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), stage: 'convertido' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('restricted_stage');
  });

  it('recusa lead de outro tenant (cross-tenant) com 404', async () => {
    const tenantA = await criarTenantAtivo({ slug: 'svc-x1' });
    const tenantB = await criarTenantAtivo({ slug: 'svc-x2' });
    const created = await request(app)
      .post('/api/internal/leads')
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenantA._id), telefone: '912345030' });

    const res = await request(app)
      .patch(`/api/internal/leads/${created.body.data._id}/stage`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenantB._id), stage: 'em_conversa' });

    expect(res.status).toBe(404);
  });
});
