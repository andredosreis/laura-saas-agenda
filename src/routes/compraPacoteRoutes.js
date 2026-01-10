import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  venderPacote,
  listarComprasPacotes,
  pacotesDoCliente,
  buscarCompraPacote,
  estenderPrazo,
  cancelarPacote,
  pacotesExpirando,
  alertasPacotes,
  estatisticasPacotes
} from '../controllers/compraPacoteController.js';
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Proteger todas as rotas
router.use(authenticate);

// Rotas de alertas e estatísticas (antes de :id para evitar conflitos)
router.get('/expirando', pacotesExpirando);
router.get('/alertas', alertasPacotes);
router.get('/estatisticas', estatisticasPacotes);

// Rotas CRUD
router.post('/', venderPacote);
router.get('/', listarComprasPacotes);
router.get('/cliente/:clienteId', validateObjectId, pacotesDoCliente);
router.get('/:id', validateObjectId, buscarCompraPacote);

// Rotas de gestão de pacotes
router.put('/:id/estender-prazo', validateObjectId, estenderPrazo);
router.put('/:id/cancelar', validateObjectId, cancelarPacote);

export default router;
