import mongoose from 'mongoose';
import crypto from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import Tenant from '../../models/Tenant.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import { getModels } from '../../models/registry.js';
import { getTenantDBAdmin } from './getTenantDBAdmin.js';
import { sendEmailVerificationEmail } from '../../services/emailService.js';
import { PLANO_STATUSES, PLANO_TIPOS } from './adminSchemas.js';
import { adminMutation } from './adminMutation.js';
import logger from '../../utils/logger.js';
// Namespace import (mesma razão que em modules/messaging/controllers/webhookController.js):
// vários testes de webhook/lembretes substituem este módulo por um mock PARCIAL
// (só sendWhatsAppMessage/getMediaBase64) e importam `src/app.js`, que monta o
// adminRouter. Com import nomeado, o link ESM rebentava nesses testes com
// "does not provide an export named 'createInstance'"; com namespace, um nome em
// falta é apenas undefined — e só seria acedido nestas rotas, que esses testes
// não exercem.
import * as evolutionClient from '../../utils/evolutionClient.js';

const loadSuperadminWith2FA = (userId, session) =>
  User.findById(userId).select('+twoFactor.secret').session(session);

/**
 * POST /admin/2fa/setup — cria/substitui o segredo enquanto o enrolamento ainda
 * não foi activado. O URI e o segredo só existem no payload desta resposta;
 * auditoria recebe exclusivamente o estado booleano.
 */
export const setup2FA = async (req, { session }) => {
  const user = await loadSuperadminWith2FA(req.user.userId || req.user._id, session);
  if (!user || user.role !== 'superadmin') {
    req.res.status(404);
    throw new Error('Recurso não encontrado');
  }
  if (user.twoFactor?.enabled) {
    req.res.status(409);
    throw new Error('2FA já está activo');
  }

  const secret = generateSecret();
  const otpauthUri = generateURI({
    issuer: 'Marcai Admin',
    label: user.email,
    secret,
  });

  user.twoFactor = { enabled: false, secret, confirmedAt: null };
  await user.save({ session });

  return {
    data: { otpauthUri, secret },
    before: { enabled: false },
    after: { enabled: false },
    metadata: { enabled: false },
  };
};

/** POST /admin/2fa/activate — confirma o primeiro TOTP e activa o factor. */
export const activate2FA = async (req, { session }) => {
  const user = await loadSuperadminWith2FA(req.user.userId || req.user._id, session);
  const secret = user?.twoFactor?.secret;
  if (!user || user.role !== 'superadmin' || !secret) {
    req.res.status(400);
    throw new Error('Inicie a configuração de 2FA antes de activar');
  }

  const { valid } = await verify({ secret, token: req.body.token, epochTolerance: 30 });
  if (!valid) {
    req.res.status(400);
    throw new Error('Código inválido');
  }

  const before = { enabled: !!user.twoFactor.enabled };
  user.twoFactor.enabled = true;
  user.twoFactor.confirmedAt = new Date();
  await user.save({ session });

  return {
    data: { enabled: true },
    before,
    after: { enabled: true },
    metadata: { enabled: true },
  };
};

/** POST /admin/2fa/disable — exige prova TOTP actual antes de apagar o factor. */
export const disable2FA = async (req, { session }) => {
  const user = await loadSuperadminWith2FA(req.user.userId || req.user._id, session);
  const secret = user?.twoFactor?.secret;
  if (!user || user.role !== 'superadmin' || !user.twoFactor?.enabled || !secret) {
    req.res.status(400);
    throw new Error('2FA não está activo');
  }

  const { valid } = await verify({ secret, token: req.body.token, epochTolerance: 30 });
  if (!valid) {
    req.res.status(400);
    throw new Error('Código inválido');
  }

  user.twoFactor = undefined;
  await user.save({ session });

  return {
    data: { enabled: false },
    before: { enabled: true },
    after: { enabled: false },
    metadata: { enabled: false },
  };
};

/**
 * GET /admin/tenants — lista todos os tenants.
 *
 * Control-plane (DB partilhada `laura-saas`), travessia cross-tenant SANCIONADA:
 * este é o painel super-admin, logo NÃO há filtro `{ tenantId }` — ao contrário
 * de todo o resto do sistema. A guarda é o `requireSuperadmin` no router.
 */
