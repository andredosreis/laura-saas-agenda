const express = require('express');
const router = express.Router();
const agendamentoController = require('../controllers/agendamentoController');
console.log('DIAGNÓSTICO ROUTER (agendamentoRoutes) - agendamentoController é:', agendamentoController);

const validateObjectId = require('../middlewares/validateObjectId'); // Adicionado se você for usar

// Criar agendamento
router.post('/', agendamentoController.createAgendamento);

// Listar todos os agendamentos
router.get('/', agendamentoController.getAllAgendamentos);

// Buscar um agendamento específico
router.get('/:id', validateObjectId, agendamentoController.getAgendamento); // Adicionado validateObjectId

// Atualizar um agendamento completo
router.put(
  '/:id',
  validateObjectId, // Adicionado validateObjectId
  agendamentoController.atualizarAgendamento
);

// Atualizar status do agendamento
router.put('/:id/status', validateObjectId, agendamentoController.atualizarStatusAgendamento); // Adicionado validateObjectId

// Deletar agendamento
router.delete('/:id', validateObjectId, agendamentoController.deleteAgendamento); // Adicionado validateObjectId

module.exports = router;