import { z } from 'zod';

// Mirroring src/modules/admin/adminSchemas.js (F06/F07/F08) — mesmos campos e
// mensagens, para o erro 400 do backend ser raramente alcançado na prática.

export const PLANO_TIPOS = ['basico', 'pro', 'elite', 'custom'] as const;

export const criarTenantSchema = z.object({
  nomeEmpresa: z.string().trim().min(2, 'Nome da empresa deve ter no mínimo 2 caracteres').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(100)
    .refine((v) => v === '' || /^[a-z0-9-]+$/.test(v), 'Slug deve conter apenas letras minúsculas, números e hífens')
    .optional(),
  planoTipo: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PLANO_TIPOS).optional()),
  adminNome: z.string().trim().min(3, 'Nome do administrador deve ter no mínimo 3 caracteres').max(100),
  adminEmail: z.string().trim().toLowerCase().email('Email inválido').max(254),
});

export type CriarTenantFormValues = z.infer<typeof criarTenantSchema>;

// Form de edição: sempre pré-preenchido com o plano actual, por isso `tipo` é
// obrigatório aqui (ao contrário do PUT parcial no backend).
export const atualizarPlanoSchema = z.object({
  tipo: z.enum(PLANO_TIPOS),
  dataExpiracao: z.string().optional(),
});

export type AtualizarPlanoFormValues = z.infer<typeof atualizarPlanoSchema>;

// Form de edição: sempre pré-preenchido com os limites actuais — todos os
// campos obrigatórios aqui (o PUT parcial no backend aceita subconjuntos).
const intLimit = z.coerce.number().int().min(-1, 'Limite deve ser >= -1 (-1 = ilimitado)');

export const atualizarLimitesSchema = z.object({
  maxUsuarios: intLimit,
  maxClientes: intLimit,
  maxAgendamentosMes: intLimit,
  maxLeads: intLimit,
  iaAtiva: z.boolean(),
  leadsAtivo: z.boolean(),
  whatsappAutomacao: z.boolean(),
  lembretesWhatsapp: z.boolean(),
  analytics: z.boolean(),
  relatorios: z.boolean(),
  exportPdf: z.boolean(),
  brandingPersonalizado: z.boolean(),
});

export type AtualizarLimitesFormValues = z.infer<typeof atualizarLimitesSchema>;

export const suspenderTenantSchema = z.object({
  motivo: z.string().trim().max(500, 'Motivo deve ter no máximo 500 caracteres').optional(),
});

export type SuspenderTenantFormValues = z.infer<typeof suspenderTenantSchema>;
