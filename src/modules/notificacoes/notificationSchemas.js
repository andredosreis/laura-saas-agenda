import { z } from 'zod';

// Web Push subscription vem do browser (PushSubscription API) — os campos
// são fixos pela norma W3C. Validamos a forma exacta.
const pushSubscription = z
  .object({
    endpoint: z.string().url('Endpoint inválido').max(500),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(100),
      })
      .strict(),
  })
  .strict();

export const subscribeSchema = z
  .object({
    subscription: pushSubscription,
    userId: z.string().min(1).max(100).optional().nullable(),
    userAgent: z.string().max(500).optional(),
  })
  .strict();

export const unsubscribeSchema = z
  .object({
    endpoint: z.string().url('Endpoint inválido').max(500),
  })
  .strict();

export const subscriptionStatusQuerySchema = z.object({
  userId: z.string().min(1, 'userId é obrigatório').max(100),
});