export const listarTenants = async (req, res) => {
  // Coerção, defaults e trim vêm já feitos do `listarTenantsSchema`.
  const { page, limit, search, plano, status } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};
  if (search) {
    // A colecção de controlo tem centenas de registos; regex sem índice é
    // aceitável. Considerar um índice em `nome` apenas acima de ~10k tenants.
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$or = [{ nome: rx }, { slug: rx }];
  }
  if (plano) filter['plano.tipo'] = plano;
  if (status) filter['plano.status'] = status;

  const [data, total] = await Promise.all([
    Tenant.find(filter)
      .select('nome slug plano createdAt')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Tenant.countDocuments(filter),
  ]);

  req.audit.set({
    action: 'tenant.list',
    metadata: { page, limit, search, plano, status, returned: data.length },
  });

  res.json({
    success: true,
    data,
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  });
};

/**
 * GET /admin/tenants/stats — totais globais do control-plane numa agregação.
 *
 * Um collection scan é deliberado: o universo esperado é de centenas de
 * tenants e o `$facet` evita várias viagens à base de dados.
 */
export const obterTenantStats = async (req, res) => {
  const [stats = {}] = await Tenant.aggregate([
    {
      $facet: {
        total: [{ $count: 'n' }],
        porStatus: [{ $group: { _id: '$plano.status', n: { $sum: 1 } } }],
        porTipo: [{ $group: { _id: '$plano.tipo', n: { $sum: 1 } } }],
      },
    },
  ]);

  const porStatus = Object.fromEntries(PLANO_STATUSES.map((value) => [value, 0]));
  const porTipo = Object.fromEntries(PLANO_TIPOS.map((value) => [value, 0]));

  for (const row of stats.porStatus ?? []) {
    if (row._id) porStatus[row._id] = row.n;
  }
  for (const row of stats.porTipo ?? []) {
    if (row._id) porTipo[row._id] = row.n;
  }

  req.audit.set({ action: 'tenant.stats' });

  res.json({
    success: true,
    data: {
      total: stats.total?.[0]?.n ?? 0,
      porStatus,
      porTipo,
    },
  });
};

/**
 * Allowlist de campos de `GET /admin/tenants/:id` (F15).
 *
 * Projecção por INCLUSÃO, não denylist: um campo novo no schema `Tenant`
 * (ex.: um secret futuro) é privado por omissão — adicionar aqui é sempre
 * uma decisão deliberada, revista em PR. Contraste com a denylist anterior
 * (`-whatsapp.instanceToken`), que expunha qualquer campo novo por defeito.
 *
 * `contato` (dados pessoais do dono — email/telefone/morada) fica visível
 * numa base de need-to-know GDPR: o superadmin gere um serviço done-for-you
 * e precisa de contactar o dono da conta; o acesso é superadmin-only e cada
 * leitura fica auditada (`tenant.view`, ver abaixo).
 *
 * `whatsapp` é allowlisted campo-a-campo (não o subdocumento inteiro) — nunca
 * `whatsapp.instanceToken`, `whatsapp.zapiToken`, `whatsapp.zapiClientToken`
 * nem qualquer campo cujo nome bata em /token|secret|key|password/i.
 *
 * Cruzado com os paths que `TenantDetailPage.tsx` lê (superset, não subset):
 * nome, slug, plano.*, limites.*, isTrialExpired/diasRestantesTrial (virtuals
 * derivados de plano.status/trialDias + createdAt, por isso `plano` completo
 * e `createdAt` têm de estar presentes), createdAt. `configuracoes` e
 * `branding` não têm sub-secrets no schema actual (verificado) — allowlisted
 * inteiros por ora; se ganharem um campo secreto, passam a allowlist por
 * subcampo como o `whatsapp`.
 *
 * `plano` completo inclui `stripeCustomerId`/`stripeSubscriptionId` — expostos
 * DELIBERADAMENTE: são identificadores Stripe (`cus_…`/`sub_…`), não credenciais
 * (inúteis sem a API key, não batem em /token|secret|key|password/i) e são
 * need-to-know para gestão de billing na consola. Se `plano` ganhar um secret
 * real (ex.: uma chave), passa a allowlist por subcampo.
 */
