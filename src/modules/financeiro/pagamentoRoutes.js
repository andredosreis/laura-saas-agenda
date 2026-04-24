import express from 'express';
import { authenticate } from '../../middlewares/auth.js';
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
router.get('/estatisticas/formas-pagamento', estatisticasPorFormaPagamento);
router.get('/resumo/diario', resumoDiario);
router.get('/resumo/mensal', resumoMensal);

router.get('/', listarPagamentos);
router.get('/:id', validate(idParamSchema, 'params'), buscarPagamento);
router.put('/:id', validate(idParamSchema, 'params'), validate(atualizarPagamentoSchema), atualizarPagamento);
router.delete('/:id', validate(idParamSchema, 'params'), validate(deletarPagamentoSchema), deletarPagamento);

export default router;
