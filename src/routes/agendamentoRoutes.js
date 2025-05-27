const express = require('express');
const router = express.Router();
const agendamentoController = require('../controllers/agendamentoController');
console.log('DIAGNÓSTICO ROUTER - agendamentoController é:', agendamentoController);

// Criar agendamento
router.post('/', agendamentoController.createAgendamento);

// Listar todos os agendamentos
router.get('/', agendamentoController.getAllAgendamentos);

// Buscar um agendamento específico
router.get('/:id', agendamentoController.getAgendamento);

// Atualizar status do agendamento
router.put('/:id/status', agendamentoController.atualizarStatusAgendamento);
router.put(
  '/:id',
  // Se você estiver usando o middleware validateObjectId em outras rotas com :id,
  // é uma boa prática adicioná-lo aqui também.
  // Se não o tiver ou não quiser usar agora, pode remover a linha abaixo.
  // validateObjectId, 
  agendamentoController.atualizarAgendamento // Usaremos uma função chamada 'atualizarAgendamento' no controller
);
// Deletar agendamento
router.delete('/:id', agendamentoController.deletarAgendamento);

module.exports = router;