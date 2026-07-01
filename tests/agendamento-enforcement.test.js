// F05 — Backend Availability Enforcement (ADR-028 Fase 4).
// O booking passa a respeitar a disponibilidade resolvida (resolveAvailableSlots,
// F03) em TODOS os caminhos de escrita vivos: createAgendamento (painel) e as
// rotas internas da IA (leads/clientes). Override `forcarEncaixe` é admin-only
// e fica registado no sub-doc `encaixe`.
//
// Token de serviço definido ANTES de importar a app (rotas internas C10).
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const SERVICE_TOKEN = 'test-service-token';
const svc = () => ({ 'X-Service-Token': SERVICE_TOKEN });
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const WEEK_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// Datas futuras fixas (Lisboa = UTC em Dezembro → sem deriva de fuso em CI).
const D_NORMAL = '2026-12-21';   // dia base activo 09:00–18:00, pausa 12:00–13:00
const D_FECHADO = '2026-12-25';  // excepção fechado (Natal)
const D_EXTRA = '2026-12-26';    // excepção horas-extra 19:00–22:00

async function criarTenant(slug, role = 'admin') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: `User ${slug}`,
    email: `user@${slug}.pt`,
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

// Token adicional (outro role) para o MESMO tenant.
async function tokenParaRole(tenant, role, slug) {
  const user = await User.create({
    tenantId: tenant._id,
    nome: `${role} ${slug}`,
    email: `${role}@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role,
    emailVerificado: true,
  });
  return jwt.sign(
    { userId: user._id, tenantId: tenant._id, role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function tenantModels(tenantId) {
  return getModels(getTenantDB(String(tenantId)));
}

// Semana toda activa 09:00–18:00 (pausa 12:00–13:00) → slots por dia:
// [09,10,11,13,14,15,16,17] (12:00 cai na pausa; 17:00 é o último que cabe).
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

async function seedCliente(tenantId, telefone) {
  const { Cliente } = tenantModels(tenantId);
  return Cliente.create({ tenantId, nome: 'Cliente Teste', telefone });
}

async function seedLead(tenantId, telefone) {
  const { Lead } = tenantModels(tenantId);
  return Lead.create({ tenantId, nome: 'Lead Teste', telefone });
}

async function seedBooking(tenantId, isoLocal) {
  const { Agendamento } = tenantModels(tenantId);
  await Agendamento.create({
    tenantId,
    dataHora: DateTime.fromISO(isoLocal, { zone: 'Europe/Lisbon' }).toJSDate(),
    status: 'Agendado',
  });
}

async function countAgendamentos(tenantId) {
  const { Agendamento } = tenantModels(tenantId);
  return Agendamento.countDocuments({ tenantId });
}

// Payload mínimo de criação (avulso → sem lookups de pacote).
const payload = (cliente, dataHora, extra = {}) => ({
  tipo: 'Sessao',
  cliente: String(cliente._id),
  dataHora,
  servicoTipo: 'avulso',
  servicoAvulsoNome: 'Serviço Teste',
  servicoAvulsoValor: 10,
  ...extra,
});

// ══════════════════════════════════════════════════════════════════════
describe('F05 — enforcement no createAgendamento (painel)', () => {
  it('C1 — fora de horas sem override → 400 e nenhum Agendamento criado', async () => {
    const { tenant, token } = await criarTenant('f05-c1');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000001');

    const res = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_NORMAL}T20:30:00`));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Horário fora da disponibilidade configurada.');
    expect(await countAgendamentos(tenant._id)).toBe(0);
  });

  it('C2 — dentro de horas → 201 com encaixe.forcado false', async () => {
    const { tenant, token } = await criarTenant('f05-c2');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000002');

    const res = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_NORMAL}T15:00:00`));

    expect(res.status).toBe(201);
    expect(res.body.encaixe.forcado).toBe(false);
    expect(await countAgendamentos(tenant._id)).toBe(1);
  });

  it('C3 — data com excepção fechado → 400 mesmo em dia base activo', async () => {
    const { tenant, token } = await criarTenant('f05-c3');
    await seedWeek(tenant._id);
    await seedException(tenant._id, { data: D_FECHADO, tipo: 'fechado' });
    const cliente = await seedCliente(tenant._id, '910000003');

    const res = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_FECHADO}T15:00:00`));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('O salão está fechado nesta data.');
    expect(await countAgendamentos(tenant._id)).toBe(0);
  });

  it('C4 — override de admin → 201 com encaixe registado (server-derived)', async () => {
    const { tenant, user, token } = await criarTenant('f05-c4'); // admin
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000004');

    const res = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_NORMAL}T20:30:00`, {
        forcarEncaixe: true,
        motivoEncaixe: 'encaixe pedido pela cliente, fora de horas',
      }));

    expect(res.status).toBe(201);
    expect(res.body.encaixe.forcado).toBe(true);
    expect(res.body.encaixe.motivo).toBe('encaixe pedido pela cliente, fora de horas');
    expect(String(res.body.encaixe.autorizadoPor)).toBe(String(user._id)); // do JWT
    expect(res.body.encaixe.autorizadoEm).toBeTruthy();
  });

  it('C5 — override por gerente e recepcionista → 403, nada criado', async () => {
    const { tenant } = await criarTenant('f05-c5'); // admin (não usado p/ criar)
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000005');

    for (const role of ['gerente', 'recepcionista']) {
      const token = await tokenParaRole(tenant, role, `f05-c5-${role}`);
      const res = await request(app)
        .post('/api/v1/agendamentos')
        .set(auth(token))
        .send(payload(cliente, `${D_NORMAL}T20:30:00`, { forcarEncaixe: true }));

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Apenas um admin pode forçar um encaixe fora de horas.');
    }
    expect(await countAgendamentos(tenant._id)).toBe(0);
  });

  it('C6 — paridade com a fonte única: pausa rejeita; horas-extra abre janela sem override', async () => {
    const { tenant, token } = await criarTenant('f05-c6');
    await seedWeek(tenant._id);
    await seedException(tenant._id, { data: D_EXTRA, tipo: 'horas-extra', inicio: '19:00', fim: '22:00' });
    const cliente = await seedCliente(tenant._id, '910000006');

    // Pausa (12:00 dentro de 12:00–13:00) → rejeitado como o picker esconde.
    const pausa = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_NORMAL}T12:00:00`));
    expect(pausa.status).toBe(400);

    // Janela horas-extra (20:00 ∈ 19:00–22:00) → aceite SEM override,
    // apesar de o dia base terminar às 18:00.
    const extra = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_EXTRA}T20:00:00`));
    expect(extra.status).toBe(201);
    expect(extra.body.encaixe.forcado).toBe(false);
  });

  it('C7 — override NÃO ultrapassa conflito de slot (mesma dataHora exacta → 400)', async () => {
    const { tenant, token } = await criarTenant('f05-c7'); // admin
    await seedWeek(tenant._id);
    await seedBooking(tenant._id, `${D_NORMAL}T15:00:00`);
    const cliente = await seedCliente(tenant._id, '910000007');

    const res = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_NORMAL}T15:00:00`, { forcarEncaixe: true }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Já existe um agendamento para este horário.');
    expect(await countAgendamentos(tenant._id)).toBe(1); // só o seed
  });

  it('C8 — tenant sem Schedule configurado → permissivo (201)', async () => {
    const { tenant, token } = await criarTenant('f05-c8');
    // NÃO semear Schedule (e não chamar GET /schedules, que inicializa).
    const cliente = await seedCliente(tenant._id, '910000008');

    const res = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(token))
      .send(payload(cliente, `${D_NORMAL}T20:30:00`)); // "fora de horas" — mas não há horas

    expect(res.status).toBe(201);
  });

  it('C9 — isolamento multi-tenant: fechado de A não afecta B', async () => {
    const a = await criarTenant('f05-c9a');
    const b = await criarTenant('f05-c9b');
    await seedWeek(a.tenant._id);
    await seedWeek(b.tenant._id);
    await seedException(a.tenant._id, { data: D_NORMAL, tipo: 'fechado' });
    const clienteA = await seedCliente(a.tenant._id, '910000009');
    const clienteB = await seedCliente(b.tenant._id, '910000010');

    const resA = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(a.token))
      .send(payload(clienteA, `${D_NORMAL}T15:00:00`));
    const resB = await request(app)
      .post('/api/v1/agendamentos')
      .set(auth(b.token))
      .send(payload(clienteB, `${D_NORMAL}T15:00:00`));

    expect(resA.status).toBe(400); // A fechado
    expect(resB.status).toBe(201); // B aberto — a excepção de A não vaza
  });
});

