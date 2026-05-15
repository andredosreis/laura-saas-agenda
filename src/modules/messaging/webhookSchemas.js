/**
 * webhookSchemas — Zod schemas for the messaging webhook entry point.
 *
 * Loose schemas by design: external WhatsApp providers (Evolution, Z-API)
 * evolve their payload over time. We validate only the fields the
 * controller actually reads; unknown fields flow through unchanged. A
 * strict schema would drop messages in production whenever Evolution
 * adds a field.
 *
 * Moved from `src/modules/ia/iaSchemas.js` as part of F12 Phase 5: this
 * schema is webhook-specific and belongs in messaging/, not in ia/.
 */

import { z } from 'zod';

export const evolutionWebhookSchema = z.looseObject({
  event: z.string().optional(),
  data: z.looseObject({
    key: z.looseObject({ remoteJid: z.string().optional() }).optional(),
  }).optional(),
});