export const TENANT_DETAIL_FIELDS = [
  'nome',
  'slug',
  'ativo',
  'plano',
  'limites',
  'configuracoes',
  'branding',
  'contato',
  'whatsapp.instanceName',
  'whatsapp.numeroWhatsapp',
  'whatsapp.health.state',
  'createdAt',
  'updatedAt',
];

/**
 * GET /admin/tenants/:id — detalhe de um tenant + contagem de utilizadores.
 *
 * Control-plane. `Tenant.findById` sem filtro tenantId é correcto AQUI (o Tenant
 * é a própria entidade de tenant, e este é o painel super-admin). Inexistente →
 * 404 de NEGÓCIO (o superadmin não inventa realidade) — distinto do 404 de
 * negação de acesso, que o requireSuperadmin trata.
 */
export const obterTenant = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const [tenant, totalUsuarios] = await Promise.all([
    // Allowlist explícita (TENANT_DETAIL_FIELDS) — ver comentário acima.
    Tenant.findById(id).select(TENANT_DETAIL_FIELDS.join(' ')),
    User.countDocuments({ tenantId: id }),
  ]);

  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  req.audit.set({ action: 'tenant.view', targetTenantId: id });

  res.json({ success: true, data: { tenant, totalUsuarios } });
};

/**
 * GET /admin/tenants/:id/uso — métricas de uso de um tenant (cross-tenant).
 *
 * Lê a DB do tenant via `getTenantDBAdmin` — conexão SEPARADA read-only (Gate 4b):
 * o painel não consegue escrever em dados de tenant, imposto pelo Mongo. Dentro
 * de `tenant_<id>` não há filtro `tenantId` (a DB é o próprio tenant). Contagens
 * em paralelo (Promise.all bounded — 3 contagens).
 */
export const usoTenant = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  const { Cliente, Agendamento, Mensagem } = getModels(getTenantDBAdmin(id));
  const [clientes, agendamentos, mensagens] = await Promise.all([
    Cliente.countDocuments({}),
    Agendamento.countDocuments({}),
    Mensagem.countDocuments({}),
  ]);

  req.audit.set({ action: 'tenant.uso', targetTenantId: id, metadata: { clientes, agendamentos, mensagens } });

  res.json({ success: true, data: { clientes, agendamentos, mensagens } });
};

/**
 * POST /admin/tenants — cria um tenant + admin user associado atomicamente (F06).
 */
