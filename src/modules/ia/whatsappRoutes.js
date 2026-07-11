import express from 'express';
import {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha
} from './whatsappController.js';
import { authenticate, authorize, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  notificarClienteSchema,
  enviarMensagemDiretaSchema,
} from './iaSchemas.js';

const router = express.Router();

// Rotas manuais/administrativas — auth + strict + só admin/gerente podem despachar WhatsApp manualmente
router.post('/notificar',
  authenticate,
  requirePermission('responderLeads'),
  authorize('admin', 'gerente'),
  validate(notificarClienteSchema),
  notificarCliente
);
router.post('/enviar-direta',
  authenticate,
  requirePermission('responderLeads'),
  authorize('admin', 'gerente'),
  validate(enviarMensagemDiretaSchema),
  enviarMensagemDireta
);
router.post('/lembretes-amanha',
  authenticate,
  requirePermission('editarAgendamentos'),
  authorize('admin', 'gerente'),
  notificarAgendamentosAmanha
);

export default router;
