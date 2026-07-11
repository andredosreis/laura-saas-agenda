import express from 'express';
import { authenticate, requirePermission } from '../middlewares/auth.js';
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
router.get('/agendamentosHoje', requirePermission('verAgendamentos'), getAgendamentosDeHoje);
router.get('/contagemAgendamentosAmanha', requirePermission('verAgendamentos'), getContagemAgendamentosAmanha);
router.get('/agendamentosAmanha', requirePermission('verAgendamentos'), getAgendamentosAmanha);
router.get('/clientesAtendidosSemana', requirePermission('verClientes'), getClientesAtendidosSemana);
router.get('/totais', requirePermission('verClientes'), getTotaisSistema);
router.get('/sessoes-baixas', requirePermission('verClientes'), getClientesComSessoesBaixas);
router.get('/proximos-agendamentos', requirePermission('verAgendamentos'), getProximosAgendamentos);
router.get('/financeiro', requirePermission('verFinanceiro'), getDadosFinanceiros);

// 3. A exportação padrão já estava correta
export default router;
