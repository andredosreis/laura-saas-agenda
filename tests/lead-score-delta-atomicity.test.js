/**
 * GAP-02 — Cross-turn race on score accumulation.
 *
 * Verifica que o modo `scoreDelta` do endpoint
 *   PATCH /api/internal/leads/:id/qualificacao
 * acumula deltas atomicamente via aggregation pipeline update.
 *
 * Antes da fix: dois turns paralelos liam `current_score` independentemente,
 * computavam `new_score` localmente, escreviam — last write wins, um delta
 * silenciosamente perdido.
 *
 * Depois da fix: o servidor executa `$add` + `$min` + `$max` dentro de um
 * único `findOneAndUpdate` aggregation pipeline. Atomicidade single-document
 * do MongoDB garante que N deltas paralelos produzem score final = soma dos
 * deltas (clamp [0,100]).
 */

import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

const SERVICE_TOKEN = 'gap02-test-token';

beforeAll(async () => {
  process.env.INTERNAL_SERVICE_TOKEN = SERVICE_TOKEN;
  await setupTestDB();
});
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantAtivo() {
  return Tenant.create({
    nome: 'Tenant GAP-02',
    slug: 'gap02',
    plano: { tipo: 'pro', status: 'ativo', trialDias: 7 },
    limites: { maxLeads: 100, leadsAtivo: true },
  });
}

async function criarLead(tenantId, telefone) {
  const db = getTenantDB(String(tenantId));
  const { Lead } = getModels(db);
  return Lead.create({
    tenantId,
    telefone,
    status: 'em_conversa',
    qualificacao: { score: 0 },
  });
}

async function lerLead(tenantId, leadId) {
  const db = getTenantDB(String(tenantId));
  const { Lead } = getModels(db);
  return Lead.findOne({ _id: leadId, tenantId });
}

