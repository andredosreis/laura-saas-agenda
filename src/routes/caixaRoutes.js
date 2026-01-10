import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  abrirCaixa,
  statusCaixa,
  registrarSangria,
  registrarSuprimento,
  fecharCaixa,
  relatorioCaixas
} from '../controllers/caixaController.js';

const router = express.Router();

// Proteger todas as rotas
router.use(authenticate);

// Rotas de controle de caixa
router.post('/abrir', abrirCaixa);
router.get('/status', statusCaixa);
router.post('/sangria', registrarSangria);
router.post('/suprimento', registrarSuprimento);
router.post('/fechar', fecharCaixa);
router.get('/relatorio', relatorioCaixas);

export default router;
