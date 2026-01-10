import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  listarPagamentos,
  buscarPagamento,
  atualizarPagamento,
  deletarPagamento,
  estatisticasPorFormaPagamento,
  resumoDiario,
  resumoMensal
} from '../controllers/pagamentoController.js';
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Proteger todas as rotas
router.use(authenticate);

// Rotas de estatísticas e resumos (antes de :id)
router.get('/estatisticas/formas-pagamento', estatisticasPorFormaPagamento);
router.get('/resumo/diario', resumoDiario);
router.get('/resumo/mensal', resumoMensal);

// Rotas CRUD
router.get('/', listarPagamentos);
router.get('/:id', validateObjectId, buscarPagamento);
router.put('/:id', validateObjectId, atualizarPagamento);
router.delete('/:id', validateObjectId, deletarPagamento);

export default router;
