import express from 'express';
import { authenticate, injectTenant } from '../../middlewares/auth.js';
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

router.get('/', getAllPacotes);
router.post('/', validate(criarPacoteSchema), createPacote);
router.get('/:id', validate(idParamSchema, 'params'), getPacote);
router.put('/:id', validate(idParamSchema, 'params'), validate(atualizarPacoteSchema), updatePacote);
router.delete('/:id', validate(idParamSchema, 'params'), deletePacote);

export default router;