describe('GAP-02: Score delta atomicity', () => {
  it('PATCH com scoreDelta=+20 acumula correctamente (0 + 20 = 20)', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000001');

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), scoreDelta: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.qualificacao.score).toBe(20);
  });

  it('PATCH com scoreDelta clamp em 100 (95 + 30 → 100, não 125)', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000002');
    lead.qualificacao.score = 95;
    await lead.save();

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), scoreDelta: 30 });

    expect(res.status).toBe(200);
    expect(res.body.data.qualificacao.score).toBe(100);
  });

  it('PATCH com scoreDelta clamp em 0 (10 + (-30) → 0, não -20)', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000003');
    lead.qualificacao.score = 10;
    await lead.save();

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), scoreDelta: -30 });

    expect(res.status).toBe(200);
    expect(res.body.data.qualificacao.score).toBe(0);
  });

  it('PATCH com scoreDelta=20 em status=em_conversa cruzando 60 → auto-promove a qualificado', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000004');
    lead.qualificacao.score = 45;
    await lead.save();

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), scoreDelta: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.qualificacao.score).toBe(65);
    expect(res.body.data.status).toBe('qualificado');
  });

  it('PATCH com scoreDelta cruzando 60 em status=agendado → score actualiza, status preserva', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000005');
    lead.status = 'agendado';
    lead.qualificacao.score = 50;
    await lead.save();

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), scoreDelta: 20 });

    expect(res.status).toBe(200);
    expect(res.body.data.qualificacao.score).toBe(70);
    expect(res.body.data.status).toBe('agendado');
  });

  it('PATCH rejeita scoreDelta fora de [-30, +30]', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000006');

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), scoreDelta: 50 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('score_delta_invalid');
  });

  it('PATCH rejeita score + scoreDelta simultâneos', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000007');

    const res = await request(app)
      .patch(`/api/internal/leads/${lead._id}/qualificacao`)
      .set('X-Service-Token', SERVICE_TOKEN)
      .send({ tenantId: String(tenant._id), score: 50, scoreDelta: 10 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('score_and_delta_conflict');
  });

  it('TESTE CRÍTICO GAP-02: 5 deltas paralelos de +10 → score final = 50 (não <50)', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000008');

    // 5 chamadas EXACTAMENTE paralelas. Antes da fix: pelo menos uma das
    // últimas perderia o seu delta para last-write-wins, dando score < 50.
    // Após a fix: aggregation pipeline atómico → score final = 50.
    const tentativas = Array.from({ length: 5 }, () =>
      request(app)
        .patch(`/api/internal/leads/${lead._id}/qualificacao`)
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({ tenantId: String(tenant._id), scoreDelta: 10 }),
    );

    const results = await Promise.all(tentativas);

    // Todas as chamadas devem ter sucesso (200).
    for (const r of results) {
      expect(r.status).toBe(200);
    }

    // Score final = 5 × 10 = 50.
    const final = await lerLead(tenant._id, lead._id);
    expect(final.qualificacao.score).toBe(50);
  });

  it('TESTE CRÍTICO GAP-02: 10 deltas paralelos de +10 → score=100 (clamp aplicado por turno)', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000009');

    const tentativas = Array.from({ length: 10 }, () =>
      request(app)
        .patch(`/api/internal/leads/${lead._id}/qualificacao`)
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({ tenantId: String(tenant._id), scoreDelta: 10 }),
    );

    const results = await Promise.all(tentativas);
    for (const r of results) {
      expect(r.status).toBe(200);
    }

    const final = await lerLead(tenant._id, lead._id);
    // 10 × 10 = 100, clamp [0,100]. Cada turno clampa antes de escrever,
    // por isso o resultado final é exactamente 100 (não overflow).
    expect(final.qualificacao.score).toBe(100);
    // E auto-promoveu (em_conversa → qualificado quando score cruzou 60).
    expect(final.status).toBe('qualificado');
  });

  it('TESTE CRÍTICO GAP-02: mix sem clamp intermédio → soma determinística', async () => {
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000010');
    lead.qualificacao.score = 30;
    await lead.save();

    // Mix de positivos e negativos cuidadosamente escolhidos para nunca
    // atingirem os bounds [0, 100] em qualquer ordem de aplicação. Isto
    // mantém o teste determinístico independentemente da ordem em que o
    // MongoDB executa os 5 updates paralelos.
    // Soma: 10 + 10 + 5 + (-5) + 10 = 30. Final esperado: 30 + 30 = 60.
    const deltas = [10, 10, 5, -5, 10];
    const tentativas = deltas.map((d) =>
      request(app)
        .patch(`/api/internal/leads/${lead._id}/qualificacao`)
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({ tenantId: String(tenant._id), scoreDelta: d }),
    );

    const results = await Promise.all(tentativas);
    for (const r of results) {
      expect(r.status).toBe(200);
    }

    const final = await lerLead(tenant._id, lead._id);
    expect(final.qualificacao.score).toBe(60);
  });

  it('Documenta limite da fix: ordem afecta resultado quando clamp intermédio dispara', async () => {
    // O clamp ([0, 100]) é aplicado a cada operação individual, não na
    // soma agregada. Isto significa que quando deltas paralelos atingem
    // o bound, deltas posteriores na ordem de execução do MongoDB "perdem"
    // o que excederia o limite. Comportamento esperado e documentado.
    //
    // Exemplo: score=95, deltas paralelos [+10, +10, -10]. Soma algébrica
    // = +10 → esperaríamos 95 + 10 = 105 → clamp 100. Mas se a ordem for
    // (+10 → clamp 100), (+10 → clamp 100 ainda), (-10 → 90), o resultado
    // é 90, não 100. Ordem (-10 → 85), (+10 → 95), (+10 → 100) dá 100.
    //
    // Este teste documenta o comportamento sem fixar uma expectativa
    // determinística — só verifica que o score final está dentro de bounds
    // razoáveis dado o pior caso de ordem adversa.
    const tenant = await criarTenantAtivo();
    const lead = await criarLead(tenant._id, '910000011');
    lead.qualificacao.score = 95;
    await lead.save();

    const deltas = [10, 10, -10];
    const tentativas = deltas.map((d) =>
      request(app)
        .patch(`/api/internal/leads/${lead._id}/qualificacao`)
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({ tenantId: String(tenant._id), scoreDelta: d }),
    );

    const results = await Promise.all(tentativas);
    for (const r of results) {
      expect(r.status).toBe(200);
    }

    const final = await lerLead(tenant._id, lead._id);
    // Pior ordem possível: 95 → 105(clamp 100) → 110(clamp 100) → 90.
    // Melhor ordem: 95 → 85 → 95 → 105(clamp 100).
    // Resultado final em [90, 100] — sempre dentro de bounds, nunca corrupto.
    expect(final.qualificacao.score).toBeGreaterThanOrEqual(90);
    expect(final.qualificacao.score).toBeLessThanOrEqual(100);
  });
});
