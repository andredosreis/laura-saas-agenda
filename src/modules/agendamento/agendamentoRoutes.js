import express from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import {
  createAgendamento,
  getAllAgendamentos,
  getAgendamento,
  updateAgendamento,
  updateStatusAgendamento,
  deleteAgendamento,
  confirmarAgendamento,
  enviarLembreteManual,
  registrarPagamentoServico,
  marcarComparecimento,
  fecharPacote,
  getHistorico,
  getStatsMes,
} from './agendamentoController.js';
import {
  createAgendamentoSchema,
  updateAgendamentoSchema,
  updateStatusSchema,
  confirmarAgendamentoSchema,
  comparecimentoSchema,
  fecharPacoteSchema,
  registrarPagamentoSchema,
  enviarLembreteSchema,
  agendamentoIdParamSchema,
} from './agendamentoSchemas.js';

const router = express.Router();

router.use(authenticate);

// Rotas de histórico e estatísticas (antes das rotas com :id)
router.get('/historico', getHistorico);
router.get('/stats/mes', getStatsMes);

// Rotas CRUD para Agendamentos
// RBAC: terapeuta só lê (via filtro resource-level em getAll/getOne);
//       recepcionista cria/edita mas não elimina; gerente/admin têm acesso total.
router.get('/', getAllAgendamentos);
router.post('/', authorize('admin', 'gerente', 'recepcionista'), validate(createAgendamentoSchema), createAgendamento);
router.get('/:id', validate(agendamentoIdParamSchema, 'params'), getAgendamento);
router.put('/:id',
  validate(agendamentoIdParamSchema, 'params'),
  authorize('admin', 'gerente', 'recepcionista'),
  validate(updateAgendamentoSchema),
  updateAgendamento
);
router.patch('/:id/status',
  validate(agendamentoIdParamSchema, 'params'),
  validate(updateStatusSchema),
  updateStatusAgendamento
);
router.delete('/:id',
  validate(agendamentoIdParamSchema, 'params'),
  authorize('admin', 'gerente'),
  deleteAgendamento
);

// Rotas de confirmação e lembretes
router.patch('/:id/confirmar',
  validate(agendamentoIdParamSchema, 'params'),
  validate(confirmarAgendamentoSchema),
  confirmarAgendamento
);
router.post('/:id/enviar-lembrete',
  validate(agendamentoIdParamSchema, 'params'),
  validate(enviarLembreteSchema),
  enviarLembreteManual
);

// Funil de avaliação
router.patch('/:id/comparecimento',
  validate(agendamentoIdParamSchema, 'params'),
  validate(comparecimentoSchema),
  marcarComparecimento
);
router.post('/:id/fechar-pacote',
  validate(agendamentoIdParamSchema, 'params'),
  validate(fecharPacoteSchema),
  fecharPacote
);

// Pagamento de serviço avulso
router.post('/:id/pagamento',
  validate(agendamentoIdParamSchema, 'params'),
  validate(registrarPagamentoSchema),
  registrarPagamentoServico
);

export default router;