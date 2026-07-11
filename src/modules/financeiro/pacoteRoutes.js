import express from 'express';
import { authenticate, injectTenant, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createPacote,
  getAllPacotes,
  getPacote,
  updatePacote,
  deletePacote
} from './pacoteController.js';
import {
  criarPacoteSchema,
  atualizarPacoteSchema,
  idParamSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);
router.use(injectTenant);

router.get('/', requirePermission('verPacotes'), getAllPacotes);
router.post('/', requirePermission('criarPacotes'), validate(criarPacoteSchema), createPacote);
router.get('/:id', requirePermission('verPacotes'), validate(idParamSchema, 'params'), getPacote);
router.put('/:id', requirePermission('editarPacotes'), validate(idParamSchema, 'params'), validate(atualizarPacoteSchema), updatePacote);
router.delete('/:id', requirePermission('deletarPacotes'), validate(idParamSchema, 'params'), deletePacote);

export default router;
