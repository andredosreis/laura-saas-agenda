import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getSchedules, updateSchedule, getAvailableSlots } from '../controllers/scheduleController.js';
const router = express.Router();

router.use(authenticate);

// Rota para buscar todos os horários
router.get('/', getSchedules);

// Rota para atualizar um horário específico pelo dia da semana
router.put('/:dayOfWeek', updateSchedule);
router.get('/available-slots', getAvailableSlots);

export default router;