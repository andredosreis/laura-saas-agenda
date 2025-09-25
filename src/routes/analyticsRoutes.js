import express from 'express';
// Importamos a função específica que precisamos do controller
import { getAlertaSessoesBaixas } from '../controllers/analyticsController.js';

const router = express.Router();

// A rota agora usa o nome importado diretamente
router.get('/sessoes-baixas', getAlertaSessoesBaixas);

export default router;