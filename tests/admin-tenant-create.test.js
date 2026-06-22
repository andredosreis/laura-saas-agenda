import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { authenticate } from '../src/middlewares/auth.js';
import { requireSuperadmin } from '../src/modules/admin/requireSuperadmin.js';
import { auditMiddleware } from '../src/modules/admin/auditMiddleware.js';
import adminRouter from '../src/modules/admin/adminRoutes.js';
import errorHandler from '../src/middlewares/errorHandler.js';
import AuditLog from '../src/models/AuditLog.js';
import Tenant from '../src/models/Tenant.js';
import User from '../src/models/User.js';

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  jest.restoreAllMocks();
});

function superToken() {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), email: 'super@marcai.pt', role: 'superadmin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function userToken() {
  return jwt.sign(
    { userId: new mongoose.Types.ObjectId().toString(), email: 'user@marcai.pt', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', authenticate, requireSuperadmin, auditMiddleware, adminRouter);
  app.use(errorHandler);
  return app;
}

describe('F06 — Create Tenant + Admin User', () => {
  const app = buildApp();

  const payload = {
    nomeEmpresa: 'Salão Beleza Nova',
    adminNome: 'Maria Silva',
    adminEmail: 'maria@nova.pt',
    planoTipo: 'pro',
  };

  it('C1 — sucesso atómico: cria Tenant + admin User + AuditLog "ok" e aparece no list', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tenantId).toBeDefined();
    expect(res.body.data.adminUserId).toBeDefined();

    // Validar Tenant na DB
    const tenant = await Tenant.findById(res.body.data.tenantId);
    expect(tenant).toBeTruthy();
    expect(tenant.nome).toBe(payload.nomeEmpresa);
    expect(tenant.slug).toBe('salao-beleza-nova');
    expect(tenant.plano.tipo).toBe('pro');
    expect(tenant.plano.status).toBe('trial');
    expect(String(tenant.criadoPor)).toBe(res.body.data.adminUserId);

    // Validar User na DB
    const user = await User.findById(res.body.data.adminUserId).select('+passwordHash');
    expect(user).toBeTruthy();
    expect(user.nome).toBe(payload.adminNome);
    expect(user.email).toBe(payload.adminEmail);
    expect(user.role).toBe('admin');
    expect(user.emailVerificado).toBe(false);
    expect(user.emailVerificationToken).toBeDefined();
    expect(String(user.tenantId)).toBe(res.body.data.tenantId);

    // Validar AuditLog
    const audits = await AuditLog.find({});
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('tenant.create');
    expect(audits[0].status).toBe('ok');
    expect(String(audits[0].targetTenantId)).toBe(res.body.data.tenantId);

    // Verificar que aparece na listagem (F02)
    const listRes = await request(app)
      .get('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0]._id).toBe(String(tenant._id));
  });

  it('C2 — mass-assignment: ignora role, status do plano e limites do body e usa os do servidor', async () => {
    const maliciousPayload = {
      ...payload,
      role: 'superadmin',
      plano: { status: 'ativo' },
      limites: { maxUsuarios: 9999 },
      tenantId: new mongoose.Types.ObjectId().toString(),
    };

    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`)
      .send(maliciousPayload);

    expect(res.status).toBe(201);

    const user = await User.findById(res.body.data.adminUserId);
    expect(user.role).toBe('admin'); // ignora role do body

    const tenant = await Tenant.findById(res.body.data.tenantId);
    expect(tenant.plano.status).toBe('trial'); // ignora status ativo
    expect(tenant.limites.maxUsuarios).toBe(1); // ignora limites customizados
  });

  it('C3 — e-mail duplicado: email já registrado globalmente retorna 409 e não cria nada', async () => {
    // Registrar o email primeiro
    await Tenant.create({
      nome: 'Existente',
      slug: 'existente',
      plano: { status: 'ativo' },
    });
    const fakeTenant = await Tenant.findOne({ slug: 'existente' });

    await User.createWithPassword({
      tenantId: fakeTenant._id,
      email: payload.adminEmail,
      password: 'Senha@Forte123',
      nome: 'Existente User',
      role: 'admin',
    });

    // Tentar criar via admin
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`)
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Este email já está registrado');

    // Garantir que nenhum tenant ou user extra foi criado
    const tenantsCount = await Tenant.countDocuments({ slug: 'salao-beleza-nova' });
    expect(tenantsCount).toBe(0);
  });

  it('C4 — rollback em falha: erro na criação do User desfaz Tenant e grava AuditLog "error"', async () => {
    // Forçar falha no User.createWithPassword
    jest.spyOn(User, 'createWithPassword').mockImplementationOnce(() => {
      throw new Error('falha forçada de escrita no banco');
    });

    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${superToken()}`)
      .send(payload);

    expect(res.status).toBe(500);

    // Garantir que não restou Tenant órfão
    const tenants = await Tenant.find({});
    expect(tenants).toHaveLength(0);

    // Garantir que não restou User
    const users = await User.find({});
    expect(users).toHaveLength(0);

    // Validar AuditLog
    const audits = await AuditLog.find({});
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('tenant.create');
    expect(audits[0].status).toBe('error');
    expect(audits[0].metadata.message).toContain('falha forçada de escrita no banco');
  });

  it('C5 — não-superadmin: retorna 404', async () => {
    const res = await request(app)
      .post('/api/admin/tenants')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(payload);

    expect(res.status).toBe(404);
  });
});