// ══════════════════════════════════════════════════════════════════════
describe('F05 — C10: rotas internas da IA são enforced (sem override)', () => {
  it('lead: fora de horas → 400; fechado → 400; forcarEncaixe ignorado; em horas → 201', async () => {
    const { tenant } = await criarTenant('f05-c10-lead');
    await seedWeek(tenant._id);
    await seedException(tenant._id, { data: D_FECHADO, tipo: 'fechado' });
    const lead = await seedLead(tenant._id, '920000001');
    const base = `/api/internal/leads/${lead._id}/agendamento`;

    // Fora de horas — e com forcarEncaixe:true no body, que TEM de ser ignorado.
    const fora = await request(app)
      .post(base)
      .set(svc())
      .send({ tenantId: String(tenant._id), dataHoraISO: `${D_NORMAL}T20:00:00`, forcarEncaixe: true });
    expect(fora.status).toBe(400);
    expect(fora.body.code).toBe('fora_disponibilidade');

    // Data fechada.
    const fechado = await request(app)
      .post(base)
      .set(svc())
      .send({ tenantId: String(tenant._id), dataHoraISO: `${D_FECHADO}T15:00:00` });
    expect(fechado.status).toBe(400);
    expect(fechado.body.error).toBe('O salão está fechado nesta data.');

    expect(await countAgendamentos(tenant._id)).toBe(0);

    // Slot real → cria.
    const ok = await request(app)
      .post(base)
      .set(svc())
      .send({ tenantId: String(tenant._id), dataHoraISO: `${D_NORMAL}T15:00:00` });
    expect(ok.status).toBe(201);
    expect(ok.body.success).toBe(true);
  });

  it('cliente: fora de horas → 400; em horas → 201', async () => {
    const { tenant } = await criarTenant('f05-c10-cli');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '920000002');
    const base = `/api/internal/clientes/${cliente._id}/agendamentos`;

    const fora = await request(app)
      .post(base)
      .set(svc())
      .send({ tenantId: String(tenant._id), dataHoraISO: `${D_NORMAL}T20:00:00` });
    expect(fora.status).toBe(400);
    expect(fora.body.code).toBe('fora_disponibilidade');
    expect(await countAgendamentos(tenant._id)).toBe(0);

    const ok = await request(app)
      .post(base)
      .set(svc())
      .send({ tenantId: String(tenant._id), dataHoraISO: `${D_NORMAL}T15:00:00` });
    expect(ok.status).toBe(201);
    expect(await countAgendamentos(tenant._id)).toBe(1);
  });

  it('cliente: tenant sem Schedule → permissivo (201)', async () => {
    const { tenant } = await criarTenant('f05-c10-perm');
    const cliente = await seedCliente(tenant._id, '920000003');

    const res = await request(app)
      .post(`/api/internal/clientes/${cliente._id}/agendamentos`)
      .set(svc())
      .send({ tenantId: String(tenant._id), dataHoraISO: `${D_NORMAL}T20:00:00` });

    expect(res.status).toBe(201);
  });
});
