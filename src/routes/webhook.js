const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// Endpoint para receber o webhook da Z-API
router.post('/zapi-webhook', whatsappController.zapiWebhook);

module.exports = router;
