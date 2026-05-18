/**
 * webhookRoutes — POST /webhook/evolution mount point.
 *
 * Moved from `src/modules/ia/webhookRoutes.js` as part of F12 Phase 5.
 * The webhook is the cross-cutting entry point for inbound WhatsApp; it
 * belongs in messaging/ per ADR-022, not in the ia/ domain module.
 */

import express from 'express';
import { processarConfirmacaoWhatsapp } from './controllers/webhookController.js';
import { validateWebhook } from '../../middlewares/webhookAuth.js';
import { validate } from '../../middlewares/validate.js';
import { evolutionWebhookSchema } from './webhookSchemas.js';

const router = express.Router();

// POST /webhook/evolution — receives messages from Evolution API.
// Schema is loose: we validate only what the controller reads; unknown
// fields flow through unchanged so a payload evolution upstream does not
// break message intake.
router.post(
  '/evolution',
  validateWebhook,
  validate(evolutionWebhookSchema),
  processarConfirmacaoWhatsapp,
);

// GET /webhook/evolution — health check (used by Evolution to verify the URL)
router.get('/evolution', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook Evolution API ativo',
    timestamp: new Date().toISOString(),
  });
});

export default router;
