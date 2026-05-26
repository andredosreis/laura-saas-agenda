/**
 * E2E matrix tests for the F12 webhook routing coordinator.
 *
 * One test per row of PRD §1.1 Routing Matrix (rows 2, 3, 4, 5; rows 1
 * and 6 are outbound-only and documented as N/A) plus 5 additional
 * scenarios covering data-integrity guards and degraded paths.
 *
 * Each test:
 *   - Posts a representative Evolution webhook payload via supertest
 *   - Asserts HTTP 200 ack
 *   - Asserts the correct handler was invoked (via mock spy)
 *   - Asserts side-effect state (Agendamento mutated, Mensagem persisted, etc.)
 *
 * Mocks: `evolutionClient.sendWhatsAppMessage` and `iaServiceClient.processLead`
 * are mocked so tests run without external services.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §7.3
 */

import { jest } from '@jest/globals';

// Mocks MUST be declared before importing app
jest.unstable_mockModule('../src/utils/evolutionClient.js', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));
jest.unstable_mockModule('../src/utils/iaServiceClient.js', () => ({
  processLead: jest.fn().mockResolvedValue({ success: true, source: 'agent' }),
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../src/app.js');
const { clearDB, setupTestDB, teardownTestDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');
const evolutionClientMock = await import('../src/utils/evolutionClient.js');
const iaServiceClientMock = await import('../src/utils/iaServiceClient.js');
const { NO_PENDING_APPOINTMENT_COPY } = await import(
  '../src/modules/messaging/handlers/noPendingAppointmentReply.js'
);

const WEBHOOK_URL = '/webhook/evolution';
const VALID_API_KEY = 'test-secret-key';

// Wait briefly for the fire-and-forget async pipeline to flush its side
// effects. The HTTP ACK returns immediately; mocks/DB writes happen after.
const flushAsync = (ms = 800) => new Promise((r) => setTimeout(r, ms));

function buildPayload({ messageId, phone, text, instance = 'marcai' }) {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { id: messageId, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: text },
    },
  };
}

async function createTenant({ slug = 'marcai-test', planoStatus = 'ativo', leadsAtivo = true } = {}) {
  return Tenant.create({
    nome: 'Marcai Test',
    slug,
    plano: { tipo: 'pro', status: planoStatus, trialDias: 7 },
    limites: { maxLeads: 100, leadsAtivo },
    whatsapp: { instanceName: 'marcai' },
  });
}

describe('F12 — Webhook Routing Matrix (E2E)', () => {
  beforeAll(async () => {
    process.env.EVOLUTION_WEBHOOK_SECRET = VALID_API_KEY;
    process.env.IA_SERVICE_URL = 'http://ia-service-test.local';
    process.env.IA_SERVICE_ENABLED = 'true';
    await setupTestDB();
  });

  afterAll(teardownTestDB);

  beforeEach(async () => {
    await clearDB();
    evolutionClientMock.sendWhatsAppMessage.mockClear();
    iaServiceClientMock.processLead.mockClear();
    iaServiceClientMock.processLead.mockResolvedValue({ success: true, source: 'agent' });
  });

  // ── PRD §1.1 row 2: SIM/NÃO + pending appointment ─────────────────

  test('row 2: SIM with pending appointment → LEGACY_CONFIRMATION + Agendamento.Confirmado', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Cliente, Agendamento } = getModels(getTenantDB(tenantId));

    const cliente = await Cliente.create({ tenantId, nome: 'Maria', telefone: '351912345678' });
    const agendamento = await Agendamento.create({
      tenantId,
      tipo: 'Sessao',
      cliente: cliente._id,
      dataHora: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'Agendado',
      confirmacao: { tipo: 'pendente' },
    });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-row2-sim', phone: '351912345678', text: 'sim' }));

    expect(res.status).toBe(200);
    await flushAsync();

    const updated = await Agendamento.findById(agendamento._id);
    expect(updated.status).toBe('Confirmado');
    expect(updated.confirmacao.tipo).toBe('confirmado');
    expect(evolutionClientMock.sendWhatsAppMessage).toHaveBeenCalled();
    expect(iaServiceClientMock.processLead).not.toHaveBeenCalled();
  });

  // ── PRD §1.1 row 3: phone with no Lead AND no Client → IA_LEAD ──

  test('row 3: unknown phone → IA_LEAD + iaServiceClient.processLead called with leadId=null', async () => {
    await createTenant();

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-row3-new', phone: '351999000111', text: 'olá quero saber preços' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(iaServiceClientMock.processLead).toHaveBeenCalledTimes(1);
    const call = iaServiceClientMock.processLead.mock.calls[0][0];
    expect(call.leadId).toBeNull();
    expect(call.clienteId).toBeNull();
    expect(call.telefone).toBe('351999000111');
  });

  // ── PRD §1.1 rows 4-5: existing Client → CLIENT_LIFECYCLE_PENDING ──

  test('row 4: existing Client → CLIENT_LIFECYCLE_PENDING (v1 stub) + greeting + etapaConversa set', async () => {
    const tenant = await createTenant();
    const tenantId = tenant._id.toString();
    const { Cliente } = getModels(getTenantDB(tenantId));
    await Cliente.create({ tenantId, nome: 'João', telefone: '351911222333' });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-row4-client', phone: '351911222333', text: 'olá quero marcar' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(iaServiceClientMock.processLead).not.toHaveBeenCalled();
    expect(evolutionClientMock.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const greeting = evolutionClientMock.sendWhatsAppMessage.mock.calls[0][1];
    expect(greeting).toMatch(/Bom dia|Boa tarde|Boa noite/);

    const reloaded = await Cliente.findOne({ tenantId, telefone: '351911222333' });
    expect(reloaded.etapaConversa).toBe('aguardando_laura');
  });

  test('row 5: existing Client reschedule/cancel intent → same stub (matches row 4 in v1)', async () => {
    const tenant = await createTenant({ slug: 'row5' });
    const tenantId = tenant._id.toString();
    const { Cliente } = getModels(getTenantDB(tenantId));
    await Cliente.create({ tenantId, nome: 'Ana', telefone: '351933444555' });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-row5-cancel', phone: '351933444555', text: 'quero remarcar' }));

    expect(res.status).toBe(200);
    await flushAsync();

    // v1 does not distinguish booking-vs-reschedule for Clients — both route
    // to CLIENT_LIFECYCLE_PENDING → LEGACY_FALLBACK greeting.
    expect(iaServiceClientMock.processLead).not.toHaveBeenCalled();
    expect(evolutionClientMock.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  // ── PRD §1.1 row 1 (reminder) and row 6 (birthday) ────────────────
  //   N/A — outbound only, never enter the webhook. Documented here.

  test('rows 1 & 6: reminder and birthday are outbound only (documented N/A)', () => {
    // Reminders are dispatched by scheduleNotifications (BullMQ/cron) and
    // birthday by a future Phase 5 scheduler. Neither enters POST
    // /webhook/evolution. The matrix declares them for completeness.
    expect(true).toBe(true);
  });

  // ── Additional E2E from spec §7.3 ──────────────────────────────────

  test('Lead.iaActive=false → MANUAL_SILENT + Mensagem persisted + no Evolution send', async () => {
    const tenant = await createTenant({ slug: 'paused' });
    const tenantId = tenant._id.toString();
    const { Lead, Mensagem } = getModels(getTenantDB(tenantId));
    await Lead.create({
      tenantId,
      telefone: '351922333444',
      nome: 'Sofia',
      status: 'em_conversa',
      iaAtiva: false,
    });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-paused', phone: '351922333444', text: 'olá, alguma novidade?' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(iaServiceClientMock.processLead).not.toHaveBeenCalled();
    expect(evolutionClientMock.sendWhatsAppMessage).not.toHaveBeenCalled();

    const persisted = await Mensagem.findOne({ tenantId, telefone: '351922333444' });
    expect(persisted).not.toBeNull();
    expect(persisted.origem).toBe('cliente');
    expect(persisted.direcao).toBe('entrada');
  });

  test('Plan cancelled → IGNORE silently (no handler invoked, no outbound)', async () => {
    await createTenant({ slug: 'cancelled', planoStatus: 'cancelado' });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-cancelled', phone: '351900000001', text: 'olá' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(iaServiceClientMock.processLead).not.toHaveBeenCalled();
    expect(evolutionClientMock.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  test('ia-service unreachable → IA_LEAD chosen, handler degrades to greeting', async () => {
    await createTenant({ slug: 'ia-down' });
    iaServiceClientMock.processLead.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-ia-down', phone: '351988777666', text: 'olá quero info' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(iaServiceClientMock.processLead).toHaveBeenCalledTimes(1);
    // Handler caught the error and dispatched legacyFallback → greeting sent
    expect(evolutionClientMock.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  test('SIM without pending appointment + new phone → IA_LEAD (agent handles it)', async () => {
    // Regression — 2026-05-20: a confirmation-shaped message ("sim", "ok",
    // "perfeito"…) from a brand-new phone is no longer hijacked by the
    // legacy NO_PENDING_APPOINTMENT_REPLY handler. The agent owns the
    // turn so it can respond naturally (treat "sim" as a fragment of an
    // organic conversation start). See messageRouter.js step 3.
    await createTenant({ slug: 'no-pending' });

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-no-pending', phone: '351944555666', text: 'sim' }));

    expect(res.status).toBe(200);
    await flushAsync();

    expect(iaServiceClientMock.processLead).toHaveBeenCalledTimes(1);
  });

  test('Lead convertido but cliente=null → LEGACY_FALLBACK + warn (data integrity guard)', async () => {
    const tenant = await createTenant({ slug: 'data-bug' });
    const tenantId = tenant._id.toString();
    const { Lead } = getModels(getTenantDB(tenantId));

    // Synthesise the data-integrity bug F04 protects against: convertido
    // without cliente ref AND no Cliente record with this phone.
    await Lead.create({
      tenantId,
      telefone: '351977888999',
      nome: 'Inês',
      status: 'em_conversa', // create as em_conversa to bypass model validation
      iaAtiva: true,
    });
    // Force the inconsistent state directly to bypass schema validators
    await Lead.collection.updateOne(
      { tenantId: tenant._id, telefone: '351977888999' },
      { $set: { status: 'convertido', cliente: null } },
    );

    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('apikey', VALID_API_KEY)
      .send(buildPayload({ messageId: 'msg-data-bug', phone: '351977888999', text: 'olá' }));

    expect(res.status).toBe(200);
    await flushAsync();

    // Data-integrity branch routes to LEGACY_FALLBACK greeting, NOT IA_LEAD
    expect(iaServiceClientMock.processLead).not.toHaveBeenCalled();
    expect(evolutionClientMock.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const greeting = evolutionClientMock.sendWhatsAppMessage.mock.calls[0][1];
    expect(greeting).toMatch(/Bom dia|Boa tarde|Boa noite/);
  });
});
