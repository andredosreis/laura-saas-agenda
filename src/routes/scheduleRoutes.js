import express from 'express';
import { getSchedules, updateSchedule } from '../controllers/scheduleController.js';
const router = express.Router();

// Rota para buscar todos os horários
router.get('/', getSchedules);

// Rota para atualizar um horário específico pelo dia da semana
router.put('/:dayOfWeek', updateSchedule);

export default router;