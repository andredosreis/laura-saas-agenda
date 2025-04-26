const express = require('express');
const router = express.Router();
const agendamentoController = require('../controllers/agendamentoController');

// POST - Criar agendamento
router.post('/', agendamentoController.createAgendamento);

// GET - Listar agendamentos
router.get('/', agendamentoController.getAllAgendamentos);

// PUT - Atualizar status do agendamento
router.put('/:id/status', agendamentoController.atualizarStatusAgendamento);




module.exports = router;
