const express = require('express');
const router = express.Router();
const pacoteController = require('../controllers/pacoteController');

// GET /api/pacotes
router.get('/', pacoteController.getAllPacotes);

module.exports = router;

// Criar novo pacote
router.post('/', pacoteController.createPacote);

// Buscar pacote por ID
router.get('/:id', pacoteController.getPacotePorId);

// Atualizar pacote por ID
router.put('/:id', pacoteController.atualizarPacote);

//deletar pacote
router.delete('/:id', pacoteController.deletarPacote);
