/**
 * conversasRoutes — Inbox de Conversas (FDD fdd-conversas-inbox.md).
 *
 * Rotas autenticadas do painel. Só routing — a lógica vive no controller.
 * O identificador de conversa é o telefone (canónico). Ver ADR-022 para
 * a razão de viverem sob `messaging/` (orquestrador cross-domain).
 */

import { Router } from 'express';
import { authenticate, requirePermission } from '../../../middlewares/auth.js';
import {
  listConversas,
  getConversaMensagens,
  replyConversa,
  pauseConversaIa,
  getIaGlobal,
  setIaGlobal,
} from './conversasController.js';

const router = Router();
router.use(authenticate);

// Master switch da IA da clínica — paths estáticos ANTES das rotas com :telefone.
router.get('/ia-global', requirePermission('verLeads'), getIaGlobal);
router.post('/ia-global', requirePermission('editarConfiguracoes'), setIaGlobal);

router.get('/', requirePermission('verLeads'), listConversas);
router.get('/:telefone/mensagens', requirePermission('verLeads'), getConversaMensagens);
router.post('/:telefone/reply', requirePermission('responderLeads'), replyConversa);
router.post('/:telefone/pause-ai', requirePermission('editarLeads'), pauseConversaIa);

export default router;
