import { z } from 'zod';
import mongoose from 'mongoose';
import {
  LEAD_STAGES,
  ORIGEM_VALUES,
  URGENCIA_VALUES,
} from './pipelineConstants.js';

const objectId = z.string().refine(
  (v) => mongoose.Types.ObjectId.isValid(v),
  { message: 'ID inválido' }
);

const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[^\d]/g, ''))
  .refine((v) => v.length >= 9 && v.length <= 15, {
    message: 'Telefone deve ter entre 9 e 15 dígitos',
  });

const emailOpt = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .optional()
  .nullable();

export const createLeadSchema = z
  .object({
    nome: z.string().trim().max(100).optional(),
    telefone,
    email: emailOpt,
    origem: z.enum(ORIGEM_VALUES).optional(), // default no schema do model
    interesse: z.string().trim().max(200).optional(),
    urgencia: z.enum(URGENCIA_VALUES).optional(),
    observacoes: z.string().max(1000).optional(),
  })
  .strict();

export const updateLeadSchema = z
  .object({
    nome: z.string().trim().max(100).optional().nullable(),
    telefone: telefone.optional(),
    email: emailOpt,
    interesse: z.string().trim().max(200).optional().nullable(),
    urgencia: z.enum(URGENCIA_VALUES).optional(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  .strict();

export const moveStageSchema = z
  .object({
    stage: z.enum(LEAD_STAGES),
    motivo: z.string().trim().max(200).optional(),
  })
  .strict();

export const manualReplySchema = z
  .object({
    mensagem: z.string().trim().min(1, 'Mensagem não pode ser vazia').max(4000),
    pausarIa: z.boolean().optional(),
  })
  .strict();

export const convertSchema = z
  .object({
    nome: z.string().trim().min(1).max(100).optional(),    // override opcional
    email: emailOpt,
    observacoes: z.string().max(1000).optional(),
  })
  .strict();

export const pauseAiSchema = z
  .object({
    iaAtiva: z.boolean(),
  })
  .strict();

export const listLeadsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(LEAD_STAGES).optional(),
    origem: z.enum(ORIGEM_VALUES).optional(),
    urgencia: z.enum(URGENCIA_VALUES).optional(),
    q: z.string().trim().max(100).optional(),
  })
  .strict();

export const leadIdParamSchema = z.object({
  id: objectId,
});
