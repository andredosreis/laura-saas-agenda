import express from 'express';
import {
  notificarCliente,
  enviarMensagemDireta
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
// REMOVIDO 2026-07-20: POST /lembretes-amanha (notificarAgendamentosAmanha).
// Lia `Agendamento` do model global (BD partilhada, 0 documentos desde a
// migração DB-per-tenant) e sem filtro de tenantId — devolvia sempre
// "enviados: 0" sem enviar nada. Os lembretes reais são despachados pelo
// worker BullMQ. Corrigi-la em vez de a remover activaria um envio em massa
// dormente que duplicaria esses lembretes.

export default router;
