import express from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  criarFechamento,
  listarFechamentos,
  obterFechamento,
  removerFechamento,
} from './fechamentoMensalController.js';
import {
  criarFechamentoSchema,
  paramsAnoMesSchema,
  listarFechamentosSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);

router.get('/', validate(listarFechamentosSchema, 'query'), listarFechamentos);
router.get('/:ano/:mes', validate(paramsAnoMesSchema, 'params'), obterFechamento);

// Acções de governance — admin apenas
router.post('/', authorize('admin'), validate(criarFechamentoSchema), criarFechamento);
router.delete('/:ano/:mes', authorize('admin'), validate(paramsAnoMesSchema, 'params'), removerFechamento);

export default router;
