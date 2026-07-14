import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';
import jwt from 'jsonwebtoken';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

// Helper: criar tenant + user (role configurável) e gerar token JWT
async function criarTenantEToken(slug, role = 'admin') {
  const tenant = await Tenant.create({
    nome: `Salão ${slug}`,
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
  });
  const user = await User.create({
    tenantId: tenant._id,
    nome: `User ${slug}`,
    email: `user@${slug}.pt`,
    passwordHash: 'hash-placeholder',
    role,
    permissoes: User.getDefaultPermissions(role),
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: user._id, tenantId: tenant._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, user, token };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Activa os 7 dias base 09:00–18:00 (pausa 12:00–13:00) para o tenant do token.
async function activarTodosOsDias(token) {
  await request(app).get('/api/v1/schedules').set(auth(token));
  await Promise.all(
    [0, 1, 2, 3, 4, 5, 6].map((d) =>
      request(app)
        .put(`/api/v1/schedules/${d}`)
        .set(auth(token))
        .send({ isActive: true, startTime: '09:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00' })
    )
  );
}

describe('F02 — Excepções por data', () => {
  it('C1 — cria excepção "fechado" com nota (inicio/fim null) e aparece na listagem', async () => {
    const { token } = await criarTenantEToken('exc-c1');

    const criar = await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-25', tipo: 'fechado', observacao: 'fechado: férias' });

    expect(criar.status).toBe(201);
    expect(criar.body.success).toBe(true);
    expect(criar.body.data).toMatchObject({
      data: '2026-12-25', tipo: 'fechado', inicio: null, fim: null, observacao: 'fechado: férias',
    });

    const lista = await request(app).get('/api/v1/schedules/excecoes').set(auth(token));
    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(1);
    expect(lista.body.data[0].observacao).toBe('fechado: férias');
  });

  it('C2 — cria excepção "horas-extra" com janela e nota', async () => {
    const { token } = await criarTenantEToken('exc-c2');

    const res = await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-20', tipo: 'horas-extra', inicio: '14:00', fim: '18:00', observacao: 'Natal' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ tipo: 'horas-extra', inicio: '14:00', fim: '18:00', observacao: 'Natal' });
  });

  it('C3 — precedência: data "fechado" devolve zero slots num dia base activo', async () => {
    const { token } = await criarTenantEToken('exc-c3');
    await activarTodosOsDias(token);
    await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-25', tipo: 'fechado' });

    const res = await request(app)
      .get('/api/v1/schedules/available-slots?date=2026-12-25')
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.availableSlots).toEqual([]);
  });

  it('C4 — precedência: data "horas-extra" devolve slots dentro da janela', async () => {
    const { token } = await criarTenantEToken('exc-c4');
    await activarTodosOsDias(token);
    await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-20', tipo: 'horas-extra', inicio: '14:00', fim: '18:00' });

    const res = await request(app)
      .get('/api/v1/schedules/available-slots?date=2026-12-20')
      .set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.availableSlots.length).toBeGreaterThan(0);
    // Todos dentro de 14:00–18:00; a base 09:00 não deve aparecer
    expect(res.body.availableSlots.every((s) => s >= '14:00' && s < '18:00')).toBe(true);
    expect(res.body.availableSlots).not.toContain('09:00');
  });

  describe('C5 — validação (400)', () => {
    it('inicio >= fim', async () => {
      const { token } = await criarTenantEToken('exc-c5a');
      const res = await request(app)
        .post('/api/v1/schedules/excecoes')
        .set(auth(token))
        .send({ data: '2026-12-20', tipo: 'horas-extra', inicio: '18:00', fim: '14:00' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('observacao > 280 chars', async () => {
      const { token } = await criarTenantEToken('exc-c5b');
      const res = await request(app)
        .post('/api/v1/schedules/excecoes')
        .set(auth(token))
        .send({ data: '2026-12-20', tipo: 'fechado', observacao: 'x'.repeat(281) });
      expect(res.status).toBe(400);
    });

    it('data com formato inválido', async () => {
      const { token } = await criarTenantEToken('exc-c5c');
      const res = await request(app)
        .post('/api/v1/schedules/excecoes')
        .set(auth(token))
        .send({ data: '25/12/2026', tipo: 'fechado' });
      expect(res.status).toBe(400);
    });

    it('tipo fora do enum', async () => {
      const { token } = await criarTenantEToken('exc-c5d');
      const res = await request(app)
        .post('/api/v1/schedules/excecoes')
        .set(auth(token))
        .send({ data: '2026-12-20', tipo: 'feriado' });
      expect(res.status).toBe(400);
    });
  });

  it('C6 — uma excepção por data (409 no segundo POST)', async () => {
    const { token } = await criarTenantEToken('exc-c6');
    await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-25', tipo: 'fechado' });

    const dup = await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-25', tipo: 'fechado' });

    expect(dup.status).toBe(409);

    const lista = await request(app).get('/api/v1/schedules/excecoes').set(auth(token));
    expect(lista.body.data).toHaveLength(1);
  });

  it('C7 — nota no dia base persiste; > 280 → 400', async () => {
    const { token } = await criarTenantEToken('exc-c7');
    await request(app).get('/api/v1/schedules').set(auth(token)); // init

    const ok = await request(app)
      .put('/api/v1/schedules/1')
      .set(auth(token))
      .send({ isActive: true, startTime: '09:00', endTime: '18:00', observacao: 'só com marcação' });
    expect(ok.status).toBe(200);
    expect(ok.body.observacao).toBe('só com marcação');

    const tooLong = await request(app)
      .put('/api/v1/schedules/1')
      .set(auth(token))
      .send({ observacao: 'x'.repeat(281) });
    expect(tooLong.status).toBe(400);
  });

  it('C8 — actualizar e apagar uma excepção', async () => {
    const { token } = await criarTenantEToken('exc-c8');
    const criar = await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-20', tipo: 'fechado', observacao: 'inicial' });
    const id = criar.body.data._id;

    const upd = await request(app)
      .put(`/api/v1/schedules/excecoes/${id}`)
      .set(auth(token))
      .send({ data: '2026-12-20', tipo: 'horas-extra', inicio: '10:00', fim: '13:00', observacao: 'alterada' });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ tipo: 'horas-extra', inicio: '10:00', fim: '13:00', observacao: 'alterada' });

    const del = await request(app).delete(`/api/v1/schedules/excecoes/${id}`).set(auth(token));
    expect(del.status).toBe(200);

    const lista = await request(app).get('/api/v1/schedules/excecoes').set(auth(token));
    expect(lista.body.data).toHaveLength(0);
  });

  it('C9 — isolamento multi-tenant (404 cross-tenant, sem fuga de dados)', async () => {
    const { token: tokenA } = await criarTenantEToken('exc-a');
    const { token: tokenB } = await criarTenantEToken('exc-b');

    const criarA = await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(tokenA))
      .send({ data: '2026-12-25', tipo: 'fechado', observacao: 'A' });
    const idA = criarA.body.data._id;

    // B não vê excepções de A
    const listaB = await request(app).get('/api/v1/schedules/excecoes').set(auth(tokenB));
    expect(listaB.body.data).toHaveLength(0);

    // B não actualiza nem apaga a de A → 404
    const updB = await request(app)
      .put(`/api/v1/schedules/excecoes/${idA}`)
      .set(auth(tokenB))
      .send({ data: '2026-12-25', tipo: 'fechado' });
    expect(updB.status).toBe(404);

    const delB = await request(app).delete(`/api/v1/schedules/excecoes/${idA}`).set(auth(tokenB));
    expect(delB.status).toBe(404);

    // A continua intacta
    const listaA = await request(app).get('/api/v1/schedules/excecoes').set(auth(tokenA));
    expect(listaA.body.data).toHaveLength(1);
  });

  it('C10 — leitura aberta a recepcionista, escrita bloqueada (403)', async () => {
    const { token } = await criarTenantEToken('exc-c10', 'recepcionista');

    const get = await request(app).get('/api/v1/schedules/excecoes').set(auth(token));
    expect(get.status).toBe(200);

    const post = await request(app)
      .post('/api/v1/schedules/excecoes')
      .set(auth(token))
      .send({ data: '2026-12-25', tipo: 'fechado' });
    expect(post.status).toBe(403);
  });

  it('C11 — endpoints legados mantêm o shape antigo', async () => {
    const { token } = await criarTenantEToken('exc-c11');
    await activarTodosOsDias(token);

    const sched = await request(app).get('/api/v1/schedules').set(auth(token));
    expect(sched.body).toHaveProperty('disponibilidade');
    expect(sched.body).toHaveProperty('agendamentos');
    expect(sched.body.success).toBeUndefined();

    const slots = await request(app)
      .get('/api/v1/schedules/available-slots?date=2026-12-21')
      .set(auth(token));
    expect(slots.body).toHaveProperty('availableSlots');

    const put = await request(app)
      .put('/api/v1/schedules/2')
      .set(auth(token))
      .send({ isActive: true, startTime: '08:00', endTime: '17:00' });
    // shape legado: documento Schedule cru (sem envelope { success, data })
    expect(put.body.success).toBeUndefined();
    expect(put.body).toMatchObject({ dayOfWeek: 2, startTime: '08:00' });
  });
});
