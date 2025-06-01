console.log('ROUTER: Carregando dashboardRoutes.js'); // Adicione este log se ainda não tiver
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

console.log('ROUTER (dashboardRoutes): dashboardController importado é:')

// Rota para buscar  agendamento de hoje
router.get('/agendamentoshoje', dashboardController.getAgendamentosDeHoje);

// Futuramente:
 router.get('/contagemAgendamentosAmanha', dashboardController.getContagemAgendamentosAmanha);
 router.get('/clientesAtendidosSemana', dashboardController.getClientesAtendidosSemana);
 router.get('/totais', dashboardController.getTotaisSistema);
 router.get('/sessoes-baixas', dashboardController.getClientesComSessoesBaixas);
 router.get('/proximos-agendamentos', dashboardController.getProximosAgendamentos);



module.exports = router;