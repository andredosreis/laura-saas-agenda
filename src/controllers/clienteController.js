const Cliente = require('../models/Clientes');

// Get all clients
exports.getAllClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find();
    res.status(200).json(clientes);
  } catch (error) {
    console.error('Erro listar clientes:', error);
    res.status(500).json({  error: 'Erro ao buscar clientes'});
  }
};


// Criar um novo cliente
exports.createCliente = async (req, res) => {
    try {
      const novoCliente = new Cliente(req.body);
      const salvo = await novoCliente.save();
      res.status(201).json(salvo);
    } catch (err) {
      console.error('Erro ao criar cliente:', err.message);
      res.status(400).json({ error: 'Não foi possível salvar o cliente' });
    }
  };
  
  // Buscar um cliente pelo ID
  exports.buscarClientePorId = async (req, res) => {
    try {
      const cliente = await Cliente.findById(req.params.id);
      if (!cliente) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      res.status(200).json(cliente);
    } catch (err) {
      console.error('Erro ao buscar cliente:', err.message);
      res.status(500).json({ error: 'Erro interno ao buscar cliente' });
    }
  };

   // Atualizar um cliente pelo ID
    exports.atualizarCliente = async (req, res) => {
      try {
        const atualizado = await Cliente.findByIdAndUpdate(
          req.params.id,       // ID que vem da URL
          req.body,            // Novos dados do cliente
          { new: true, runValidators: true } // Retorna o objeto atualizado e aplica validações
        );
    
        if (!atualizado) {
          return res.status(404).json({ error: 'Cliente não encontrado' });
        }
    
        res.json(atualizado); // Retorna o cliente atualizado
      } catch (err) {
        console.error('Erro ao atualizar cliente:', err.message);
        res.status(400).json({ error: 'Erro ao atualizar cliente' });
      }
    };
    
      // Deletar um cliente pelo ID
exports.deletarCliente = async (req, res) => {
  try {
    console.log('tentando deletar cliente:', req.params.id);
    const excluido = await Cliente.findByIdAndDelete(req.params.id);

    if (!excluido) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    res.json({ mensagem: 'Cliente removido com sucesso.' });
  } catch (err) {
    console.error('Erro ao deletar cliente:', err.message);
    res.status(500).json({ error: 'Erro ao deletar cliente' });
  }
};
