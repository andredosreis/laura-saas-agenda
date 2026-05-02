import express from 'express';
import { authenticate, authorize, injectTenant } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  listarColaboradores,
  criarColaborador,
  atualizarColaborador,
  desativarColaborador,
  ativarColaborador,
  eliminarColaborador,
  reenviarConvite,
} from './usersController.js';
import {
  criarColaboradorSchema,
  atualizarColaboradorSchema,
  idParamSchema,
} from './usersSchemas.js';

const router = express.Router();

// Todas as rotas exigem autenticação + role admin/superadmin
router.use(authenticate);
router.use(authorize('admin', 'superadmin'));
router.use(injectTenant);

router.get('/', listarColaboradores);
router.post('/', validate(criarColaboradorSchema), criarColaborador);
router.put(
  '/:id',
  validate(idParamSchema, 'params'),
  validate(atualizarColaboradorSchema),
  atualizarColaborador
);
router.patch(
  '/:id/ativar',
  validate(idParamSchema, 'params'),
  ativarColaborador
);
router.post(
  '/:id/reenviar-convite',
  validate(idParamSchema, 'params'),
  reenviarConvite
);
router.patch(
  '/:id/desativar',
  validate(idParamSchema, 'params'),
  desativarColaborador
);
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  eliminarColaborador
);

export default router;
