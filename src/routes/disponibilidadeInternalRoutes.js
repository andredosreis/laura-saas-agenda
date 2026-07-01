/**
 * Rota interna de disponibilidade — consumida pelo `ia-service` Python (F03).
 *
 * Autenticada por X-Service-Token (não JWT). Montada em
 * `/api/internal/disponibilidade` (fora do dual-mount/versionado — ver app.js),
 * ao lado de `/api/internal/clientes` e `/api/internal/leads`.
 */

import express from 'express';
import { requireServiceToken } from '../middlewares/requireServiceToken.js';
import { getDisponibilidadeInterna } from '../controllers/disponibilidadeInternalController.js';

const router = express.Router();

router.use(requireServiceToken);

router.get('/', getDisponibilidadeInterna);

export default router;
