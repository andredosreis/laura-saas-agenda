import { jest } from '@jest/globals';

// Mock email service ANTES de importar app (compatível com ESM)
jest.unstable_mockModule('../src/services/emailService.js', () => ({
  initEmailService: jest.fn(),
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'mocked' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ messageId: 'mocked' }),
  sendEmailVerificationEmail: jest.fn().mockResolvedValue({ messageId: 'mocked' }),
}));

const request = (await import('supertest')).default;
const { default: app } = await import('../src/app.js');
const { setupTestDB, teardownTestDB, clearDB } = await import('./setup.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { default: User } = await import('../src/models/User.js');
const { default: jwt } = await import('jsonwebtoken');

beforeAll(setupTestDB);
afterAll(teardownTestDB);
beforeEach(clearDB);

async function criarTenantEAdmin(slug = 'test-salon', limites = {}) {
  const tenant = await Tenant.create({
    nome: 'Salão Teste',
    slug,
    plano: { tipo: 'basico', status: 'trial', trialDias: 7 },
    limites: { maxUsuarios: 5, ...limites },
  });
  const admin = await User.createWithPassword({
    tenantId: tenant._id,
    nome: 'Admin Teste',
    email: `admin@${slug}.pt`,
    password: 'Pass1234!',
    role: 'admin',
    emailVerificado: true,
  });
  const token = jwt.sign(
    { userId: admin._id, tenantId: tenant._id, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return { tenant, admin, token };
}

async function criarUserComRole(tenantId, role, email) {
  return User.createWithPassword({
    tenantId,
    nome: `${role} Teste`,
    email,
    password: 'Pass1234!',
    role,
    emailVerificado: true,
  });
}

describe('GET /api/users', () => {
  it('admin lista colaboradores do seu tenant', async () => {
    const { tenant, token } = await criarTenantEAdmin();
    await criarUserComRole(tenant._id, 'recepcionista', 'rec@test.pt');

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2); // admin + recepcionista
    expect(res.body.meta.maxUsuarios).toBe(5);
  });

  it('isolamento multi-tenant: tenant B não vê users do tenant A', async () => {
    const { tenant: tenantA } = await criarTenantEAdmin('a');
    await criarUserComRole(tenantA._id, 'terapeuta', 'tera@a.pt');

    const { token: tokenB } = await criarTenantEAdmin('b');
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1); // só o admin do tenant B
    expect(res.body.data[0].email).toBe('admin@b.pt');
  });

  it('recepcionista é bloqueado por authorize (403)', async () => {
    const { tenant } = await criarTenantEAdmin();
    const recep = await criarUserComRole(tenant._id, 'recepcionista', 'r@test.pt');
    const tokenRec = jwt.sign(
      { userId: recep._id, tenantId: tenant._id, role: 'recepcionista' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${tokenRec}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/users', () => {
  it('cria colaborador com role recepcionista', async () => {
    const { token } = await criarTenantEAdmin();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Maria Silva',
        email: 'maria@test.pt',
        role: 'recepcionista',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('maria@test.pt');
    expect(res.body.data.role).toBe('recepcionista');
    // Não expor passwordHash
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('rejeita email duplicado dentro do mesmo tenant (409)', async () => {
    const { tenant, token } = await criarTenantEAdmin();
    await criarUserComRole(tenant._id, 'terapeuta', 'tera@test.pt');

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Tera Outra',
        email: 'tera@test.pt',
        role: 'terapeuta',
      });

    expect(res.status).toBe(409);
  });

  it('respeita o limite do plano (403 quando atingido)', async () => {
    const { tenant, token } = await criarTenantEAdmin('limit', { maxUsuarios: 2 });
    // admin já é 1; cria mais 1 → ficam 2 (no limite)
    await criarUserComRole(tenant._id, 'terapeuta', 't@test.pt');

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Outro',
        email: 'outro@test.pt',
        role: 'recepcionista',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/limite/i);
  });

  it('admin não pode criar superadmin (403)', async () => {
    const { token } = await criarTenantEAdmin();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'Hacker',
        email: 'h@test.pt',
        role: 'superadmin',
      });

    expect(res.status).toBe(403);
  });

  it('rejeita role inválida (400 via Zod)', async () => {
    const { token } = await criarTenantEAdmin();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nome: 'X',
        email: 'x@test.pt',
        role: 'naoexiste',
      });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/users/:id/desativar', () => {
  it('desactiva colaborador (soft delete)', async () => {
    const { tenant, token } = await criarTenantEAdmin();
    const tera = await criarUserComRole(tenant._id, 'terapeuta', 'tera@test.pt');

    const res = await request(app)
      .patch(`/api/users/${tera._id}/desativar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const reload = await User.findById(tera._id);
    expect(reload.ativo).toBe(false);
  });

  it('admin não pode desactivar-se a si próprio (400)', async () => {
    const { admin, token } = await criarTenantEAdmin();

    const res = await request(app)
      .patch(`/api/users/${admin._id}/desativar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('user de outro tenant retorna 404 (não 403)', async () => {
    const { tenant: tenantA } = await criarTenantEAdmin('a');
    const teraA = await criarUserComRole(tenantA._id, 'terapeuta', 'tera@a.pt');

    const { token: tokenB } = await criarTenantEAdmin('b');

    const res = await request(app)
      .patch(`/api/users/${teraA._id}/desativar`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });
});
