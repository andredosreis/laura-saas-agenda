import { z } from 'zod';
import { LEAD_ORIGEM, LEAD_STAGES, LEAD_URGENCIA } from '../types/lead';

const telefone = z
  .string()
  .trim()
  .min(9, 'Telefone deve ter no mínimo 9 dígitos')
  .max(20, 'Telefone deve ter no máximo 20 caracteres')
  .refine((v) => v.replace(/[^\d]/g, '').length >= 9, {
    message: 'Telefone deve ter no mínimo 9 dígitos',
  });

const emailOpt = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .or(z.literal(''))
  .optional();

export const createLeadFormSchema = z.object({
  nome: z.string().trim().max(100).optional(),
  telefone,
  email: emailOpt,
  origem: z.enum(LEAD_ORIGEM).optional(),
  interesse: z.string().trim().max(200).optional(),
  urgencia: z.enum(LEAD_URGENCIA).optional(),
  observacoes: z.string().max(1000).optional(),
});

export const updateLeadFormSchema = createLeadFormSchema.partial();

export const moveStageFormSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  motivo: z.string().trim().max(200).optional(),
});

export const manualReplyFormSchema = z.object({
  mensagem: z.string().trim().min(1, 'Mensagem não pode ser vazia').max(4000),
  pausarIa: z.boolean().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadFormSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadFormSchema>;
export type MoveStageInput = z.infer<typeof moveStageFormSchema>;
export type ManualReplyInput = z.infer<typeof manualReplyFormSchema>;
