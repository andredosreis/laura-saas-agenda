import express from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
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
import validateObjectId from '../../middlewares/validateObjectId.js';

const router = express.Router();

// 🆕 Proteger todas as rotas
router.use(authenticate);

// Rotas de histórico e estatísticas (antes das rotas com :id)
router.get('/historico', getHistorico);
router.get('/stats/mes', getStatsMes);

// Rotas CRUD para Agendamentos
// RBAC: terapeuta só lê (via filtro resource-level em getAll/getOne);
//       recepcionista cria/edita mas não elimina; gerente/admin têm acesso total.
router.get('/', getAllAgendamentos);
router.post('/', authorize('admin', 'gerente', 'recepcionista'), createAgendamento);
router.get('/:id', validateObjectId, getAgendamento);
router.put('/:id', validateObjectId, authorize('admin', 'gerente', 'recepcionista'), updateAgendamento);
router.patch('/:id/status', validateObjectId, updateStatusAgendamento);
router.delete('/:id', validateObjectId, authorize('admin', 'gerente'), deleteAgendamento);

// Rotas de confirmação e lembretes
router.patch('/:id/confirmar', validateObjectId, confirmarAgendamento);
router.post('/:id/enviar-lembrete', validateObjectId, enviarLembreteManual);

// Funil de avaliação
router.patch('/:id/comparecimento', validateObjectId, marcarComparecimento);
router.post('/:id/fechar-pacote', validateObjectId, fecharPacote);

// Rota para registrar pagamento de serviço avulso
router.post('/:id/pagamento', validateObjectId, registrarPagamentoServico);

export default router;