import express from 'express';
import { authenticate } from '../../middlewares/auth.js';
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

router.post('/abrir', validate(abrirCaixaSchema), abrirCaixa);
router.get('/status', statusCaixa);
router.post('/sangria', validate(sangriaSuprimentoSchema), registrarSangria);
router.post('/suprimento', validate(sangriaSuprimentoSchema), registrarSuprimento);
router.post('/fechar', validate(fecharCaixaSchema), fecharCaixa);
router.get('/relatorio', relatorioCaixas);

export default router;
