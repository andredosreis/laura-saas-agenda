import express from 'express';
import {
    getAlertaSessoesBaixas,
    getReceitaTemporal,
    getDistribuicaoServicos,
    getTopClientes
} from '../controllers/analyticsController.js';

const router = express.Router();

// Existing route
router.get('/sessoes-baixas', getAlertaSessoesBaixas);

// 🆕 Phase 2B: Analytics routes
router.get('/receita-temporal', getReceitaTemporal);
router.get('/distribuicao-servicos', getDistribuicaoServicos);
router.get('/top-clientes', getTopClientes);

export default router;