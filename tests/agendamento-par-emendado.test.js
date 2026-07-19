// Par emendado + Rule 3 dinâmica + ligação compraPacote (decisão 2026-07-19).
//
// Cliente com dois pacotes (ex.: rosto + corpo) pode marcar duas sessões
// SEGUIDAS (2ª a +60 min, sem arrumação entre elas — mesma sala; arrumação só
// no fim do par) e passa a poder ter até 2 marcações futuras. Cada sessão liga
// ao seu CompraPacote para o consumo ao Realizado bater no pacote certo.
process.env.INTERNAL_SERVICE_TOKEN = 'test-service-token';

import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const svc = () => ({ 'X-Service-Token': 'test-service-token' });
const WEEK_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const D = '2026-12-21'; // segunda-feira futura (Lisboa = UTC em Dezembro)

function tenantModels(tenantId) {
  return getModels(getTenantDB(String(tenantId)));
}

async function criarTenant(slug) {
  return Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'ativo', trialDias: 7 },
    configuracoes: { intervaloEntreSessoes: 0 },
  });
}

// Semana activa 09:00–18:00, pausa 12:00–13:00.
// Grelha 60: [09,10,11,13,14,15,16,17]. Grelha 120: [09:00,13:00,15:00].
async function seedWeek(tenantId) {
  const { Schedule } = tenantModels(tenantId);
  await Promise.all([0, 1, 2, 3, 4, 5, 6].map((d) => Schedule.create({
    tenantId, dayOfWeek: d, label: WEEK_LABELS[d], isActive: true,
    startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00',
  })));
}

async function seedCliente(tenantId, telefone) {
  const { Cliente } = tenantModels(tenantId);
  return Cliente.create({ tenantId, nome: 'Cliente Teste', telefone });
}

async function seedCompra(tenantId, clienteId, nome, sessoesRestantes = 5) {
  const { Pacote, CompraPacote } = tenantModels(tenantId);
  const pacote = await Pacote.create({ tenantId, nome, categoria: 'Estética', sessoes: 5, valor: 100 });
  return CompraPacote.create({
    tenantId, cliente: clienteId, pacote: pacote._id,
    sessoesContratadas: 5, sessoesUsadas: 5 - sessoesRestantes, sessoesRestantes,
    valorTotal: 100, valorPendente: 100,
  });
}

const post = (cliente, tenantId, body) => request(app)
  .post(`/api/internal/clientes/${cliente._id}/agendamentos`)
  .set(svc())
  .send({ tenantId: String(tenantId), ...body });

const lisboa = (iso) => DateTime.fromISO(iso, { zone: 'Europe/Lisbon' }).toJSDate();

