import { z } from 'zod';

const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 9 && v.length <= 20, {
    message: 'Telefone inválido',
  });

// ─── Endpoints internos (admin-only) — strict ───────────────────────

export const notificarClienteSchema = z
  .object({
    telefone,
    mensagem: z.string().trim().min(1, 'Mensagem é obrigatória').max(4000),
  })
  .strict();

export const enviarMensagemDiretaSchema = z
  .object({
    to: telefone,
    body: z.string().trim().min(1, 'Corpo da mensagem é obrigatório').max(4000),
  })
  .strict();
