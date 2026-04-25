import express from 'express';
import {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
} from './whatsappController.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  notificarClienteSchema,
  enviarMensagemDiretaSchema,
  zapiWebhookSchema,
} from './iaSchemas.js';

const router = express.Router();

// Webhook externo — schema loose (não strict) para não bloquear novos campos da Evolution/Z-API
// Permanece público (sem authenticate): o token de webhook é validado no payload pela Z-API
router.post('/webhook', validate(zapiWebhookSchema), zapiWebhook);

// Rotas manuais/administrativas — auth + strict + só admin/gerente podem despachar WhatsApp manualmente
router.post('/notificar',
  authenticate,
  authorize('admin', 'gerente'),
  validate(notificarClienteSchema),
  notificarCliente
);
router.post('/enviar-direta',
  authenticate,
  authorize('admin', 'gerente'),
  validate(enviarMensagemDiretaSchema),
  enviarMensagemDireta
);
router.post('/lembretes-amanha',
  authenticate,
  authorize('admin', 'gerente'),
  notificarAgendamentosAmanha
);

export default router;