describe('par emendado — POST /api/internal/clientes/:id/agendamentos', () => {
  it('par feliz: 2 sessões seguidas (13:00 + 14:00), cada uma ligada ao seu pacote', async () => {
    const tenant = await criarTenant('par-feliz');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000001');
    const rosto = await seedCompra(tenant._id, cliente._id, 'Drenagem Rosto');
    const corpo = await seedCompra(tenant._id, cliente._id, 'Drenagem Corpo');

    const res = await post(cliente, tenant._id, {
      dataHoraISO: `${D}T13:00:00`,
      servicoNome: 'Drenagem Rosto',
      compraPacoteId: String(rosto._id),
      par: { servicoNome: 'Drenagem Corpo', compraPacoteId: String(corpo._id) },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.par).toBe(true);

    const { Agendamento } = tenantModels(tenant._id);
    const docs = await Agendamento.find({ tenantId: tenant._id }).sort({ dataHora: 1 }).lean();
    expect(docs).toHaveLength(2);
    expect(docs[0].dataHora).toEqual(lisboa(`${D}T13:00:00`));
    expect(docs[1].dataHora).toEqual(lisboa(`${D}T14:00:00`)); // emendada, sem arrumação entre
    expect(String(docs[0].compraPacote)).toBe(String(rosto._id));
    expect(String(docs[1].compraPacote)).toBe(String(corpo._id));
    expect(docs.every((d) => d.servicoTipo === 'pacote' && d.criadoPorIA)).toBe(true);
  });

  it('par que atravessa a pausa (11:00–13:00) → 400 fora_disponibilidade', async () => {
    const tenant = await criarTenant('par-pausa');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000002');
    await seedCompra(tenant._id, cliente._id, 'Rosto');
    await seedCompra(tenant._id, cliente._id, 'Corpo');

    const res = await post(cliente, tenant._id, { dataHoraISO: `${D}T11:00:00`, par: {} });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('fora_disponibilidade');

    const { Agendamento } = tenantModels(tenant._id);
    expect(await Agendamento.countDocuments({ tenantId: tenant._id })).toBe(0);
  });

  it('par cuja 2ª hora colide com marcação existente → 409 slot_taken', async () => {
    const tenant = await criarTenant('par-conflito');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000003');
    await seedCompra(tenant._id, cliente._id, 'Rosto');
    await seedCompra(tenant._id, cliente._id, 'Corpo');
    const { Agendamento } = tenantModels(tenant._id);
    await Agendamento.create({ tenantId: tenant._id, dataHora: lisboa(`${D}T14:00:00`), status: 'Agendado' });

    const res = await post(cliente, tenant._id, { dataHoraISO: `${D}T13:00:00`, par: {} });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('slot_taken');
    expect(await Agendamento.countDocuments({ tenantId: tenant._id })).toBe(1); // só o pré-existente
  });

  it('par com 1 só pacote activo → 409 max_pending_reached', async () => {
    const tenant = await criarTenant('par-1pacote');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000004');
    await seedCompra(tenant._id, cliente._id, 'Rosto');

    const res = await post(cliente, tenant._id, { dataHoraISO: `${D}T13:00:00`, par: {} });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('max_pending_reached');
  });

  it('par com o MESMO pacote e só 1 sessão restante → 400 sessoes_insuficientes', async () => {
    const tenant = await criarTenant('par-1sessao');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000005');
    const rosto = await seedCompra(tenant._id, cliente._id, 'Rosto', 1);
    await seedCompra(tenant._id, cliente._id, 'Corpo'); // 2º pacote p/ passar a Rule 3

    const res = await post(cliente, tenant._id, {
      dataHoraISO: `${D}T13:00:00`,
      compraPacoteId: String(rosto._id),
      par: { compraPacoteId: String(rosto._id) },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('sessoes_insuficientes');
  });

  it('compraPacoteId de OUTRO cliente → 404 (não revela existência)', async () => {
    const tenant = await criarTenant('par-cross');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '910000006');
    const outro = await seedCliente(tenant._id, '910000007');
    await seedCompra(tenant._id, cliente._id, 'Rosto');
    const compraDoOutro = await seedCompra(tenant._id, outro._id, 'Corpo');

    const res = await post(cliente, tenant._id, {
      dataHoraISO: `${D}T13:00:00`,
      compraPacoteId: String(compraDoOutro._id),
    });
    expect(res.status).toBe(404);
  });
});

describe('Rule 3 dinâmica — limite de marcações futuras', () => {
  it('1 pacote activo: 2ª marcação → 409 (comportamento actual mantido)', async () => {
    const tenant = await criarTenant('r3-um');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '920000001');
    await seedCompra(tenant._id, cliente._id, 'Rosto');

    expect((await post(cliente, tenant._id, { dataHoraISO: `${D}T09:00:00` })).status).toBe(201);
    const segunda = await post(cliente, tenant._id, { dataHoraISO: `${D}T15:00:00` });
    expect(segunda.status).toBe(409);
    expect(segunda.body.code).toBe('max_pending_reached');
  });

  it('2 pacotes activos: 2 marcações singulares → 201+201; 3ª → 409', async () => {
    const tenant = await criarTenant('r3-dois');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '920000002');
    await seedCompra(tenant._id, cliente._id, 'Rosto');
    await seedCompra(tenant._id, cliente._id, 'Corpo');

    expect((await post(cliente, tenant._id, { dataHoraISO: `${D}T09:00:00` })).status).toBe(201);
    expect((await post(cliente, tenant._id, { dataHoraISO: `${D}T15:00:00` })).status).toBe(201);
    const terceira = await post(cliente, tenant._id, { dataHoraISO: `${D}T17:00:00` });
    expect(terceira.status).toBe(409);
    expect(terceira.body.code).toBe('max_pending_reached');
  });

  it('single com compraPacoteId liga o agendamento ao pacote (consumo ao Realizado)', async () => {
    const tenant = await criarTenant('r3-liga');
    await seedWeek(tenant._id);
    const cliente = await seedCliente(tenant._id, '920000003');
    const rosto = await seedCompra(tenant._id, cliente._id, 'Rosto');

    const res = await post(cliente, tenant._id, {
      dataHoraISO: `${D}T09:00:00`,
      compraPacoteId: String(rosto._id),
    });
    expect(res.status).toBe(201);

    const { Agendamento } = tenantModels(tenant._id);
    const doc = await Agendamento.findOne({ tenantId: tenant._id }).lean();
    expect(String(doc.compraPacote)).toBe(String(rosto._id));
    expect(doc.servicoTipo).toBe('pacote');
  });
});
