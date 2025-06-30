const express = require('express');
const router = express.Router();

const {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
} = require('../controllers/whatsappController');

// Rota para notificar cliente (com lógica de negócio)
router.post('/notificar', notificarCliente);
router.post('/notificar-agendamentos-amanha', notificarAgendamentosAmanha);


// Rota para envio direto (debug/testes manuais)
router.post('/send', enviarMensagemDireta);

module.exports = router;
