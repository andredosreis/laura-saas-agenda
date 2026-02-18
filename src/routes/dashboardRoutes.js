import express from 'express';
import { authenticate } from '../middlewares/auth.js';
// 1. Importamos todas as funções necessárias do controller de forma nomeada
import {
  getAgendamentosDeHoje,
  getContagemAgendamentosAmanha,
  getAgendamentosAmanha,
  getClientesAtendidosSemana,
  getTotaisSistema,
  getClientesComSessoesBaixas,
  getProximosAgendamentos,
  getDadosFinanceiros,
} from '../controllers/dashboardController.js';

const router = express.Router();

// Protege todas as rotas do dashboard
router.use(authenticate);

// 2. Definimos as rotas usando as funções importadas diretamente
router.get('/agendamentosHoje', getAgendamentosDeHoje);
router.get('/contagemAgendamentosAmanha', getContagemAgendamentosAmanha);
router.get('/agendamentosAmanha', getAgendamentosAmanha);
router.get('/clientesAtendidosSemana', getClientesAtendidosSemana);
router.get('/totais', getTotaisSistema);
router.get('/sessoes-baixas', getClientesComSessoesBaixas);
router.get('/proximos-agendamentos', getProximosAgendamentos);
router.get('/financeiro', getDadosFinanceiros);

// 3. A exportação padrão já estava correta
export default router;