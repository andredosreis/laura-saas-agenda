import express from 'express';
import { authenticate, authorize, requirePermission } from '../../middlewares/auth.js';
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

router.post('/', requirePermission('editarFinanceiro'), validate(criarTransacaoSchema), criarTransacao);
router.get('/', requirePermission('verFinanceiro'), listarTransacoes);
router.get('/pendentes', requirePermission('verFinanceiro'), listarTransacoesPendentes);
router.get('/relatorio/periodo', requirePermission('verFinanceiro'), relatorioPorPeriodo);
router.get('/comissoes/pendentes', requirePermission('verFinanceiro'), comissoesPendentes);
router.get('/:id', requirePermission('verFinanceiro'), validate(idParamSchema, 'params'), buscarTransacao);
router.put('/:id', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(atualizarTransacaoSchema), atualizarTransacao);
router.delete('/:id', requirePermission('editarFinanceiro'), authorize('admin', 'superadmin'), validate(idParamSchema, 'params'), deletarTransacao);
router.put('/:id/cancelar', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(cancelarTransacaoSchema), cancelarTransacao);

router.post('/:id/pagamento',
  requirePermission('registrarPagamentos'),
  validate(idParamSchema, 'params'),
  validate(registrarPagamentoTransacaoSchema),
  registrarPagamento
);
router.put('/:id/comissao/pagar',
  requirePermission('editarFinanceiro'),
  validate(idParamSchema, 'params'),
  validate(pagarComissaoSchema),
  pagarComissao
);

export default router;
