import express from 'express';
import { authenticate, injectTenant, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  venderPacote,
  listarComprasPacotes,
  pacotesDoCliente,
  buscarCompraPacote,
  estenderPrazo,
  cancelarPacote,
  pacotesExpirando,
  alertasPacotes,
  estatisticasPacotes,
  deletarPacote,
  editarVenda,
  registrarPagamentoParcela
} from './compraPacoteController.js';
import {
  venderPacoteSchema,
  editarVendaPacoteSchema,
  estenderPrazoSchema,
  cancelarPacoteSchema,
  idParamSchema,
  clienteIdParamSchema,
  registrarPagamentoParcelaSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);
router.use(injectTenant);

// Rotas de alertas/estatísticas (antes das rotas :id)
router.get('/expirando', requirePermission('verFinanceiro'), pacotesExpirando);
router.get('/alertas', requirePermission('verFinanceiro'), alertasPacotes);
router.get('/estatisticas', requirePermission('verFinanceiro'), estatisticasPacotes);

router.post('/', requirePermission('editarFinanceiro'), validate(venderPacoteSchema), venderPacote);
router.get('/', requirePermission('verFinanceiro'), listarComprasPacotes);
router.get('/cliente/:clienteId', requirePermission('verFinanceiro'), validate(clienteIdParamSchema, 'params'), pacotesDoCliente);
router.get('/:id', requirePermission('verFinanceiro'), validate(idParamSchema, 'params'), buscarCompraPacote);

router.put('/:id', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(editarVendaPacoteSchema), editarVenda);
router.post('/:id/registrar-pagamento', requirePermission('registrarPagamentos'), validate(idParamSchema, 'params'), validate(registrarPagamentoParcelaSchema), registrarPagamentoParcela);
router.put('/:id/estender-prazo', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(estenderPrazoSchema), estenderPrazo);
router.put('/:id/cancelar', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), validate(cancelarPacoteSchema), cancelarPacote);
router.delete('/:id', requirePermission('editarFinanceiro'), validate(idParamSchema, 'params'), deletarPacote);

export default router;
