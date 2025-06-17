const express = require('express');
const router = express.Router();

const financeiroController = require('../controllers/financeiroController');

// Rota para obter a receita mensal atual
router.get('/receita-mensal', financeiroController.getReceitaMensalAtual);

module.exports = router;
