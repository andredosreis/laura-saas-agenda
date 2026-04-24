import express from 'express';
import { processarConfirmacaoWhatsapp } from './webhookController.js';
import { validateWebhook } from '../../middlewares/webhookAuth.js';
import { validate } from '../../middlewares/validate.js';
import { evolutionWebhookSchema } from './iaSchemas.js';

const router = express.Router();

// POST /webhook/evolution - Recebe mensagens da Evolution API
// Schema loose: validamos só o que lemos; campos desconhecidos fluem (Evolution evolui o payload)
router.post('/evolution', validateWebhook, validate(evolutionWebhookSchema), processarConfirmacaoWhatsapp);

// GET /webhook/evolution - Health check
router.get('/evolution', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook Evolution API ativo',
    timestamp: new Date().toISOString()
  });
});

export default router;
