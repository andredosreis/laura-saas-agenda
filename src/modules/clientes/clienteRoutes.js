import express from 'express';
import { authenticate } from '../../middlewares/auth.js';
import {
  createCliente,
  getAllClientes,
  getCliente,
  updateCliente,
  deleteCliente
} from './clienteController.js';
import validateObjectId from '../../middlewares/validateObjectId.js';

const router = express.Router();

// 🆕 Proteger todas as rotas
router.use(authenticate);

// Rotas CRUD para Clientes
router.get('/', getAllClientes);
router.post('/', createCliente);

// 3. Usamos os nomes corretos e consistentes das funções importadas
router.get('/:id', validateObjectId, getCliente);
router.put('/:id', validateObjectId, updateCliente);
router.delete('/:id', validateObjectId, deleteCliente);

export default router;