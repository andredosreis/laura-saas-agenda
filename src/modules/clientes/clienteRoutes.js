import express from 'express';
import { authenticate, requirePermission } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createCliente,
  getAllClientes,
  getCliente,
  updateCliente,
  deleteCliente
} from './clienteController.js';
import {
  createClienteSchema,
  updateClienteSchema,
  clienteIdParamSchema,
} from './clienteSchemas.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('verClientes'), getAllClientes);
router.post('/', requirePermission('criarClientes'), validate(createClienteSchema), createCliente);
router.get('/:id', requirePermission('verClientes'), validate(clienteIdParamSchema, 'params'), getCliente);
router.put('/:id', requirePermission('editarClientes'), validate(clienteIdParamSchema, 'params'), validate(updateClienteSchema), updateCliente);
router.delete('/:id', requirePermission('deletarClientes'), validate(clienteIdParamSchema, 'params'), deleteCliente);

export default router;
