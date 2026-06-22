import { z } from 'zod';

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
    planoTipo: z.enum(['basico', 'pro', 'elite', 'custom']).optional(),
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
    tipo: z.enum(['basico', 'pro', 'elite', 'custom']).optional(),
    dataExpiracao: z.string().datetime({ message: 'dataExpiracao deve ser uma data ISO válida' }).optional(),
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
