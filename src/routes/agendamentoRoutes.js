const express = require('express');
const router = express.Router();
const agendamentoController = require('../controllers/agendamentoController');

// Criar agendamento
router.post('/', agendamentoController.createAgendamento);

// Listar todos os agendamentos
router.get('/', agendamentoController.getAllAgendamentos);

// Buscar um agendamento específico
router.get('/:id', agendamentoController.getAgendamento);

// Atualizar status do agendamento
router.put('/:id/status', agendamentoController.atualizarStatusAgendamento);

// Deletar agendamento
router.delete('/:id', agendamentoController.deleteAgendamento);

module.exports = router;