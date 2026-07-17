import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { generate, generateSecret } from 'otplib';
import app from '../src/app.js';
import AuditLog from '../src/models/AuditLog.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';

let replSet;
const credentials = { email: 'super-2fa@marcai.pt', password: 'SenhaSuper@123' };

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
  process.env.NODE_ENV = 'test';
  process.env.SUPERADMIN_REQUIRE_2FA = 'false';
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  delete process.env.SUPERADMIN_REQUIRE_2FA;
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(async () => {
  process.env.SUPERADMIN_REQUIRE_2FA = 'false';
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

async function createSuperadmin(overrides = {}) {
  return User.createWithPassword({
    email: credentials.email,
    password: credentials.password,
    nome: 'Super Admin 2FA',
    role: 'superadmin',
    ...overrides,
  });
}

async function passwordLogin() {
  return request(app).post('/api/auth/login').send(credentials);
}

async function bearerWithout2FA() {
  const response = await passwordLogin();
  return response.body.data.tokens.accessToken;
}

const mutateCode = (code) => `${code.slice(0, -1)}${code.at(-1) === '9' ? '0' : '9'}`;

async function setupWith(accessToken) {
  return request(app)
    .post('/api/v1/admin/2fa/setup')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({});
}

async function enrol(accessToken) {
  const setup = await setupWith(accessToken);
  const token = await generate({ secret: setup.body.data.secret });
  const activate = await request(app)
    .post('/api/v1/admin/2fa/activate')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ token });
  return { setup, activate };
}

