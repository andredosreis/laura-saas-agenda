const express = require('express');
const router = express.Router();

const {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
} = require('../controllers/whatsappController');
const agenteController = require('../controllers/agenteController');

// Rota para notificar cliente (com lógica de negócio)
router.post('/notificar', notificarCliente);
router.post('/notificar-agendamentos-amanha', notificarAgendamentosAmanha);

// Rota principal do webhook (Z-API deve apontar para /webhook)
router.post('/', (req, res, next) => {
  console.log('Webhook recebido! Body:', req.body);
  next();
}, agenteController.processarRespostaWhatsapp);

// Rota para envio direto (debug/testes manuais)
router.post('/send', enviarMensagemDireta);

module.exports = router;