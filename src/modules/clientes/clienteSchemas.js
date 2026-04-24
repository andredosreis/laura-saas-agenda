import { z } from 'zod';
import mongoose from 'mongoose';

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

const email = z.string().trim().toLowerCase().email('Email inválido');

export const createClienteSchema = z
  .object({
    nome: z.string().trim().min(1, 'Nome é obrigatório').max(100),
    telefone,
    email: email.optional(),
    dataNascimento: z.coerce.date().optional().nullable(),
    observacoes: z.string().max(1000).optional(),
  })
  .strict();

export const updateClienteSchema = z
  .object({
    nome: z.string().trim().min(1).max(100).optional(),
    telefone: telefone.optional(),
    email: email.optional().nullable(),
    dataNascimento: z.coerce.date().optional().nullable(),
    observacoes: z.string().max(1000).optional(),
  })
  .strict();

export const clienteIdParamSchema = z.object({
  id: objectId,
});
