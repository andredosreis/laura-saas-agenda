import express from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
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
router.get('/sessoes-baixas', requirePermission('verClientes'), getAlertaSessoesBaixas);

// 🆕 Phase 2B: Analytics routes
router.get('/receita-temporal', requirePermission('verFinanceiro'), getReceitaTemporal);
router.get('/distribuicao-servicos', requirePermission('verFinanceiro'), getDistribuicaoServicos);
router.get('/top-clientes', requirePermission('verClientes'), getTopClientes);

export default router;
