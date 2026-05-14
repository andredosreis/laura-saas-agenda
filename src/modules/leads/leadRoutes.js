import express from 'express';
import { authenticate, checkLimit } from '../../middlewares/auth.js';
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
router.get('/', validate(listLeadsQuerySchema, 'query'), listLeads);

// Criação manual via UI (passa por checkLimit('maxLeads'))
router.post(
  '/',
  checkLimit('maxLeads'),
  validate(createLeadSchema),
  createLead,
);

// Get/Update/Delete por id
router.get('/:id', validate(leadIdParamSchema, 'params'), getLead);
router.put(
  '/:id',
  validate(leadIdParamSchema, 'params'),
  validate(updateLeadSchema),
  updateLead,
);
router.delete('/:id', validate(leadIdParamSchema, 'params'), deleteLead);

// Acções específicas
router.patch(
  '/:id/stage',
  validate(leadIdParamSchema, 'params'),
  validate(moveStageSchema),
  moveStage,
);
router.post(
  '/:id/reply',
  validate(leadIdParamSchema, 'params'),
  validate(manualReplySchema),
  manualReply,
);
router.post(
  '/:id/convert',
  checkLimit('maxClientes'),
  validate(leadIdParamSchema, 'params'),
  validate(convertSchema),
  convertLead,
);
router.post(
  '/:id/pause-ai',
  validate(leadIdParamSchema, 'params'),
  validate(pauseAiSchema),
  toggleAi,
);

export default router;
