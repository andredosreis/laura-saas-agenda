// tests/followup-schedule-painel.test.js
// Wiring do painel: createAgendamento passa a duração configurada do tenant
// (configuracoes.duracaoSessaoPadrao) ao scheduleNotifications, para o job
// follow-up-pos-sessao disparar no fim REAL da sessão (+5min) e não aos 65min.
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';

const addCalls = [];
const fakeQueue = {
  add: jest.fn((name, data, opts) => {
    addCalls.push({ name, data, opts });
    return Promise.resolve({ id: opts?.jobId });
  }),
  remove: jest.fn(() => Promise.resolve()),
};

jest.unstable_mockModule('../src/queues/notificationQueue.js', () => ({
  getNotificationQueue: () => fakeQueue,
}));

const request = (await import('supertest')).default;
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const app = (await import('../src/app.js')).default;
const Tenant = (await import('../src/models/Tenant.js')).default;
const User = (await import('../src/models/User.js')).default;
const { getTenantDB } = await import('../src/config/tenantDB.js');
const { getModels } = await import('../src/models/registry.js');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(async () => {
  await clearDB();
  addCalls.length = 0;
  jest.clearAllMocks();
});

const ZONA = 'Europe/Lisbon';
// Data futura fixa (Lisboa = UTC em Dezembro → sem deriva de fuso em CI).
// Sem Schedule activo o enforcement F05 é permissivo (D4) — não precisa de seed.
const DATA_SESSAO = '2026-12-21T15:00:00';

async function criarTenantComToken(slug, configuracoes = {}) {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    configuracoes,
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: `Admin ${slug}`,
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
  return { tenant, token };
}

async function criarAgendamentoViaPainel(tenant, token) {
  const { Cliente } = getModels(getTenantDB(String(tenant._id)));
  const cliente = await Cliente.create({
    tenantId: tenant._id,
    nome: 'Maria',
    telefone: `35191${Math.floor(1000000 + Math.random() * 8999999)}`,
  });

  const res = await request(app)
    .post('/api/v1/agendamentos')
    .set({ Authorization: `Bearer ${token}` })
    .send({
      tipo: 'Sessao',
      cliente: String(cliente._id),
      dataHora: DATA_SESSAO,
      servicoTipo: 'avulso',
      servicoAvulsoNome: 'Serviço Teste',
      servicoAvulsoValor: 10,
    });
  expect(res.status).toBe(201);
}

// scheduleNotifications é fire-and-forget no controller (.catch, sem await) —
// espera activa curta até o job aparecer na fila mockada.
async function esperarJobFollowUp() {
  const inicio = Date.now();
  while (Date.now() - inicio < 3000) {
    const call = addCalls.find((c) => c.name === 'follow-up-pos-sessao');
    if (call) return call;
    await new Promise((r) => setTimeout(r, 20));
  }
  return undefined;
}

function delayEsperadoMs(duracaoMin) {
  return DateTime.fromISO(DATA_SESSAO, { zone: ZONA })
    .plus({ minutes: duracaoMin + 5 })
    .diff(DateTime.now().setZone(ZONA)).milliseconds;
}

describe('createAgendamento (painel) — duração do tenant no follow-up', () => {
  it('tenant com duracaoSessaoPadrao 90 → follow-up a +95min do início', async () => {
    const { tenant, token } = await criarTenantComToken('painel-90', { duracaoSessaoPadrao: 90 });
    await criarAgendamentoViaPainel(tenant, token);

    const call = await esperarJobFollowUp();
    expect(call).toBeDefined();
    expect(Math.abs(call.opts.delay - delayEsperadoMs(90))).toBeLessThan(5000);
  });

  it('tenant sem duracaoSessaoPadrao → default 60 (+65min)', async () => {
    const { tenant, token } = await criarTenantComToken('painel-default');
    await criarAgendamentoViaPainel(tenant, token);

    const call = await esperarJobFollowUp();
    expect(call).toBeDefined();
    expect(Math.abs(call.opts.delay - delayEsperadoMs(60))).toBeLessThan(5000);
  });
});