export const criarTenant = async (req, { session }) => {
  const { nomeEmpresa, slug: customSlug, planoTipo, adminNome, adminEmail } = req.body;

  // 1. Verificar se o e-mail do admin já está registrado globalmente
  const emailEmUso = await User.findOne({ email: adminEmail }).session(session);
  if (emailEmUso) {
    req.res.status(409);
    throw new Error('Este email já está registrado');
  }

  // 2. Gerar/Resolver slug único
  let baseSlug = (customSlug || nomeEmpresa)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let slug = baseSlug;
  let counter = 1;

  while (await Tenant.findOne({ slug }).session(session)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // 3. Criar Tenant
  const [tenant] = await Tenant.create(
    [
      {
        nome: nomeEmpresa,
        slug,
        plano: {
          tipo: planoTipo || 'basico',
          status: 'trial',
          dataInicio: new Date(),
        },
      },
    ],
    { session }
  );

  // 4. Gerar credenciais temporárias e token de verificação
  const tempPassword = crypto.randomBytes(16).toString('hex') + 'A!1';
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationTokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');

  // 5. Criar primeiro User Admin
  const user = await User.createWithPassword(
    {
      tenantId: tenant._id,
      email: adminEmail,
      password: tempPassword,
      nome: adminNome,
      role: 'admin',
      emailVerificado: false,
      emailVerificationToken: verificationTokenHash,
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 horas
      permissoes: User.getDefaultPermissions('admin'),
    },
    { session }
  );

  // 6. Associar o tenant com o administrador criado
  tenant.criadoPor = user._id;
  await tenant.save({ session });

  // 7. Configurar status 201 no response
  req.res.status(201);

  // 8. Retornar dados estruturados + side-effect pós-commit.
  // O envio do email NÃO corre dentro da transação (withTransaction pode
  // re-executar este callback em erros transientes — enviaria emails duplicados).
  // adminMutation dispara `afterCommit` uma só vez, depois do commit.
  return {
    data: {
      tenantId: tenant._id,
      adminUserId: user._id,
    },
    targetTenantId: tenant._id,
    afterCommit: () => sendEmailVerificationEmail(adminEmail, verificationToken, adminNome),
    before: null,
    after: {
      tenant: {
        nome: tenant.nome,
        slug: tenant.slug,
        planoTipo: tenant.plano.tipo,
      },
      admin: {
        email: user.email,
      },
    },
  };
};

// ---------------------------------------------------------------------------
// F07 — Configure Tenant Plan, Limits & Feature Flags
// ---------------------------------------------------------------------------

/**
 * PUT /admin/tenants/:id/plano — atualiza tipo e/ou dataExpiracao do plano (F07).
 *
 * Whitelisted $set — NUNCA altera plano.status (reservado para F08).
 * Devolve diff GDPR-minimal: só os campos que de facto mudaram.
 */
export const atualizarPlano = async (req, { session }) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.res.status(400);
    throw new Error('ID inválido');
  }

  const tenant = await Tenant.findById(id).session(session);
  if (!tenant) {
    req.res.status(404);
    throw new Error('Tenant não encontrado');
  }

  // Whitelist: só tipo e dataExpiracao — Zod já validou
  const $set = {};
  const before = {};
  const after = {};

  if (req.body.tipo !== undefined) {
    before.tipo = tenant.plano.tipo;
    $set['plano.tipo'] = req.body.tipo;
    after.tipo = req.body.tipo;
  }
  if (req.body.dataExpiracao !== undefined) {
    before.dataExpiracao = tenant.plano.dataExpiracao ?? null;
    $set['plano.dataExpiracao'] = new Date(req.body.dataExpiracao);
    after.dataExpiracao = req.body.dataExpiracao;
  }

  const updated = await Tenant.findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after', session }
  );

  return {
    data: { plano: updated.plano },
    targetTenantId: id,
    before,
    after,
  };
};

/**
 * PUT /admin/tenants/:id/limites — atualiza limites numéricos e feature flags (F07).
 *
 * Whitelisted $set — campos não reconhecidos são ignorados (mass-assignment safe).
 * Devolve diff GDPR-minimal: só os campos efectivamente alterados.
 */
const LIMITES_WHITELIST = [
  'maxUsuarios', 'maxClientes', 'maxAgendamentosMes', 'maxLeads',
  'iaAtiva', 'leadsAtivo', 'whatsappAutomacao', 'lembretesWhatsapp',
  'analytics', 'relatorios', 'exportPdf', 'brandingPersonalizado',
];

export const atualizarLimites = async (req, { session }) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.res.status(400);
    throw new Error('ID inválido');
  }

  const tenant = await Tenant.findById(id).session(session);
  if (!tenant) {
    req.res.status(404);
    throw new Error('Tenant não encontrado');
  }

  const $set = {};
  const before = {};
  const after = {};

  for (const key of LIMITES_WHITELIST) {
    if (req.body[key] !== undefined) {
      before[key] = tenant.limites[key];
      $set[`limites.${key}`] = req.body[key];
      after[key] = req.body[key];
    }
  }

  const updated = await Tenant.findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after', session }
  );

  return {
    data: { limites: updated.limites },
    targetTenantId: id,
    before,
    after,
  };
};

// ---------------------------------------------------------------------------
// F08 — Suspend / Reactivate Tenant
// ---------------------------------------------------------------------------

/**
 * POST /admin/tenants/:id/suspender — suspende um tenant (F08).
 *
 * Seta plano.status = 'suspenso'. O `requirePlan` existente já bloqueia o acesso
 * do staff (status ∉ {ativo, trial} → 403). Idempotente: suspender um já-suspenso
 * sucede e é auditado.
 */
export const suspenderTenant = async (req, { session }) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.res.status(400);
    throw new Error('ID inválido');
  }

  const tenant = await Tenant.findById(id).session(session);
  if (!tenant) {
    req.res.status(404);
    throw new Error('Tenant não encontrado');
  }

  const previousStatus = tenant.plano.status;

  await Tenant.findOneAndUpdate(
    { _id: id },
    { $set: { 'plano.status': 'suspenso' } },
    { returnDocument: 'after', session }
  );

  return {
    data: { status: 'suspenso' },
    targetTenantId: id,
    before: { status: previousStatus },
    after: { status: 'suspenso' },
    metadata: req.body.motivo ? { motivo: req.body.motivo } : {},
  };
};

