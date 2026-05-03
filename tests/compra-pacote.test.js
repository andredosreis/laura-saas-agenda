import request from 'supertest';
import { DateTime } from 'luxon';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug) {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin Teste',
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

  // Acesso directo aos models do tenant para criar fixtures (Cliente, Pacote)
  // sem ir pela API — mais rápido e o teste foca-se em venderPacote.
  const models = getModels(getTenantDB(tenant._id));

  const cliente = await models.Cliente.create({
    tenantId: tenant._id,
    nome: `Cliente ${slug}`,
    telefone: '912345678',
  });

  const pacote = await models.Pacote.create({
    tenantId: tenant._id,
    nome: `Pacote ${slug}`,
    categoria: 'Estética',
    sessoes: 10,
    valor: 500,
  });

  return { tenant, user, token, models, cliente, pacote };
}

// ──────────────────────────────────────────────
// Autenticação
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — autenticação', () => {
  it('retorna 401 sem token', async () => {
    const res = await request(app)
      .post('/api/compras-pacotes')
      .send({ clienteId: '000000000000000000000000', pacoteId: '000000000000000000000000' });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────
// Venda hoje (sem dataCompra) — fluxo padrão
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — venda hoje', () => {
  it('cria CompraPacote, Transacao e Pagamento sem origemRetroactiva quando dataCompra omissa', async () => {
    const { token, cliente, pacote, models } = await criarTenantEToken('venda-hoje');

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: cliente._id.toString(),
        pacoteId: pacote._id.toString(),
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(201);
    expect(res.body.compraPacote.origemRetroactiva).toBeUndefined();
    expect(res.body.transacao.origemRetroactiva).toBeUndefined();

    const pagamentos = await models.Pagamento.find({});
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0].origemRetroactiva?.motivo).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Venda retroactiva — sem motivo
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — venda retroactiva sem motivo', () => {
  it('rejeita 400 quando dataCompra < hoje-1d e motivoRetroactivo está em falta', async () => {
    const { token, cliente, pacote, models } = await criarTenantEToken('retro-no-motivo');
    const dataAntiga = DateTime.now().setZone('Europe/Lisbon').minus({ days: 30 }).toISO();

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: cliente._id.toString(),
        pacoteId: pacote._id.toString(),
        dataCompra: dataAntiga,
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/motivoRetroactivo/i);

    // Garantir que nada foi persistido
    const compras = await models.CompraPacote.find({});
    expect(compras).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// Venda retroactiva — com motivo (caminho feliz da feature)
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — venda retroactiva com motivo', () => {
  it('cria 3 documentos com dataCompra propagada e origemRetroactiva preenchida', async () => {
    const { token, user, cliente, pacote, models } = await criarTenantEToken('retro-ok');
    const dataAntiga = DateTime.now().setZone('Europe/Lisbon').minus({ days: 60 }).startOf('day').toISO();

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: cliente._id.toString(),
        pacoteId: pacote._id.toString(),
        dataCompra: dataAntiga,
        motivoRetroactivo: 'Cliente cadastrado tarde',
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(201);

    // CompraPacote: dataCompra e origemRetroactiva propagadas
    const { compraPacote, transacao } = res.body;
    expect(new Date(compraPacote.dataCompra).toISOString()).toBe(new Date(dataAntiga).toISOString());
    expect(compraPacote.origemRetroactiva.motivo).toBe('Cliente cadastrado tarde');
    expect(String(compraPacote.origemRetroactiva.registadoPor)).toBe(String(user._id));
    expect(compraPacote.origemRetroactiva.registadoEm).toBeDefined();

    // Transacao: dataPagamento = dataCompra (porque foi pago integralmente)
    expect(new Date(transacao.dataPagamento).toISOString()).toBe(new Date(dataAntiga).toISOString());
    expect(transacao.origemRetroactiva.motivo).toBe('Cliente cadastrado tarde');

    // Pagamento: dataPagamento = dataCompra + origemRetroactiva
    const pagamentos = await models.Pagamento.find({});
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0].dataPagamento.toISOString()).toBe(new Date(dataAntiga).toISOString());
    expect(pagamentos[0].origemRetroactiva.motivo).toBe('Cliente cadastrado tarde');
    expect(String(pagamentos[0].origemRetroactiva.registadoPor)).toBe(String(user._id));
  });
});

// ──────────────────────────────────────────────
// dataCompra no futuro
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — dataCompra no futuro', () => {
  it('rejeita 400 quando dataCompra é depois de hoje', async () => {
    const { token, cliente, pacote } = await criarTenantEToken('futuro');
    const amanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).toISO();

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: cliente._id.toString(),
        pacoteId: pacote._id.toString(),
        dataCompra: amanha,
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/futuro/i);
  });
});

// ──────────────────────────────────────────────
// Boundary: dataCompra = hoje - 1 dia exacto (não deve pedir motivo)
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — boundary dataCompra=ontem', () => {
  it('aceita venda de ontem sem motivoRetroactivo (critério é < hoje-1d, não <=)', async () => {
    const { token, cliente, pacote } = await criarTenantEToken('boundary');
    // Meio-dia de "ontem" em Lisboa para evitar ambiguidade de timezone
    const ontem = DateTime.now().setZone('Europe/Lisbon').minus({ days: 1 }).set({ hour: 12 }).toISO();

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clienteId: cliente._id.toString(),
        pacoteId: pacote._id.toString(),
        dataCompra: ontem,
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(201);
    expect(res.body.compraPacote.origemRetroactiva).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Multi-tenant isolation
// ──────────────────────────────────────────────

describe('POST /api/compras-pacotes — isolamento multi-tenant', () => {
  it('retorna 404 quando pacoteId pertence a outro tenant', async () => {
    const a = await criarTenantEToken('iso-a-pacote');
    const b = await criarTenantEToken('iso-b-pacote');

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        clienteId: b.cliente._id.toString(),
        pacoteId: a.pacote._id.toString(), // pacote de A
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/pacote/i);
  });

  it('retorna 404 quando clienteId pertence a outro tenant', async () => {
    const a = await criarTenantEToken('iso-a-cliente');
    const b = await criarTenantEToken('iso-b-cliente');

    const res = await request(app)
      .post('/api/compras-pacotes')
      .set('Authorization', `Bearer ${b.token}`)
      .send({
        clienteId: a.cliente._id.toString(), // cliente de A
        pacoteId: b.pacote._id.toString(),
        valorPago: 500,
        formaPagamento: 'Dinheiro',
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/cliente/i);
  });
});
