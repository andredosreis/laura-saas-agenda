import express from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  criarTransacao,
  listarTransacoes,
  buscarTransacao,
  atualizarTransacao,
  cancelarTransacao,
  deletarTransacao,
  listarTransacoesPendentes,
  registrarPagamento,
  relatorioPorPeriodo,
  comissoesPendentes,
  pagarComissao
} from './transacaoController.js';
import {
  criarTransacaoSchema,
  atualizarTransacaoSchema,
  cancelarTransacaoSchema,
  registrarPagamentoTransacaoSchema,
  pagarComissaoSchema,
  idParamSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);

router.post('/', validate(criarTransacaoSchema), criarTransacao);
router.get('/', listarTransacoes);
router.get('/pendentes', listarTransacoesPendentes);
router.get('/relatorio/periodo', relatorioPorPeriodo);
router.get('/comissoes/pendentes', comissoesPendentes);
router.get('/:id', validate(idParamSchema, 'params'), buscarTransacao);
router.put('/:id', validate(idParamSchema, 'params'), validate(atualizarTransacaoSchema), atualizarTransacao);
router.delete('/:id', authorize('admin', 'superadmin'), validate(idParamSchema, 'params'), deletarTransacao);
router.put('/:id/cancelar', validate(idParamSchema, 'params'), validate(cancelarTransacaoSchema), cancelarTransacao);

router.post('/:id/pagamento',
  validate(idParamSchema, 'params'),
  validate(registrarPagamentoTransacaoSchema),
  registrarPagamento
);
router.put('/:id/comissao/pagar',
  validate(idParamSchema, 'params'),
  validate(pagarComissaoSchema),
  pagarComissao
);

export default router;
