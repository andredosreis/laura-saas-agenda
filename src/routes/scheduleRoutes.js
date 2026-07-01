import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  getSchedules,
  updateSchedule,
  getAvailableSlots,
  listarExcecoes,
  criarExcecao,
  actualizarExcecao,
  removerExcecao,
} from '../controllers/scheduleController.js';
import {
  criarExcecaoSchema,
  actualizarExcecaoSchema,
  listarExcecoesQuerySchema,
  excecaoIdParamSchema,
  dayOfWeekParamSchema,
  updateScheduleBodySchema,
} from './scheduleSchemas.js';

const router = express.Router();

router.use(authenticate);

// Rota para buscar todos os horários
router.get('/', getSchedules);

// Slots disponíveis (usado pela marcação e, futuramente, pela IA)
router.get('/available-slots', getAvailableSlots);

// --- Excepções por data (F02) — registadas ANTES de '/:dayOfWeek' ---
// Leitura: qualquer staff autenticado. Escrita: admin/gerente (superadmin bypassa).
router.get('/excecoes', validate(listarExcecoesQuerySchema, 'query'), listarExcecoes);
router.post('/excecoes', authorize('admin', 'gerente'), validate(criarExcecaoSchema), criarExcecao);
router.put(
  '/excecoes/:id',
  authorize('admin', 'gerente'),
  validate(excecaoIdParamSchema, 'params'),
  validate(actualizarExcecaoSchema),
  actualizarExcecao
);
router.delete(
  '/excecoes/:id',
  authorize('admin', 'gerente'),
  validate(excecaoIdParamSchema, 'params'),
  removerExcecao
);

// Rota para atualizar um horário base específico pelo dia da semana
router.put(
  '/:dayOfWeek',
  validate(dayOfWeekParamSchema, 'params'),
  validate(updateScheduleBodySchema),
  updateSchedule
);

export default router;
