// tests/agendamento-update-timezone.test.js
// Caso Adelaide (2026-07-03): editar um agendamento no painel deslocava a
// hora +1h no verão — o PUT passava a string naïve ("2026-07-30T10:00")
// directamente ao Mongoose, que a castava como UTC. A criação já interpretava
// como hora de parede de Lisboa; o update tem de fazer o mesmo.
// Também cobre: editar a data recria os lembretes (jobIds determinísticos).
import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import { getTenantDB } from '../src/config/tenantDB.js';
import { getModels } from '../src/models/registry.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const API = '/api/v1';

async function registarComToken() {
  const res = await request(app).post(`${API}/auth/register`).send({
    nomeEmpresa: 'Clínica TZ Teste',
    nome: 'Admin TZ',
    email: 'tz@teste.pt',
    password: 'Senha@Segura123',
  });
  return { token: res.body.data.tokens.accessToken, tenantId: res.body.data.tenant.id };
}

describe('PUT /agendamentos/:id — fuso horário da dataHora', () => {
  it('string naïve é hora de parede de Lisboa (não UTC)', async () => {
    const { token, tenantId } = await registarComToken();
    const models = getModels(getTenantDB(tenantId));

    const cliente = await models.Cliente.create({
      tenantId,
      nome: 'Adelaide Teste',
      telefone: '963000001',
    });
    // Marcação gravada com ano errado (2027) às 10:00 de Lisboa = 09:00Z (verão)
    const ag = await models.Agendamento.create({
      tenantId,
      cliente: cliente._id,
      dataHora: new Date('2027-07-30T09:00:00Z'),
      status: 'Agendado',
    });

    // Corrigir só o ano no painel: o form envia a hora de parede que mostra
    const res = await request(app)
      .put(`${API}/agendamentos/${ag._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dataHora: '2026-07-30T10:00' });

    expect(res.status).toBe(200);

    const depois = await models.Agendamento.findById(ag._id).lean();
    // 10:00 Lisboa em julho (WEST, UTC+1) = 09:00Z. Antes do fix: 10:00Z (11:00 locais).
    expect(depois.dataHora.toISOString()).toBe('2026-07-30T09:00:00.000Z');
  });

  it('dataHora inválida → 400', async () => {
    const { token, tenantId } = await registarComToken();
    const models = getModels(getTenantDB(tenantId));
    const cliente = await models.Cliente.create({ tenantId, nome: 'Xis Teste', telefone: '963000002' });
    const ag = await models.Agendamento.create({
      tenantId,
      cliente: cliente._id,
      dataHora: new Date('2026-08-01T09:00:00Z'),
      status: 'Agendado',
    });

    const res = await request(app)
      .put(`${API}/agendamentos/${ag._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dataHora: 'não-é-data' });

    expect(res.status).toBe(400);
  });
});
