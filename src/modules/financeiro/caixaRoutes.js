import express from 'express';
import { authenticate, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  abrirCaixa,
  statusCaixa,
  registrarSangria,
  registrarSuprimento,
  fecharCaixa,
  relatorioCaixas
} from './caixaController.js';
import {
  abrirCaixaSchema,
  sangriaSuprimentoSchema,
  fecharCaixaSchema,
} from './financeiroSchemas.js';

const router = express.Router();

router.use(authenticate);

router.post('/abrir', requirePermission('editarFinanceiro'), validate(abrirCaixaSchema), abrirCaixa);
router.get('/status', requirePermission('verFinanceiro'), statusCaixa);
router.post('/sangria', requirePermission('editarFinanceiro'), validate(sangriaSuprimentoSchema), registrarSangria);
router.post('/suprimento', requirePermission('editarFinanceiro'), validate(sangriaSuprimentoSchema), registrarSuprimento);
router.post('/fechar', requirePermission('editarFinanceiro'), validate(fecharCaixaSchema), fecharCaixa);
router.get('/relatorio', requirePermission('verFinanceiro'), relatorioCaixas);

export default router;
