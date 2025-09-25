import express from 'express';
// 1. Importamos as funções específicas que precisamos do controller
import {
  createCliente,
  getAllClientes,
  getCliente,
  updateCliente,
  deleteCliente
} from '../controllers/clienteController.js';

// 2. Importamos o middleware da mesma forma moderna
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Rotas CRUD para Clientes
router.get('/', getAllClientes);
router.post('/', createCliente);

// 3. Usamos os nomes corretos e consistentes das funções importadas
router.get('/:id', validateObjectId, getCliente);
router.put('/:id', validateObjectId, updateCliente);
router.delete('/:id', validateObjectId, deleteCliente);

export default router;