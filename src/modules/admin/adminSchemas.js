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
