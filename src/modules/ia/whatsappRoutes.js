import express from 'express';
import {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
} from './whatsappController.js';
import { validate } from '../../middlewares/validate.js';
import {
  notificarClienteSchema,
  enviarMensagemDiretaSchema,
  zapiWebhookSchema,
} from './iaSchemas.js';

const router = express.Router();

// Webhook externo — schema loose (não strict) para não bloquear novos campos da Evolution/Z-API
router.post('/webhook', validate(zapiWebhookSchema), zapiWebhook);

// Rotas manuais/administrativas — strict
router.post('/notificar', validate(notificarClienteSchema), notificarCliente);
router.post('/enviar-direta', validate(enviarMensagemDiretaSchema), enviarMensagemDireta);
router.post('/lembretes-amanha', notificarAgendamentosAmanha);

export default router;