describe('F16 — enrolamento TOTP auditado', () => {
  it('setup só expõe o segredo na resposta one-time e nunca no safe object/audit', async () => {
    await createSuperadmin();
    const accessToken = await bearerWithout2FA();
    const setup = await setupWith(accessToken);

    expect(setup.status).toBe(200);
    expect(setup.body.data.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.body.data.otpauthUri).toContain('otpauth://totp/');
    expect(setup.body.data.otpauthUri).toContain('Marcai%20Admin');

    const user = await User.findOne({ email: credentials.email }).select('+twoFactor.secret');
    expect(user.twoFactor.secret).toBe(setup.body.data.secret);
    expect(user.toSafeObject()).toMatchObject({ twoFactorEnabled: false });
    expect(user.toSafeObject()).not.toHaveProperty('twoFactor');

    const auditDump = JSON.stringify(await AuditLog.find({}).lean());
    expect(auditDump).not.toContain(setup.body.data.secret);
    expect(auditDump).not.toContain(setup.body.data.otpauthUri);
    expect(await AuditLog.findOne({ action: 'superadmin.2fa.setup' })).toMatchObject({
      status: 'ok', before: { enabled: false }, after: { enabled: false }, metadata: { enabled: false },
    });
  });

  it('activa com código válido e desactiva apenas com outro código válido', async () => {
    await createSuperadmin();
    const accessToken = await bearerWithout2FA();
    const { setup, activate } = await enrol(accessToken);
    expect(activate.status).toBe(200);
    expect(activate.body.data).toEqual({ enabled: true });

    let user = await User.findOne({ email: credentials.email }).select('+twoFactor.secret');
    expect(user.twoFactor.enabled).toBe(true);
    expect(user.twoFactor.confirmedAt).toBeInstanceOf(Date);
    expect(user.toSafeObject()).toMatchObject({ twoFactorEnabled: true });

    const token = await generate({ secret: setup.body.data.secret });
    const disabled = await request(app)
      .post('/api/v1/admin/2fa/disable')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toEqual({ enabled: false });

    user = await User.findOne({ email: credentials.email }).select('+twoFactor.secret');
    expect(user.twoFactor?.enabled).toBe(false);
    expect(user.twoFactor?.secret).toBeUndefined();
  });

  it('código inválido devolve 400, reverte activação e audita erro sem segredo', async () => {
    await createSuperadmin();
    const accessToken = await bearerWithout2FA();
    const setup = await setupWith(accessToken);
    const validCode = await generate({ secret: setup.body.data.secret });

    const activate = await request(app)
      .post('/api/v1/admin/2fa/activate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token: mutateCode(validCode) });
    expect(activate.status).toBe(400);
    expect(activate.body.error).toBe('Código inválido');

    const user = await User.findOne({ email: credentials.email }).select('+twoFactor.secret');
    expect(user.twoFactor.enabled).toBe(false);
    const audit = await AuditLog.findOne({ action: 'superadmin.2fa.activate' }).lean();
    expect(audit.status).toBe('error');
    expect(JSON.stringify(audit)).not.toContain(setup.body.data.secret);
  });
});

describe('F16 — challenge de login, claims e lockout', () => {
  it('não emite tokens no primeiro passo; TOTP emite mfa:true e refresh preserva-o', async () => {
    await createSuperadmin();
    const weakToken = await bearerWithout2FA();
    const { setup } = await enrol(weakToken);

    const firstStep = await passwordLogin();
    expect(firstStep.status).toBe(200);
    expect(firstStep.body.data.requires2FA).toBe(true);
    expect(firstStep.body.data.challengeToken).toEqual(expect.any(String));
    expect(firstStep.body.data).not.toHaveProperty('tokens');

    const token = await generate({ secret: setup.body.data.secret });
    const secondStep = await request(app).post('/api/auth/login/2fa').send({
      challengeToken: firstStep.body.data.challengeToken,
      token,
    });
    expect(secondStep.status).toBe(200);
    const claims = jwt.verify(secondStep.body.data.tokens.accessToken, process.env.JWT_SECRET);
    expect(claims.mfa).toBe(true);

    const refreshed = await request(app).post('/api/auth/refresh').send({
      refreshToken: secondStep.body.data.tokens.refreshToken,
    });
    expect(refreshed.status).toBe(200);
    const refreshedClaims = jwt.verify(refreshed.body.data.tokens.accessToken, process.env.JWT_SECRET);
    const refreshClaims = jwt.verify(refreshed.body.data.tokens.refreshToken, process.env.JWT_REFRESH_SECRET);
    expect(refreshedClaims.mfa).toBe(true);
    expect(refreshClaims.mfa).toBe(true);
  });

  it('rejeita challenge expirado e access token usado como challenge', async () => {
    const user = await createSuperadmin({ twoFactor: { enabled: true, secret: generateSecret() } });
    const expired = jwt.sign(
      { sub: user._id.toString(), scope: '2fa-challenge' },
      process.env.JWT_SECRET,
      { expiresIn: -1 }
    );
    const expiredResponse = await request(app).post('/api/auth/login/2fa').send({
      challengeToken: expired,
      token: '123456',
    });
    expect(expiredResponse.status).toBe(401);
    expect(expiredResponse.body.code).toBe('CHALLENGE_EXPIRED');

    const accessToken = jwt.sign(
      { userId: user._id, role: 'superadmin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const wrongPurpose = await request(app).post('/api/auth/login/2fa').send({
      challengeToken: accessToken,
      token: '123456',
    });
    expect(wrongPurpose.status).toBe(401);
    expect(wrongPurpose.body.code).toBe('CHALLENGE_INVALID');
  });

  it('a quinta tentativa TOTP inválida bloqueia a conta com 423', async () => {
    await createSuperadmin();
    const weakToken = await bearerWithout2FA();
    const { setup } = await enrol(weakToken);
    const firstStep = await passwordLogin();
    const valid = await generate({ secret: setup.body.data.secret });
    const invalid = mutateCode(valid);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await request(app).post('/api/auth/login/2fa').send({
        challengeToken: firstStep.body.data.challengeToken,
        token: invalid,
      });
      expect(response.status).toBe(attempt === 5 ? 423 : 401);
    }

    const user = await User.findOne({ email: credentials.email });
    expect(user.loginAttempts).toBe(5);
    expect(user.isLocked).toBe(true);
  });

  it('login de um role de tenant continua a emitir sessão sem challenge', async () => {
    const tenant = await Tenant.create({
      nome: 'Tenant 2FA Regression', slug: 'tenant-2fa-regression', plano: { tipo: 'basico', status: 'ativo' },
    });
    await User.createWithPassword({
      tenantId: tenant._id,
      email: 'admin@tenant.pt',
      password: 'SenhaTenant@123',
      nome: 'Admin Tenant',
      role: 'admin',
    });
    const response = await request(app).post('/api/auth/login').send({
      email: 'admin@tenant.pt', password: 'SenhaTenant@123',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.requires2FA).toBeUndefined();
    expect(response.body.data.tokens.accessToken).toEqual(expect.any(String));
  });
});

describe('F16 — require2FA', () => {
  it('flag on: setup continua acessível; painel distingue não-enrolado, sessão fraca e sessão MFA', async () => {
    await createSuperadmin();
    const weakToken = await bearerWithout2FA();
    process.env.SUPERADMIN_REQUIRE_2FA = 'true';

    const notEnrolled = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${weakToken}`);
    expect(notEnrolled.status).toBe(403);
    expect(notEnrolled.body.error).toContain('2FA obrigatório');

    const { setup, activate } = await enrol(weakToken);
    expect(setup.status).toBe(200);
    expect(activate.status).toBe(200);

    const weakSession = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${weakToken}`);
    expect(weakSession.status).toBe(401);
    expect(weakSession.body.error).toContain('Sessão sem 2FA');

    const firstStep = await passwordLogin();
    const code = await generate({ secret: setup.body.data.secret });
    const secondStep = await request(app).post('/api/auth/login/2fa').send({
      challengeToken: firstStep.body.data.challengeToken,
      token: code,
    });
    const strongToken = secondStep.body.data.tokens.accessToken;
    const strongSession = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${strongToken}`);
    expect(strongSession.status).toBe(200);

    process.env.SUPERADMIN_REQUIRE_2FA = 'false';
    const enforcementOff = await request(app)
      .get('/api/v1/admin/tenants')
      .set('Authorization', `Bearer ${weakToken}`);
    expect(enforcementOff.status).toBe(200);
  });
});
