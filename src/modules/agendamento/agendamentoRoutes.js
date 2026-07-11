import express from 'express';
import { authenticate, authorize, requirePermission } from '../../middlewares/auth.js';
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
  getIaPendentes,
  ackIaAgendamento,
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
router.get('/historico', requirePermission('verAgendamentos'), getHistorico);
router.get('/stats/mes', requirePermission('verAgendamentos'), getStatsMes);

// 🤖 IA: agendamentos criados pelo agent ainda não vistos pela equipa
router.get('/ia-pendentes', requirePermission('verAgendamentos'), getIaPendentes);
router.post('/:id/ack-ia', requirePermission('editarAgendamentos'), validate(agendamentoIdParamSchema, 'params'), ackIaAgendamento);

// Rotas CRUD para Agendamentos
// RBAC: terapeuta só lê (via filtro resource-level em getAll/getOne);
//       recepcionista cria/edita mas não elimina; gerente/admin têm acesso total.
router.get('/', requirePermission('verAgendamentos'), getAllAgendamentos);
router.post('/', requirePermission('criarAgendamentos'), authorize('admin', 'gerente', 'recepcionista'), validate(createAgendamentoSchema), createAgendamento);
router.get('/:id', requirePermission('verAgendamentos'), validate(agendamentoIdParamSchema, 'params'), getAgendamento);
router.put('/:id',
  requirePermission('editarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  authorize('admin', 'gerente', 'recepcionista'),
  validate(updateAgendamentoSchema),
  updateAgendamento
);
router.patch('/:id/status',
  requirePermission('editarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  validate(updateStatusSchema),
  updateStatusAgendamento
);
router.delete('/:id',
  requirePermission('deletarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  authorize('admin', 'gerente'),
  deleteAgendamento
);

// Rotas de confirmação e lembretes
router.patch('/:id/confirmar',
  requirePermission('editarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  validate(confirmarAgendamentoSchema),
  confirmarAgendamento
);
router.post('/:id/enviar-lembrete',
  requirePermission('editarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  validate(enviarLembreteSchema),
  enviarLembreteManual
);

// Funil de avaliação
router.patch('/:id/comparecimento',
  requirePermission('editarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  validate(comparecimentoSchema),
  marcarComparecimento
);
router.post('/:id/fechar-pacote',
  requirePermission('editarAgendamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  validate(fecharPacoteSchema),
  fecharPacote
);

// Pagamento de serviço avulso
router.post('/:id/pagamento',
  requirePermission('registrarPagamentos'),
  validate(agendamentoIdParamSchema, 'params'),
  validate(registrarPagamentoSchema),
  registrarPagamentoServico
);

export default router;
