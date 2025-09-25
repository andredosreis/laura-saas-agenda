import express from 'express';
import {
  createAgendamento,
  getAllAgendamentos,
  getAgendamento,
  updateAgendamento,
  deleteAgendamento,
} from '../controllers/agendamentoController.js';
import validateObjectId from '../middlewares/validateObjectId.js';

const router = express.Router();

// Rotas CRUD para Agendamentos
router.get('/', getAllAgendamentos);
router.post('/', createAgendamento);
router.get('/:id', validateObjectId, getAgendamento);
router.put('/:id', validateObjectId, updateAgendamento);
router.delete('/:id', validateObjectId, deleteAgendamento);

export default router;