import express from 'express';
import { authenticate } from '../../middlewares/auth.js';
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

router.get('/', getAllClientes);
router.post('/', validate(createClienteSchema), createCliente);
router.get('/:id', validate(clienteIdParamSchema, 'params'), getCliente);
router.put('/:id', validate(clienteIdParamSchema, 'params'), validate(updateClienteSchema), updateCliente);
router.delete('/:id', validate(clienteIdParamSchema, 'params'), deleteCliente);

export default router;