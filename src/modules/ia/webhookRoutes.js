import express from 'express';
import { processarConfirmacaoWhatsapp } from './webhookController.js';
import { validateWebhook } from '../../middlewares/webhookAuth.js';

const router = express.Router();

// POST /webhook/evolution - Recebe mensagens da Evolution API
router.post('/evolution', validateWebhook, processarConfirmacaoWhatsapp);

// GET /webhook/evolution - Health check
router.get('/evolution', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook Evolution API ativo',
    timestamp: new Date().toISOString()
  });
});

export default router;
