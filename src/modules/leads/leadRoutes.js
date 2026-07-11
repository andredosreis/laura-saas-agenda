import express from 'express';
import { authenticate, checkLimit, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  listLeads,
  createLead,
  getLead,
  updateLead,
  deleteLead,
  moveStage,
  manualReply,
  convertLead,
  toggleAi,
} from './leadController.js';
import {
  createLeadSchema,
  updateLeadSchema,
  moveStageSchema,
  manualReplySchema,
  convertSchema,
  pauseAiSchema,
  listLeadsQuerySchema,
  leadIdParamSchema,
} from './leadSchemas.js';

const router = express.Router();

router.use(authenticate);

// Listagem + filtros (?status, ?origem, ?urgencia, ?q, ?page, ?limit)
router.get('/', requirePermission('verLeads'), validate(listLeadsQuerySchema, 'query'), listLeads);

// Criação manual via UI (passa por checkLimit('maxLeads'))
router.post(
  '/',
  requirePermission('criarLeads'),
  checkLimit('maxLeads'),
  validate(createLeadSchema),
  createLead,
);

// Get/Update/Delete por id
router.get('/:id', requirePermission('verLeads'), validate(leadIdParamSchema, 'params'), getLead);
router.put(
  '/:id',
  requirePermission('editarLeads'),
  validate(leadIdParamSchema, 'params'),
  validate(updateLeadSchema),
  updateLead,
);
router.delete('/:id', requirePermission('deletarLeads'), validate(leadIdParamSchema, 'params'), deleteLead);

// Acções específicas
router.patch(
  '/:id/stage',
  requirePermission('editarLeads'),
  validate(leadIdParamSchema, 'params'),
  validate(moveStageSchema),
  moveStage,
);
router.post(
  '/:id/reply',
  requirePermission('responderLeads'),
  validate(leadIdParamSchema, 'params'),
  validate(manualReplySchema),
  manualReply,
);
router.post(
  '/:id/convert',
  requirePermission('editarLeads'),
  checkLimit('maxClientes'),
  validate(leadIdParamSchema, 'params'),
  validate(convertSchema),
  convertLead,
);
router.post(
  '/:id/pause-ai',
  requirePermission('editarLeads'),
  validate(leadIdParamSchema, 'params'),
  validate(pauseAiSchema),
  toggleAi,
);

export default router;
