import { z } from 'zod';

export const PLANO_TIPOS = ['basico', 'pro', 'elite', 'custom'];
export const PLANO_STATUSES = ['trial', 'ativo', 'suspenso', 'cancelado', 'expirado'];

const planoTipoSchema = z.enum(PLANO_TIPOS);
const planoStatusSchema = z.enum(PLANO_STATUSES);

export const setup2FASchema = z.object({}).strict();

export const activate2FASchema = z
  .object({
    token: z.string().regex(/^\d{6}$/, 'O código deve ter 6 dígitos'),
  })
  .strict();

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .max(254);

export const criarTenantSchema = z
  .object({
    nomeEmpresa: z.string().trim().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres').max(100),
    slug: z
      .string()
      .trim()
      .lowercase()
      .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens')
      .max(100)
      .optional(),
    planoTipo: planoTipoSchema.optional(),
    adminNome: z.string().trim().min(3, 'Nome do administrador deve ter no mínimo 3 caracteres').max(100),
    adminEmail: email,
  });

// ---------------------------------------------------------------------------
// F07 — Configure Tenant Plan, Limits & Feature Flags
// ---------------------------------------------------------------------------

/**
 * PUT /admin/tenants/:id/plano
 * Whitelist: tipo (enum) + dataExpiracao (ISO date).
 * Nunca altera plano.status (reservado para F08).
 */
export const atualizarPlanoSchema = z
  .object({
    tipo: planoTipoSchema.optional(),
    dataExpiracao: z.iso.datetime({ message: 'dataExpiracao deve ser uma data ISO válida' }).optional(),
  })
  .refine((d) => d.tipo !== undefined || d.dataExpiracao !== undefined, {
    message: 'Pelo menos um campo (tipo ou dataExpiracao) é obrigatório',
  });

/**
 * PUT /admin/tenants/:id/limites
 * Whitelist: limites numéricos (int >= -1, -1 = ilimitado) + feature flags (boolean).
 * Campos extra do body são descartados silenciosamente.
 */
const intLimit = z.number().int().min(-1, 'Limite deve ser >= -1 (-1 = ilimitado)');
const flag = z.boolean();

export const atualizarLimitesSchema = z
  .object({
    maxUsuarios: intLimit.optional(),
    maxClientes: intLimit.optional(),
    maxAgendamentosMes: intLimit.optional(),
    maxLeads: intLimit.optional(),
    iaAtiva: flag.optional(),
    leadsAtivo: flag.optional(),
    whatsappAutomacao: flag.optional(),
    lembretesWhatsapp: flag.optional(),
    analytics: flag.optional(),
    relatorios: flag.optional(),
    exportPdf: flag.optional(),
    brandingPersonalizado: flag.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Pelo menos um campo de limites/flags é obrigatório',
  });

// ---------------------------------------------------------------------------
// F08 — Suspend / Reactivate Tenant
// ---------------------------------------------------------------------------

/**
 * POST /admin/tenants/:id/suspender
 * Body: { motivo? } — razão opcional da suspensão (auditada em metadata).
 * Reactivar não precisa de schema (body vazio).
 */
export const suspenderTenantSchema = z
  .object({
    motivo: z.string().trim().max(500, 'Motivo deve ter no máximo 500 caracteres').optional(),
  });
// ---------------------------------------------------------------------------
// F09 — Audit Log Viewer
// ---------------------------------------------------------------------------

/**
 * GET /admin/audit
 * Validate query parameters for filtering and pagination.
 */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido');

export const listarAuditSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  targetTenantId: objectId.optional(),
  actorUserId: objectId.optional(),
  action: z.string().optional(),
  status: z.enum(['ok', 'denied', 'error']).optional(),
  from: z.iso.datetime({ message: 'from deve ser uma data ISO válida' }).optional(),
  to: z.iso.datetime({ message: 'to deve ser uma data ISO válida' }).optional(),
});

// ---------------------------------------------------------------------------
// F18 — Server-Side Tenant Search, Filters & Stats
// ---------------------------------------------------------------------------

export const listarTenantsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  plano: planoTipoSchema.optional(),
  status: planoStatusSchema.optional(),
});
