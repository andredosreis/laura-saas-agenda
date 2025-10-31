import express from 'express';
import { processarConfirmacaoWhatsapp } from '../controllers/webhookController.js';

const router = express.Router();

// POST /webhook/zapi - Recebe mensagens do Z-API
router.post('/zapi', processarConfirmacaoWhatsapp);

// GET /webhook/zapi - Health check
router.get('/zapi', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Webhook Z-API ativo',
    timestamp: new Date().toISOString()
  });
});

export default router;