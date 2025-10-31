import express from 'express';
import {
  createAgendamento,
  getAllAgendamentos,
  getAgendamento,
  updateAgendamento,
  deleteAgendamento,
  confirmarAgendamento,
  enviarLembreteManual,
} from '../controllers/agendamentoController.js';
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Rotas CRUD para Agendamentos
router.get('/', getAllAgendamentos);
router.post('/', createAgendamento);
router.get('/:id', validateObjectId, getAgendamento);
router.put('/:id', validateObjectId, updateAgendamento);
router.delete('/:id', validateObjectId, deleteAgendamento);

// Rotas de confirmação e lembretes
router.patch('/:id/confirmar', validateObjectId, confirmarAgendamento);
router.post('/:id/enviar-lembrete', validateObjectId, enviarLembreteManual);

export default router;