/**
 * POST /admin/tenants/:id/reactivar — reativa um tenant suspenso (F08).
 *
 * Seta plano.status = 'ativo'. Staff volta a ter acesso via `requirePlan`.
 * Idempotente: reactivar um já-ativo sucede e é auditado.
 */
export const reactivarTenant = async (req, { session }) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    req.res.status(400);
    throw new Error('ID inválido');
  }

  const tenant = await Tenant.findById(id).session(session);
  if (!tenant) {
    req.res.status(404);
    throw new Error('Tenant não encontrado');
  }

  const previousStatus = tenant.plano.status;

  await Tenant.findOneAndUpdate(
    { _id: id },
    { $set: { 'plano.status': 'ativo' } },
    { returnDocument: 'after', session }
  );

  return {
    data: { status: 'ativo' },
    targetTenantId: id,
    before: { status: previousStatus },
    after: { status: 'ativo' },
  };
};

// ---------------------------------------------------------------------------
// F09 — Audit Log Viewer
// ---------------------------------------------------------------------------

/**
 * GET /admin/audit — lista entradas de auditoria (F09).
 *
 * Filtros suportados: targetTenantId, actorUserId, action, status, from, to.
 * Paginação: page, limit. Ordenação fixa: createdAt DESC.
 */
export const listarAudit = async (req, res) => {
  // page/limit chegam já numéricos e com default do `listarAuditSchema`. Sem isso
  // eram NaN quando o cliente os omitia, e `.limit(NaN)` devolvia a colecção toda.
  const { targetTenantId, actorUserId, action, status, from, to, page, limit } = req.query;

  const filter = {};
  if (targetTenantId) filter.targetTenantId = targetTenantId;
  if (actorUserId) filter.actorUserId = actorUserId;
  if (action) filter.action = action;
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  req.audit.set({ action: 'audit.view', metadata: { filters: req.query, returned: data.length } });

  res.json({
    success: true,
    data,
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  });
};

// ---------------------------------------------------------------------------
// F21 — Per-Tenant WhatsApp/Evolution Management (ADR-021 + ADR-024 Fase 4)
// ---------------------------------------------------------------------------

/**
 * Allowlist do subdocumento `whatsapp` exposto por estas rotas.
 *
 * Por INCLUSÃO, como TENANT_DETAIL_FIELDS: um campo novo em `Tenant.whatsapp`
 * (ex.: um segundo token) nasce privado. `whatsapp.instanceToken` NUNCA entra —
 * é a credencial da instância na Evolution e não tem uso no painel.
 */
const WHATSAPP_VIEW_FIELDS = [
  'whatsapp.provider',
  'whatsapp.instanceName',
  'whatsapp.numeroWhatsapp',
  'whatsapp.webhookConfigured',
];

/**
 * Diff auditado destas rotas — `{ instanceName, webhookConfigured }` e nada mais.
 * O token e o QR são credenciais: não vão para `before`/`after`/`metadata`.
 */
const whatsappAuditState = (whatsapp) => ({
  instanceName: whatsapp?.instanceName ?? null,
  webhookConfigured: Boolean(whatsapp?.webhookConfigured),
});

/**
 * URL pública de `/webhook/evolution` (montado em `src/app.js`).
 *
 * `PUBLIC_API_URL` é a base pública do backend. Sem ela não há webhook a
 * configurar e a instância nasceria muda (recebe mensagens, não as entrega) —
 * por isso a criação falha ANTES de tocar na Evolution, em vez de deixar uma
 * instância inútil para trás.
 */
