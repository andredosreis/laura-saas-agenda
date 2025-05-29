// src/routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
 const analyticsController = require('../controllers/analyticsController');
 console.log('ROUTER (analyticsRoutes): analyticsController importado é:', analyticsController);

// Exemplo de rota (pode adicionar depois)
router.get('/alertas/sessoesBaixas', analyticsController.getAlertaSessoesBaixas);

module.exports = router;