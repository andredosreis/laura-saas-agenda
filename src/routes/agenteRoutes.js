// src/routes/agenteRoutes.js

const express = require('express');
const router = express.Router();
const agenteController = require('../controllers/agenteController');

console.log('ROUTES: Carregando agenteRoutes.js');

// Rota para o agente enviar os lembretes de 24 horas.
// Pode ser acionada por um cron job ou manualmente para testes.
// GET /api/agente/enviar-lembretes-24h
router.get('/enviar-lembretes-24h', agenteController.enviarLembretes24h);

// Rota para receber e processar respostas do WhatsApp (via n8n/webhook)
// POST /api/agente/processar-resposta
router.post('/processar-resposta', agenteController.processarRespostaWhatsapp);

module.exports = router;
