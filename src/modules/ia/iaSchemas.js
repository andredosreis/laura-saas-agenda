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

// ─── Webhooks externos (Evolution/Z-API) — NÃO strict ───────────────
// Validamos apenas o que o controller lê. Campos extra vindos da API
// externa devem fluir sem 400 — caso contrário perdemos mensagens em
// produção quando a Evolution adicionar campos novos.

export const evolutionWebhookSchema = z.looseObject({
  event: z.string().optional(),
  data: z.looseObject({
    key: z.looseObject({ remoteJid: z.string().optional() }).optional(),
  }).optional(),
});

export const zapiWebhookSchema = z.looseObject({
  phone: z.string().optional(),
  text: z.looseObject({ message: z.string().optional() }).optional(),
  body: z.looseObject({
    phone: z.string().optional(),
    text: z.looseObject({ message: z.string().optional() }).optional(),
  }).optional(),
  data: z.looseObject({ phone: z.string().optional() }).optional(),
  message: z.string().optional(),
});
