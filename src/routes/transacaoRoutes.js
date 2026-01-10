import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  criarTransacao,
  listarTransacoes,
  buscarTransacao,
  atualizarTransacao,
  cancelarTransacao,
  listarTransacoesPendentes,
  registrarPagamento,
  relatorioPorPeriodo,
  comissoesPendentes,
  pagarComissao
} from '../controllers/transacaoController.js';
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Proteger todas as rotas
router.use(authenticate);

// Rotas CRUD
router.post('/', criarTransacao);
router.get('/', listarTransacoes);
router.get('/pendentes', listarTransacoesPendentes);
router.get('/relatorio/periodo', relatorioPorPeriodo);
router.get('/comissoes/pendentes', comissoesPendentes);
router.get('/:id', validateObjectId, buscarTransacao);
router.put('/:id', validateObjectId, atualizarTransacao);
router.delete('/:id', validateObjectId, cancelarTransacao);

// Rotas de pagamento e comissão
router.post('/:id/pagamento', validateObjectId, registrarPagamento);
router.put('/:id/comissao/pagar', validateObjectId, pagarComissao);

export default router;
