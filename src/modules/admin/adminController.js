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
