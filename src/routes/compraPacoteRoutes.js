import express from 'express';
import { authenticate, injectTenant } from '../middlewares/auth.js';
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
import mongoose from 'mongoose';

const router = express.Router();

// Middleware para validar clienteId
const validateClienteId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.clienteId)) {
    return res.status(400).json({ message: 'O ID do cliente fornecido é inválido.' });
  }
  next();
};

// Proteger todas as rotas
router.use(authenticate);
router.use(injectTenant);

// Rotas de alertas e estatísticas (antes de :id para evitar conflitos)
router.get('/expirando', pacotesExpirando);
router.get('/alertas', alertasPacotes);
router.get('/estatisticas', estatisticasPacotes);

// Rotas CRUD
router.post('/', venderPacote);
router.get('/', listarComprasPacotes);
router.get('/cliente/:clienteId', validateClienteId, pacotesDoCliente);
router.get('/:id', validateObjectId, buscarCompraPacote);

// Rotas de gestão de pacotes
router.put('/:id/estender-prazo', validateObjectId, estenderPrazo);
router.put('/:id/cancelar', validateObjectId, cancelarPacote);

export default router;
