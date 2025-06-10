const express = require('express');
const router = express.Router();
const { notificarCliente, enviarMensagemDireta } = require('../controllers/whatsappController');

// Rota para notificar cliente (com lógica de negócio)
router.post('/notificar', notificarCliente);

// Rota para envio direto (debug/testes manuais)
router.post('/send', enviarMensagemDireta);

module.exports = router;
