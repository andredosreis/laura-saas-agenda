// F03 — AI Reads Availability from Schedule.
// Endpoint interno /api/internal/disponibilidade + migração seedScheduleFromAgentRules.
//
// Token de serviço definido ANTES de importar a app (requireServiceToken lê
// process.env.INTERNAL_SERVICE_TOKEN em cada request, mas garantimos aqui).
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import {
  seedTenant,
  RULES_SNAPSHOT,
  DATE_OVERRIDES_SNAPSHOT,
  mapDayRuleToScheduleFields,
  DEFAULT_SCHEDULE_FIELDS,
} from '../src/migrations/seedScheduleFromAgentRules.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const SERVICE_TOKEN = 'test-service-token';
const svc = (token = SERVICE_TOKEN) => ({ 'X-Service-Token': token });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const WEEK_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

async function criarTenant(slug, planoStatus = 'ativo') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: planoStatus, trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: `User ${slug}`,
    email: `user@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role: 'admin',
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, token };
}

function tenantModels(tenantId) {
  return getModels(getTenantDB(String(tenantId)));
}

// Activa os 7 dias 09:00–18:00 (pausa 12:00–13:00) para o tenant.
async function seedWeek(tenantId) {
  const { Schedule } = tenantModels(tenantId);
  await Promise.all([0, 1, 2, 3, 4, 5, 6].map((d) => Schedule.create({
    tenantId,
    dayOfWeek: d,
    label: WEEK_LABELS[d],
    isActive: true,
    startTime: '09:00',
    endTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
  })));
}

async function seedException(tenantId, { data, tipo, inicio = null, fim = null }) {
  const { ScheduleException } = tenantModels(tenantId);
  await ScheduleException.create({ tenantId, data, tipo, inicio, fim });
}

async function seedBooking(tenantId, isoLocal) {
  const { Agendamento } = tenantModels(tenantId);
  await Agendamento.create({
    tenantId,
    dataHora: DateTime.fromISO(isoLocal, { zone: 'Europe/Lisbon' }).toJSDate(),
    status: 'Agendado',
  });
}

// ══════════════════════════════════════════════════════════════════════
describe('F03 — GET /api/internal/disponibilidade', () => {
  // C1 — paridade com getAvailableSlots
  it('C1 — devolve os mesmos slots que /schedules/available-slots (paridade)', async () => {
    const { tenant, token } = await criarTenant('f03-c1');
    await seedWeek(tenant._id);
    await seedBooking(tenant._id, '2026-07-15T10:00'); // ocupa 10:00

    const date = '2026-07-15';
    const legacy = await request(app)
      .get(`/api/v1/schedules/available-slots?date=${date}&duration=60`)
      .set(auth(token));
    const internal = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=${date}&duration=60`)
      .set(svc());

    expect(legacy.status).toBe(200);
    expect(internal.status).toBe(200);
    expect(internal.body.success).toBe(true);
    // Envelopes diferentes: comparar só os arrays de slots.
    expect(internal.body.data.days[0].slots).toEqual(legacy.body.availableSlots);
    // Booking às 10:00 removeu esse slot.
    expect(internal.body.data.days[0].slots).not.toContain('10:00');
    expect(internal.body.data.days[0].slots).toContain('09:00');
  });

  // C2 — guarda por token de serviço
  describe('C2 — guarda X-Service-Token (401)', () => {
    it('sem header → 401', async () => {
      const { tenant } = await criarTenant('f03-c2a');
      const res = await request(app).get(`/api/internal/disponibilidade?tenantId=${tenant._id}`);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ success: false, error: 'Não autenticado' });
    });

    it('token errado → 401', async () => {
      const { tenant } = await criarTenant('f03-c2b');
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${tenant._id}`)
        .set(svc('token-errado'));
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // C3 — excepções fluem (precedência F02)
  it('C3 — excepção "fechado" → slots:[] (isException:true, exceptionType:fechado)', async () => {
    const { tenant } = await criarTenant('f03-c3a');
    await seedWeek(tenant._id);
    await seedException(tenant._id, { data: '2026-07-15', tipo: 'fechado' });

    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=2026-07-15`)
      .set(svc());

    expect(res.status).toBe(200);
    expect(res.body.data.days[0]).toMatchObject({
      slots: [], isException: true, exceptionType: 'fechado',
    });
  });

  it('C3b — excepção "horas-extra" → slots dentro da janela da excepção', async () => {
    const { tenant } = await criarTenant('f03-c3b');
    await seedWeek(tenant._id);
    await seedException(tenant._id, { data: '2026-07-15', tipo: 'horas-extra', inicio: '14:00', fim: '18:00' });

    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=2026-07-15`)
      .set(svc());

    const day = res.body.data.days[0];
    expect(day.isException).toBe(true);
    expect(day.slots.length).toBeGreaterThan(0);
    expect(day.slots.every((s) => s >= '14:00' && s < '18:00')).toBe(true);
    expect(day.slots).not.toContain('09:00');
  });

  // C4 — empty-but-flagged
  it('C4 — tenant sem Schedule → scheduleConfigured:false, days:[] (200)', async () => {
    const { tenant } = await criarTenant('f03-c4');
    const res = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=2026-07-15`)
      .set(svc());

    expect(res.status).toBe(200);
    expect(res.body.data.scheduleConfigured).toBe(false);
    expect(res.body.data.days).toEqual([]);
  });

  // C5 — isolamento multi-tenant
  it('C5 — isolamento: fechado de A não fecha o mesmo dia de B; bookings de A não ocupam B', async () => {
    const { tenant: a } = await criarTenant('f03-c5a');
    const { tenant: b } = await criarTenant('f03-c5b');
    await seedWeek(a._id);
    await seedWeek(b._id);
    await seedException(a._id, { data: '2026-07-15', tipo: 'fechado' });
    await seedBooking(a._id, '2026-07-15T09:00'); // ocupa 09:00 SÓ no tenant A

    const resA = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${a._id}&date=2026-07-15`)
      .set(svc());
    const resB = await request(app)
      .get(`/api/internal/disponibilidade?tenantId=${b._id}&date=2026-07-15`)
      .set(svc());

    expect(resA.body.data.days[0].slots).toEqual([]); // A fechado
    expect(resB.body.data.days[0].slots.length).toBeGreaterThan(0); // B aberto
    expect(resB.body.data.days[0].slots).toContain('09:00'); // booking de A não afecta B
  });

  // C9 — resolução de parâmetros
  describe('C9 — resolução de parâmetros', () => {
    it('date → um único dia', async () => {
      const { tenant } = await criarTenant('f03-c9a');
      await seedWeek(tenant._id);
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=2026-07-15`)
        .set(svc());
      expect(res.body.data.days).toHaveLength(1);
      expect(res.body.data.days[0].date).toBe('2026-07-15');
    });

    it('from/to → intervalo inclusivo', async () => {
      const { tenant } = await criarTenant('f03-c9b');
      await seedWeek(tenant._id);
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&from=2026-07-15&to=2026-07-17`)
        .set(svc());
      expect(res.body.data.days.map((d) => d.date)).toEqual(['2026-07-15', '2026-07-16', '2026-07-17']);
    });

    it('sem date/from/to → janela today..today+days (default 7 → 8 dias)', async () => {
      const { tenant } = await criarTenant('f03-c9c');
      await seedWeek(tenant._id);
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${tenant._id}`)
        .set(svc());
      expect(res.body.data.days).toHaveLength(8);
      const hoje = DateTime.now().setZone('Europe/Lisbon').toISODate();
      expect(res.body.data.days[0].date).toBe(hoje);
    });

    it('date formato inválido → 400', async () => {
      const { tenant } = await criarTenant('f03-c9d');
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=15-07-2026`)
        .set(svc());
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('tenantId inválido → 400', async () => {
      const res = await request(app)
        .get('/api/internal/disponibilidade?tenantId=nao-e-objectid')
        .set(svc());
      expect(res.status).toBe(400);
    });

    it('tenant inexistente → 404', async () => {
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${new mongoose.Types.ObjectId()}`)
        .set(svc());
      expect(res.status).toBe(404);
    });

    it('plano inactivo → 403', async () => {
      const { tenant } = await criarTenant('f03-c9g', 'suspenso');
      const res = await request(app)
        .get(`/api/internal/disponibilidade?tenantId=${tenant._id}&date=2026-07-15`)
        .set(svc());
      expect(res.status).toBe(403);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
describe('F03 — migração seedScheduleFromAgentRules', () => {
  const PILOT = Object.keys(RULES_SNAPSHOT)[0];
  const rules = RULES_SNAPSHOT[PILOT];
  const overrides = DATE_OVERRIDES_SNAPSHOT[PILOT];

  // Usa um tenantId novo por teste para uma DB de tenant limpa.
  function freshTenantId() {
    return new mongoose.Types.ObjectId().toString();
  }

  it('C8 — dry-run não escreve nada e marca cada dia "would write"', async () => {
    const tenantId = freshTenantId();
    const { Schedule, ScheduleException } = tenantModels(tenantId);

    const report = await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: false });

    expect(report.days).toHaveLength(7);
    expect(report.days.every((d) => d.action === 'would write')).toBe(true);
    expect(report.exceptions.every((e) => e.action === 'would write')).toBe(true);
    expect(await Schedule.countDocuments({ tenantId })).toBe(0);
    expect(await ScheduleException.countDocuments({ tenantId })).toBe(0);
  });

  it('C8 — --apply semeia Schedule (mapeamento correcto) + exceptions', async () => {
    const tenantId = freshTenantId();
    const { Schedule, ScheduleException } = tenantModels(tenantId);

    await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true });

    expect(await Schedule.countDocuments({ tenantId })).toBe(7);
    // Segunda (dow 1): 09:00–19:00, pausa 12:00–13:00.
    const seg = await Schedule.findOne({ tenantId, dayOfWeek: 1 }).lean();
    expect(seg).toMatchObject({ isActive: true, startTime: '09:00', endTime: '19:00', breakStartTime: '12:00', breakEndTime: '13:00' });
    // Sábado (dow 6): 09:00–13:00, SEM pausa (null).
    const sab = await Schedule.findOne({ tenantId, dayOfWeek: 6 }).lean();
    expect(sab).toMatchObject({ isActive: true, startTime: '09:00', endTime: '13:00', breakStartTime: null, breakEndTime: null });
    // Domingo (dow 0): fechado.
    const dom = await Schedule.findOne({ tenantId, dayOfWeek: 0 }).lean();
    expect(dom.isActive).toBe(false);
    // Exceptions: datas None → fechado.
    expect(await ScheduleException.countDocuments({ tenantId })).toBe(Object.keys(overrides).length);
    const natal = await ScheduleException.findOne({ tenantId, data: '2026-12-25' }).lean();
    expect(natal).toMatchObject({ tipo: 'fechado', inicio: null, fim: null });
  });

  it('C8 — re-correr --apply é no-op (idempotente)', async () => {
    const tenantId = freshTenantId();
    const { Schedule, ScheduleException } = tenantModels(tenantId);

    await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true });
    const report2 = await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true });

    expect(report2.days.every((d) => d.action === 'unchanged (idempotente)')).toBe(true);
    expect(report2.exceptions.every((e) => e.action === 'unchanged (idempotente)')).toBe(true);
    expect(await Schedule.countDocuments({ tenantId })).toBe(7);
    expect(await ScheduleException.countDocuments({ tenantId })).toBe(Object.keys(overrides).length);
  });

  it('C8 — preserva dia customizado; --force sobrepõe', async () => {
    const tenantId = freshTenantId();
    const { Schedule, ScheduleException } = tenantModels(tenantId);
    // Dono personalizou Segunda (difere do default E do snapshot).
    await Schedule.create({ tenantId, dayOfWeek: 1, label: 'Segunda-feira', isActive: true, startTime: '08:00', endTime: '20:00', breakStartTime: null, breakEndTime: null });

    const report = await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true });
    const segAction = report.days.find((d) => d.dayOfWeek === 1).action;
    expect(segAction).toBe('preserved (customizado)');
    const segPreserved = await Schedule.findOne({ tenantId, dayOfWeek: 1 }).lean();
    expect(segPreserved.endTime).toBe('20:00'); // não sobrescrito

    // --force sobrepõe.
    const reportF = await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true, force: true });
    expect(reportF.days.find((d) => d.dayOfWeek === 1).action).toBe('written (forced)');
    const segForced = await Schedule.findOne({ tenantId, dayOfWeek: 1 }).lean();
    expect(segForced.endTime).toBe('19:00'); // snapshot
  });

  it('C8 — após seed, o endpoint reproduz a disponibilidade (paridade helper)', async () => {
    const tenantId = freshTenantId();
    const { Schedule, ScheduleException } = tenantModels(tenantId);
    await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true });

    // Não há tenant/token real para este id sintético — validamos via helper de
    // mapeamento: os campos semeados = mapeamento directo da snapshot.
    const seg = await Schedule.findOne({ tenantId, dayOfWeek: 1 }).lean();
    expect(seg).toMatchObject(mapDayRuleToScheduleFields(rules.monday));
    const dom = await Schedule.findOne({ tenantId, dayOfWeek: 0 }).lean();
    expect(dom).toMatchObject(DEFAULT_SCHEDULE_FIELDS); // domingo fechado = default
  });

  it('C8 — --rollback remove exceptions semeadas e repõe dias no default', async () => {
    const tenantId = freshTenantId();
    const { Schedule, ScheduleException } = tenantModels(tenantId);
    await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true });

    await seedTenant({ Schedule, ScheduleException, tenantId, rules, overrides, apply: true, rollback: true });

    expect(await ScheduleException.countDocuments({ tenantId })).toBe(0);
    // Segunda reposta ao default (inactivo).
    const seg = await Schedule.findOne({ tenantId, dayOfWeek: 1 }).lean();
    expect(seg).toMatchObject(DEFAULT_SCHEDULE_FIELDS);
  });
});
