import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
    getAlertaSessoesBaixas,
    getReceitaTemporal,
    getDistribuicaoServicos,
    getTopClientes
} from '../controllers/analyticsController.js';

const router = express.Router();

// Protege todas as rotas de analytics
router.use(authenticate);

// Existing route
router.get('/sessoes-baixas', getAlertaSessoesBaixas);

// 🆕 Phase 2B: Analytics routes
router.get('/receita-temporal', getReceitaTemporal);
router.get('/distribuicao-servicos', getDistribuicaoServicos);
router.get('/top-clientes', getTopClientes);

export default router;