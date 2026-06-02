/**
 * conversasRoutes — Inbox de Conversas (FDD fdd-conversas-inbox.md).
 *
 * Rotas autenticadas do painel. Só routing — a lógica vive no controller.
 * O identificador de conversa é o telefone (canónico). Ver ADR-022 para
 * a razão de viverem sob `messaging/` (orquestrador cross-domain).
 */

import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.js';
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
router.get('/ia-global', getIaGlobal);
router.post('/ia-global', setIaGlobal);

router.get('/', listConversas);
router.get('/:telefone/mensagens', getConversaMensagens);
router.post('/:telefone/reply', replyConversa);
router.post('/:telefone/pause-ai', pauseConversaIa);

export default router;
