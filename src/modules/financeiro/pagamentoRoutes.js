import express from 'express';
import { authenticate, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  listarPagamentos,
  buscarPagamento,
  atualizarPagamento,
  deletarPagamento,
  estatisticasPorFormaPagamento,
  resumoDiario,
  resumoMensal
} from './pagamentoController.js';
import {
  atualizarPagamentoSchema,
  deletarPagamentoSchema,
  idParamSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);

// Rotas de estatísticas e resumos (antes de :id)
router.get('/estatisticas/formas-pagamento', requirePermission('verFinanceiro'), estatisticasPorFormaPagamento);
router.get('/resumo/diario', requirePermission('verFinanceiro'), resumoDiario);
router.get('/resumo/mensal', requirePermission('verFinanceiro'), resumoMensal);

router.get('/', requirePermission('verFinanceiro'), listarPagamentos);
router.get('/:id', requirePermission('verFinanceiro'), validate(idParamSchema, 'params'), buscarPagamento);
router.put('/:id', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(atualizarPagamentoSchema), atualizarPagamento);
router.delete('/:id', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(deletarPagamentoSchema), deletarPagamento);

export default router;
