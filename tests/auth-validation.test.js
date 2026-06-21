import request from 'supertest';
import app from '../src/app.js';
import { setupTestDB, teardownTestDB, clearDB } from './setup.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

const validRegister = {
  nomeEmpresa: 'Clínica Zod',
  nome: 'Maria Ana',
  email: 'maria@zod.pt',
  password: 'Senha@Segura123',
};

describe('Zod validation — POST /api/auth/register (defesa em profundidade)', () => {
  it('rejeita tentativa de injectar role via body (mass assignment)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // tenantId é um SERVER_MANAGED_KEY: o middleware `validate` remove-o do body
  // antes de validar (tolera PWAs com cache antiga que reenviam o doc Mongo
  // inteiro) e o controller só destrutura 5 campos. O que importa é o isolamento
  // — afirmamo-lo directamente, não o status HTTP: um tenantId injectado não tem
  // efeito nenhum (é neutralizado em duas camadas, não rejeitado ruidosamente).
  it('ignora tenantId injectado — user nasce em tenant fresco, não no injectado', async () => {
    const vitima = await Tenant.create({
      nome: 'Vítima SA',
      slug: 'vitima-sa',
      plano: { tipo: 'pro', status: 'ativo' },
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, tenantId: vitima._id.toString() });

    // Sucede (o tenantId é descartado em silêncio, não rejeitado) ...
    expect(res.status).toBe(201);

    // ... e o isolamento é preservado: o user fica num tenant NOVO, não no da vítima.
    const user = await User.findOne({ email: validRegister.email });
    expect(user).not.toBeNull();
    expect(user.tenantId.toString()).not.toBe(vitima._id.toString());

    // Nenhuma membership nasceu no tenant da vítima.
    const intrusos = await User.countDocuments({ tenantId: vitima._id });
    expect(intrusos).toBe(0);
  });

  it('rejeita tentativa de injectar emailVerificado via body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, emailVerificado: true });

    expect(res.status).toBe(400);
  });

  it('rejeita password fraca (apenas minúsculas)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, password: 'fracafraca' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/senha/i);
  });

  it('normaliza email para lowercase antes de guardar', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, email: 'MARIA@ZOD.PT' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('maria@zod.pt');
  });
});

describe('Zod validation — POST /api/auth/reset-password', () => {
  it('rejeita token com formato inválido (não hex)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'nao-sou-hex!!!', password: 'Senha@Segura123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/token/i);
  });
});
