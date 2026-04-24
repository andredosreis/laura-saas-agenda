import express from 'express';
import { authenticate, injectTenant } from '../../middlewares/auth.js';
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
  editarVenda
} from './compraPacoteController.js';
import {
  venderPacoteSchema,
  editarVendaPacoteSchema,
  estenderPrazoSchema,
  cancelarPacoteSchema,
  idParamSchema,
  clienteIdParamSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);
router.use(injectTenant);

// Rotas de alertas/estatísticas (antes das rotas :id)
router.get('/expirando', pacotesExpirando);
router.get('/alertas', alertasPacotes);
router.get('/estatisticas', estatisticasPacotes);

router.post('/', validate(venderPacoteSchema), venderPacote);
router.get('/', listarComprasPacotes);
router.get('/cliente/:clienteId', validate(clienteIdParamSchema, 'params'), pacotesDoCliente);
router.get('/:id', validate(idParamSchema, 'params'), buscarCompraPacote);

router.put('/:id', validate(idParamSchema, 'params'), validate(editarVendaPacoteSchema), editarVenda);
router.put('/:id/estender-prazo', validate(idParamSchema, 'params'), validate(estenderPrazoSchema), estenderPrazo);
router.put('/:id/cancelar', validate(idParamSchema, 'params'), validate(cancelarPacoteSchema), cancelarPacote);
router.delete('/:id', validate(idParamSchema, 'params'), deletarPacote);

export default router;
