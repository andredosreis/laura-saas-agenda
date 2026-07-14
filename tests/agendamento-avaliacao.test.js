import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'salon-avaliacao') {
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
    permissoes: User.getDefaultPermissions('admin'),
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, user, token };
}

async function activarSchedule(token) {
  await request(app).get('/api/schedules').set('Authorization', `Bearer ${token}`);
  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map(day =>
      request(app)
        .put(`/api/schedules/${day}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isActive: true, startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00' })
    )
  );
}

async function criarCliente(token, telefone = '910000001') {
  const res = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Cliente Teste', telefone });
  return res.body.data._id;
}

function dataFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // F05: sem offset — o backend interpreta em Europe/Lisbon, logo 14:00 e um slot
  // valido do expediente 09-18 em qualquer estacao (com -03:00 dava 18:00 no verao,
  // fora da disponibilidade agora enforced).
  return d.toISOString().split('T')[0] + 'T14:00:00';
}

// ──────────────────────────────────────────────
// ADR-011: Agendamento sem pacote
// ──────────────────────────────────────────────

describe('ADR-011: Agendamento sem pacote (serviço avulso)', () => {
  it('cria agendamento de avaliação sem pacote com sucesso', async () => {
    const { token } = await criarTenantEToken();
    await activarSchedule(token);
    const clienteId = await criarCliente(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteId,
        dataHora: dataFutura(),
        servicoAvulsoNome: 'Avaliação Facial',
        servicoAvulsoValor: 0,
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.pacote).toBeUndefined();
    expect(res.body.compraPacote).toBeUndefined();
  });

  it('cria agendamento de serviço avulso sem pacote', async () => {
    const { token } = await criarTenantEToken('salon-avulso');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '911000001');

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteId,
        dataHora: dataFutura(),
        servicoAvulsoNome: 'Botox',
        servicoAvulsoValor: 150,
      });

    expect(res.status).toBe(201);
  });
});

// ──────────────────────────────────────────────
// ADR-011: Status 'Avaliacao'
// ──────────────────────────────────────────────

describe('ADR-011: Status Avaliacao', () => {
  it('aceita status Avaliacao ao actualizar agendamento', async () => {
    const { token } = await criarTenantEToken('salon-avaliacao2');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '912000001');

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criarRes.status).toBe(201);
    const agendamentoId = criarRes.body._id;

    const updateRes = await request(app)
      .patch(`/api/agendamentos/${agendamentoId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Avaliacao' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe('Avaliacao');
  });

  it('isolamento — Tenant B não acede a agendamento de Tenant A', async () => {
    const { token: tokenA } = await criarTenantEToken('salon-iso-a');
    const { token: tokenB } = await criarTenantEToken('salon-iso-b');

    await activarSchedule(tokenA);
    const clienteId = await criarCliente(tokenA, '913000001');

    const criar = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    const agendamentoId = criar.body._id;

    const res = await request(app)
      .get(`/api/agendamentos/${agendamentoId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// Confirmação e rejeição
// ──────────────────────────────────────────────

describe('Agendamento: confirmação e liberação de slot', () => {
  it('altera status para Confirmado quando o cliente confirma', async () => {
    const { token } = await criarTenantEToken('salon-confirma-cliente');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '914000001');

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora: dataFutura() });

    expect(criarRes.status).toBe(201);

    const confirmarRes = await request(app)
      .patch(`/api/agendamentos/${criarRes.body._id}/confirmar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmacao: 'confirmado', respondidoPor: 'cliente' });

    expect(confirmarRes.status).toBe(200);
    expect(confirmarRes.body.success).toBe(true);
    expect(confirmarRes.body.agendamento.status).toBe('Confirmado');
    expect(confirmarRes.body.agendamento.confirmacao.tipo).toBe('confirmado');
    expect(confirmarRes.body.agendamento.confirmacao.respondidoPor).toBe('cliente');
  });

  it('rejeição pelo salão cancela e permite novo agendamento no mesmo horário', async () => {
    const { token } = await criarTenantEToken('salon-rejeita-slot');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '915000001');
    const dataHora = dataFutura();

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: clienteId, dataHora });

    expect(criarRes.status).toBe(201);

    const rejeitarRes = await request(app)
      .patch(`/api/agendamentos/${criarRes.body._id}/confirmar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmacao: 'rejeitado', respondidoPor: 'laura' });

    expect(rejeitarRes.status).toBe(200);
    expect(rejeitarRes.body.agendamento.status).toBe('Cancelado Pelo Salão');
    expect(rejeitarRes.body.agendamento.confirmacao.tipo).toBe('rejeitado');
    expect(rejeitarRes.body.agendamento.confirmacao.respondidoPor).toBe('laura');

    const novoClienteId = await criarCliente(token, '915000002');
    const novoRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ cliente: novoClienteId, dataHora });

    expect(novoRes.status).toBe(201);
    expect(novoRes.body._id).toBeDefined();
  });
});

describe('Agendamento: oferta sem faturamento', () => {
  it('cria oferta para cliente sem pacote e realiza sem gerar pagamento pendente', async () => {
    const { token } = await criarTenantEToken('salon-oferta-servico');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '916000001');

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteId,
        dataHora: dataFutura(),
        servicoTipo: 'oferta',
        servicoAvulsoNome: 'Sessão cortesia',
      });

    expect(criarRes.status).toBe(201);
    expect(criarRes.body.servicoTipo).toBe('oferta');
    expect(criarRes.body.servicoAvulsoNome).toBe('Sessão cortesia');
    expect(criarRes.body.servicoAvulsoValor).toBe(0);
    expect(criarRes.body.statusPagamento).toBe('Isento');

    const realizadoRes = await request(app)
      .patch(`/api/agendamentos/${criarRes.body._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'Realizado' });

    expect(realizadoRes.status).toBe(200);
    expect(realizadoRes.body.status).toBe('Realizado');
    expect(realizadoRes.body.statusPagamento).toBe('Isento');
    expect(realizadoRes.body.valorCobrado).toBe(0);
  });

  it('não permite registrar pagamento em uma oferta', async () => {
    const { token } = await criarTenantEToken('salon-oferta-sem-pagamento');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '917000001');

    const criarRes = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cliente: clienteId,
        dataHora: dataFutura(),
        servicoTipo: 'oferta',
        servicoAvulsoNome: 'Oferta de retorno',
      });

    expect(criarRes.status).toBe(201);

    const pagamentoRes = await request(app)
      .post(`/api/agendamentos/${criarRes.body._id}/pagamento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ valor: 1, formaPagamento: 'Dinheiro' });

    expect(pagamentoRes.status).toBe(400);
    expect(pagamentoRes.body.message).toMatch(/oferta/i);
  });
});
