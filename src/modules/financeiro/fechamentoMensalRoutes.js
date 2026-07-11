import express from 'express';
import { authenticate, authorize, requirePermission } from '../../middlewares/auth.js';
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

router.get('/', requirePermission('verFinanceiro'), validate(listarFechamentosSchema, 'query'), listarFechamentos);
router.get('/:ano/:mes', requirePermission('verFinanceiro'), validate(paramsAnoMesSchema, 'params'), obterFechamento);

// Acções de governance — admin apenas
router.post('/', requirePermission('editarFinanceiro'), authorize('admin'), validate(criarFechamentoSchema), criarFechamento);
router.delete('/:ano/:mes', requirePermission('editarFinanceiro'), authorize('admin'), validate(paramsAnoMesSchema, 'params'), removerFechamento);

export default router;
