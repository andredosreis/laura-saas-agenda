import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEToken(slug = 'funil-a') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: 'Admin',
    email: `admin@${slug}.pt`,
    passwordHash: 'hash',
    role: 'admin',
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

async function criarCliente(token, telefone = '910111111') {
  const res = await request(app)
    .post('/api/clientes')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome: 'Cliente Existente', telefone });
  return res.body._id;
}

function dataFutura() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0] + 'T14:00:00-03:00';
}

// ──────────────────────────────────────────────
// Criar agendamento de Avaliação (lead)
// ──────────────────────────────────────────────

describe('Funil — Criar Avaliação como lead', () => {
  it('cria agendamento de Avaliação com lead (sem clienteId)', async () => {
    const { token } = await criarTenantEToken('funil-criar-1');
    await activarSchedule(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Avaliacao',
        lead: { nome: 'Maria Lead', telefone: '920000001' },
        dataHora: dataFutura(),
      });

    expect(res.status).toBe(201);
    expect(res.body._id).toBeDefined();
    expect(res.body.tipo).toBe('Avaliacao');
    expect(res.body.lead.nome).toBe('Maria Lead');
    expect(res.body.cliente).toBeUndefined();
  });

  it('rejeita Avaliação sem lead.nome', async () => {
    const { token } = await criarTenantEToken('funil-criar-2');
    await activarSchedule(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Avaliacao',
        lead: { telefone: '920000002' },
        dataHora: dataFutura(),
      });

    expect(res.status).toBe(400);
  });

  it('rejeita Sessao sem clienteId', async () => {
    const { token } = await criarTenantEToken('funil-criar-3');
    await activarSchedule(token);

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Sessao',
        dataHora: dataFutura(),
      });

    expect(res.status).toBe(400);
  });

  it('cria Sessao com clienteId existente', async () => {
    const { token } = await criarTenantEToken('funil-criar-4');
    await activarSchedule(token);
    const clienteId = await criarCliente(token, '910222222');

    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Sessao',
        cliente: clienteId,
        dataHora: dataFutura(),
      });

    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe('Sessao');
  });
});

// ──────────────────────────────────────────────
// Marcar comparecimento
// ──────────────────────────────────────────────

describe('Funil — Marcar comparecimento', () => {
  async function criarAvaliacaoLead(token) {
    const res = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Avaliacao',
        lead: { nome: 'Lead Teste', telefone: '930000001' },
        dataHora: dataFutura(),
      });
    return res.body._id;
  }

  it('marca compareceu como true → status Compareceu', async () => {
    const { token } = await criarTenantEToken('funil-comp-1');
    await activarSchedule(token);
    const id = await criarAvaliacaoLead(token);

    const res = await request(app)
      .patch(`/api/agendamentos/${id}/comparecimento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ compareceu: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.compareceu).toBe(true);
    expect(res.body.data.status).toBe('Compareceu');
  });

  it('marca compareceu como false → status Não Compareceu', async () => {
    const { token } = await criarTenantEToken('funil-comp-2');
    await activarSchedule(token);
    const id = await criarAvaliacaoLead(token);

    const res = await request(app)
      .patch(`/api/agendamentos/${id}/comparecimento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ compareceu: false });

    expect(res.status).toBe(200);
    expect(res.body.data.compareceu).toBe(false);
    expect(res.body.data.status).toBe('Não Compareceu');
  });

  it('rejeita compareceu com valor inválido', async () => {
    const { token } = await criarTenantEToken('funil-comp-3');
    await activarSchedule(token);
    const id = await criarAvaliacaoLead(token);

    const res = await request(app)
      .patch(`/api/agendamentos/${id}/comparecimento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ compareceu: 'sim' });

    expect(res.status).toBe(400);
  });

  it('Tenant B não acede a agendamento de Tenant A', async () => {
    const { token: tokenA } = await criarTenantEToken('funil-iso-a');
    const { token: tokenB } = await criarTenantEToken('funil-iso-b');
    await activarSchedule(tokenA);
    const id = await criarAvaliacaoLead(tokenA);

    const res = await request(app)
      .patch(`/api/agendamentos/${id}/comparecimento`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ compareceu: true });

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// Fechar pacote (encerramento da avaliação)
// ──────────────────────────────────────────────

describe('Funil — Fechar pacote', () => {
  async function criarAvaliacaoComPresenca(token, telefone = '940000001') {
    const criar = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Avaliacao',
        lead: { nome: 'Ana Lead', telefone },
        dataHora: dataFutura(),
      });
    const id = criar.body._id;

    await request(app)
      .patch(`/api/agendamentos/${id}/comparecimento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ compareceu: true });

    return id;
  }

  it('fechar=true → converte lead em Cliente e retorna clienteCriado', async () => {
    const { token } = await criarTenantEToken('funil-fechar-1');
    await activarSchedule(token);
    const id = await criarAvaliacaoComPresenca(token, '940000001');

    const res = await request(app)
      .post(`/api/agendamentos/${id}/fechar-pacote`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fechou: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fechouPacote).toBe(true);
    expect(res.body.data.status).toBe('Fechado');
    expect(res.body.clienteCriado).toBeDefined();
    expect(res.body.clienteCriado.nome).toBe('Ana Lead');
    expect(res.body.data.clienteConvertido).toBeDefined();
  });

  it('fechar=false → marca fechouPacote=false sem criar cliente', async () => {
    const { token } = await criarTenantEToken('funil-fechar-2');
    await activarSchedule(token);
    const id = await criarAvaliacaoComPresenca(token, '940000002');

    const res = await request(app)
      .post(`/api/agendamentos/${id}/fechar-pacote`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fechou: false });

    expect(res.status).toBe(200);
    expect(res.body.data.fechouPacote).toBe(false);
    expect(res.body.clienteCriado).toBeUndefined();
  });

  it('rejeita fechar sem marcar presença primeiro', async () => {
    const { token } = await criarTenantEToken('funil-fechar-3');
    await activarSchedule(token);

    const criar = await request(app)
      .post('/api/agendamentos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'Avaliacao',
        lead: { nome: 'Sem Presença', telefone: '940000003' },
        dataHora: dataFutura(),
      });

    const res = await request(app)
      .post(`/api/agendamentos/${criar.body._id}/fechar-pacote`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fechou: true });

    expect(res.status).toBe(400);
  });

  it('fechar=true com telefone duplicado → reutiliza cliente existente', async () => {
    const { token } = await criarTenantEToken('funil-fechar-4');
    await activarSchedule(token);

    // Cria cliente com o mesmo telefone
    await criarCliente(token, '940000004');

    const id = await criarAvaliacaoComPresenca(token, '940000004');

    const res = await request(app)
      .post(`/api/agendamentos/${id}/fechar-pacote`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fechou: true });

    expect(res.status).toBe(200);
    expect(res.body.data.fechouPacote).toBe(true);
    // clienteCriado aponta para o existente
    expect(res.body.clienteCriado).toBeDefined();
  });

  it('Tenant B não acede a agendamento de Tenant A', async () => {
    const { token: tokenA } = await criarTenantEToken('funil-fiso-a');
    const { token: tokenB } = await criarTenantEToken('funil-fiso-b');
    await activarSchedule(tokenA);
    const id = await criarAvaliacaoComPresenca(tokenA, '940000005');

    const res = await request(app)
      .post(`/api/agendamentos/${id}/fechar-pacote`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ fechou: true });

    expect(res.status).toBe(404);
  });
});