const resolveWebhookUrl = () => {
  const base = process.env.PUBLIC_API_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/webhook/evolution`;
};

/** Traduz o resultado de `getConnectionState` para o contrato da resposta. */
const CONNECTION_STATE_UNKNOWN = 'unknown';

/**
 * GET /admin/tenants/:id/whatsapp — estado da integração WhatsApp de um tenant.
 *
 * Junta os campos allowlisted do Tenant (control-plane) ao estado VIVO da
 * Evolution. A Evolution é infra externa: se estiver em baixo, a resposta é
 * na mesma 200 com `connectionState: 'unknown'` + `evolutionReachable: false` —
 * o painel mostra o que sabe em vez de rebentar com 500.
 *
 * Sem instância configurada não há nada a perguntar à Evolution: devolve
 * `evolutionReachable: false` sem a contactar (não é "está em baixo", é "não foi
 * consultada"; o card distingue os dois casos por `instanceName === null`).
 */
export const obterWhatsappTenant = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id).select(WHATSAPP_VIEW_FIELDS.join(' '));
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  const { provider, instanceName, numeroWhatsapp, webhookConfigured } = tenant.whatsapp ?? {};

  let connectionState = CONNECTION_STATE_UNKNOWN;
  let evolutionReachable = false;

  if (instanceName) {
    const live = await evolutionClient.getConnectionState(instanceName);
    if (live.ok) {
      connectionState = live.state || CONNECTION_STATE_UNKNOWN;
      evolutionReachable = true;
    }
  }

  req.audit.set({
    action: 'tenant.whatsapp.view',
    targetTenantId: id,
    metadata: { instanceName: instanceName ?? null, connectionState, evolutionReachable },
  });

  res.json({
    success: true,
    data: {
      provider: provider ?? 'evolution',
      instanceName: instanceName ?? null,
      numeroWhatsapp: numeroWhatsapp ?? null,
      webhookConfigured: Boolean(webhookConfigured),
      connectionState,
      evolutionReachable,
    },
  });
};

/**
 * POST /admin/tenants/:id/whatsapp/instancia — cria a instância Evolution do tenant.
 *
 * Ordem deliberada: **Evolution primeiro, DB depois**. O `instanceToken` só
 * existe depois de a Evolution criar a instância, por isso não há forma de
 * persistir antes. Uma instância órfã na Evolution é lixo recuperável; um Tenant
 * a apontar para uma instância que não existe é um tenant partido.
 *
 * A chamada externa fica FORA de `work()` — `session.withTransaction` pode
 * re-executar o callback em erro transiente e criaria duas instâncias.
 *
 * Compensação: se a mutação falhar depois da criação, faz logout best-effort e
 * loga o nome da instância órfã para limpeza manual no Manager.
 */
export const criarInstanciaWhatsapp = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id).select('slug whatsapp.instanceName whatsapp.webhookConfigured');
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }
  if (tenant.whatsapp?.instanceName) {
    return res.status(409).json({ success: false, error: 'Tenant já tem uma instância WhatsApp configurada' });
  }

  const instanceName = req.body.instanceName || tenant.slug;
  if (!/^[a-z0-9-]+$/.test(instanceName || '')) {
    // Só alcançável quando o slug do tenant não é slug-válido (dados legados):
    // o body já passou pelo Zod.
    return res.status(400).json({
      success: false,
      error: 'instanceName inválido — indique um nome com apenas minúsculas, números e hífenes',
    });
  }

  // `whatsapp.instanceName` é unique sparse (ADR-021). O índice é a garantia
  // real; este pré-check evita criar na Evolution uma instância que a DB depois
  // recusaria (que seria logo uma órfã a compensar).
  const nomeEmUso = await Tenant.findOne({ 'whatsapp.instanceName': instanceName }).select('_id');
  if (nomeEmUso) {
    return res.status(409).json({ success: false, error: 'Já existe um tenant com esta instância' });
  }

  const webhookUrl = resolveWebhookUrl();
  if (!webhookUrl) {
    logger.error('[F21] PUBLIC_API_URL não configurado — criação de instância abortada antes da Evolution');
    return res.status(500).json({
      success: false,
      error: 'Webhook público não configurado no servidor',
    });
  }

  // Fail-fast, ANTES de tocar na Evolution (evita órfã): o payload do webhook
  // leva `apikey: EVOLUTION_WEBHOOK_SECRET` (evolutionClient.createInstance) e é
  // esse o valor que `webhookAuth.js` compara. Se o secret estiver vazio, a
  // instância nasceria com `webhookConfigured:true` mas o webhook recusaria TODAS
  // as mensagens ("sem secret configurado, recusa sempre") — uma instância muda.
  if (!process.env.EVOLUTION_WEBHOOK_SECRET) {
    logger.error('[F21] EVOLUTION_WEBHOOK_SECRET vazio — criação de instância abortada antes da Evolution');
    return res.status(500).json({
      success: false,
      error: 'Webhook não configurado no servidor',
    });
  }

  const created = await evolutionClient.createInstance(instanceName, { webhookUrl });
  if (!created.ok) {
    // Nunca ecoar `created.error` — pode conter URLs/detalhes internos da Evolution.
    return created.conflict
      ? res.status(409).json({ success: false, error: 'Já existe uma instância com este nome na Evolution' })
      : res.status(502).json({ success: false, error: 'Não foi possível criar a instância na Evolution' });
  }

  const work = async (_req, { session }) => {
    const fresh = await Tenant.findById(id).session(session);
    if (!fresh) {
      req.res.status(404);
      throw new Error('Tenant não encontrado');
    }
    if (fresh.whatsapp?.instanceName) {
      req.res.status(409);
      throw new Error('Tenant já tem uma instância WhatsApp configurada');
    }

    const before = whatsappAuditState(fresh.whatsapp);

    await Tenant.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          'whatsapp.provider': 'evolution',
          'whatsapp.instanceName': instanceName,
          'whatsapp.instanceToken': created.instanceToken,
          'whatsapp.webhookConfigured': true,
          'whatsapp.webhookUrl': webhookUrl,
        },
      },
      { returnDocument: 'after', session },
    );

    // Criação de recurso → 201. O res.json() da factory preserva o statusCode
    // já definido aqui (mesmo mecanismo do `req.res.status(4xx); throw` usado
    // acima). Ver o padrão em criarTenant.
    req.res.status(201);

    return {
      data: { instanceName, connectionState: created.state || 'connecting' },
      targetTenantId: id,
      before,
      after: { instanceName, webhookConfigured: true },
    };
  };

  // A mutação passa pela factory (audit transacional). O `next` é embrulhado
  // para a compensação correr no único ponto em que a factory sinaliza falha.
  return adminMutation('tenant.whatsapp.create', work)(req, res, async (err) => {
    if (err) {
      const undo = await evolutionClient.logoutInstance(instanceName);
      logger.error(
        { tenantId: id, instanceName, compensada: undo.ok },
        '[F21] mutação falhou após criar a instância na Evolution — instância ÓRFÃ, ' +
          'requer remoção manual no Evolution Manager antes de repetir a criação',
      );
    }
    return next(err);
  });
};

/**
 * GET /admin/tenants/:id/whatsapp/qr — QR / pairing code para ligar o dispositivo.
 *
 * Leitura pura (não muta nada). O payload é uma credencial de sessão: chega ao
 * operador na resposta, mas NUNCA aos metadados de auditoria — quem lê o audit
 * log não pode ganhar acesso ao WhatsApp do cliente.
 *
 * Ao contrário do `view`, aqui uma Evolution em baixo é 502: o QR não tem
 * fallback possível — sem Evolution não há nada para mostrar.
 */
export const qrInstanciaWhatsapp = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id).select('whatsapp.instanceName');
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  const instanceName = tenant.whatsapp?.instanceName;
  if (!instanceName) {
    return res.status(404).json({ success: false, error: 'Tenant não tem instância WhatsApp configurada' });
  }

  const qr = await evolutionClient.getConnectQR(instanceName);
  if (!qr.ok) {
    return res.status(502).json({ success: false, error: 'Não foi possível obter o QR code da Evolution' });
  }

  // metadata sem QR/pairingCode — deliberado.
  req.audit.set({ action: 'tenant.whatsapp.qr', targetTenantId: id, metadata: { instanceName } });

  res.json({ success: true, data: { qrBase64: qr.qrBase64, pairingCode: qr.pairingCode } });
};

/**
 * POST /admin/tenants/:id/whatsapp/logout — termina a sessão WhatsApp do tenant.
 *
 * Evolution primeiro, DB depois (mesma razão que a criação: o efeito externo não
 * pode viver dentro da transação). Idempotente: terminar a sessão de uma
 * instância já desligada sucede e fica auditado.
 *
 * NÃO limpa `whatsapp.numeroWhatsapp`: a spec condicionava-o a "se a descoberta
 * mostrar que deriva da sessão" — não deriva. É configurado pelo dono da conta
 * (`authController` /configuracoes) e serve de destino dos alertas à equipa
 * (`notificationWorker`, `leadInternalRoutes`); limpá-lo no logout apagava
 * config do cliente e silenciava alertas por causa de uma reconexão.
 *
 * Também não toca em `whatsapp.health.*` — esse subdocumento é do
 * `evolutionHealthService` (cron), que reconcilia o estado real em minutos.
 * Escrever 'down' aqui dispararia o e-mail de "ligação em baixo" para um logout
 * deliberado.
 *
 * Sobra uma mutação sem alteração de campos: o efeito é externo e a entrada de
 * AuditLog é, ela própria, a escrita transacional. A factory continua a ser o
 * caminho obrigatório de qualquer POST do painel (Gate 2).
 */
export const logoutInstanciaWhatsapp = async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id).select('whatsapp.instanceName whatsapp.webhookConfigured');
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  const instanceName = tenant.whatsapp?.instanceName;
  if (!instanceName) {
    return res.status(404).json({ success: false, error: 'Tenant não tem instância WhatsApp configurada' });
  }

  const out = await evolutionClient.logoutInstance(instanceName);
  // Idempotente (spec F21): uma instância já desligada (`alreadyOff`) ou já
  // inexistente na Evolution (`notFound`) é sucesso — o estado desejado (sem
  // sessão) já foi alcançado. Só um erro genuíno (Evolution em baixo, 5xx)
  // é 502.
  const idempotente = out.notFound || out.alreadyOff;
  if (!out.ok && !idempotente) {
    return res.status(502).json({ success: false, error: 'Não foi possível terminar a sessão na Evolution' });
  }

  const work = async (_req, { session }) => {
    const fresh = await Tenant.findById(id).session(session);
    if (!fresh) {
      req.res.status(404);
      throw new Error('Tenant não encontrado');
    }

    const state = whatsappAuditState(fresh.whatsapp);

    return {
      data: { connectionState: 'close' },
      targetTenantId: id,
      before: state,
      after: state, // logout não altera a configuração — ver docblock
      metadata: { instanceName },
    };
  };

  return adminMutation('tenant.whatsapp.logout', work)(req, res, next);
};

// ---------------------------------------------------------------------------
// F19 — Tenant Users Listing
// ---------------------------------------------------------------------------

/**
 * GET /admin/tenants/:id/users — lista os utilizadores de um tenant (F19).
 *
 * Control-plane: `User` vive na DB partilhada `laura-saas` com um campo
 * `tenantId` — a mesma classe de leitura que `obterTenant`, NÃO envolve
 * `getTenantDBAdmin` (isso é só para dados de negócio dentro de `tenant_<id>`).
 *
 * Allowlist explícita por `.select()` — nunca `passwordHash`, `refreshTokens`,
 * `permissoes`, `twoFactor`, `authVersion`, `dadosBancarios` nem qualquer outro
 * campo de segurança/PII fora da lista. Ordenado `createdAt: 1` para que o
 * primeiro admin criado (o dono da conta) apareça em primeiro lugar.
 */
export const listarUsersTenant = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  const tenant = await Tenant.findById(id);
  if (!tenant) {
    return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
  }

  // Coerção, defaults e cap vêm já feitos do `listarUsersTenantSchema`.
  const { page, limit } = req.query;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    User.find({ tenantId: id })
      .select('nome email role ativo emailVerificado ultimoLogin createdAt')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      // .lean() devolve POJOs sem virtuals. Sem isto, o `toJSON: { virtuals: true }`
      // do UserSchema injectaria `id`, `initials` e `isLocked` na resposta — e o
      // `isLocked` (lê `lockUntil`, que NÃO é seleccionado) daria sempre `false`,
      // uma mentira sobre o estado de bloqueio. Assim a resposta é exactamente os
      // 7 campos do select (+ `_id`).
      .lean(),
    User.countDocuments({ tenantId: id }),
  ]);

  req.audit.set({ action: 'tenant.users', targetTenantId: id });

  res.json({
    success: true,
    data,
    pagination: { total, page, pages: Math.ceil(total / limit), limit },
  });
};
