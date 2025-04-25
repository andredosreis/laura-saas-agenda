const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');

const validateObjectId = require('../middlewares/validateObjectId');


// Aqui futuramente vamos importar o controller e middlewares

// rota teste
/*router.get('/', (req, res) => {
    res.json({ mensagem: 'Rota de clientes está funcionando!' });
  });*/

  //get/api/clientes
router.get('/', clienteController.getAllClientes);

router.post('/', clienteController.createCliente);

router.get('/:id', validateObjectId, clienteController.buscarClientePorId);

router.delete('/:id', validateObjectId, clienteController.deletarCliente);






module.exports = router;


