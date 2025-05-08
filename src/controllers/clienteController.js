const Cliente = require('../models/Clientes');
const Pacote = require('../models/Pacote');

// Listar todos os clientes
exports.getAllClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find().populate('pacote');
    res.status(200).json(clientes);
  } catch (error) {
    console.error('Erro ao listar clientes:', error.message);
    res.status(500).json({ error: 'Erro interno ao listar clientes.' });
  }
};

// Criar um novo cliente
exports.createCliente = async (req, res) => {
  try {
    // Log dos dados recebidos (para debug)
    console.log('Dados recebidos:', req.body);

    const novoCliente = new Cliente(req.body);
    const salvo = await novoCliente.save();
    
    res.status(201).json(salvo);
  } catch (error) {
    console.error('Erro ao criar cliente:', error);

    // Tratamento específico para erro de duplicidade (unique: true)
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Erro de validação',
        message: 'Já existe um cliente com este telefone.'
      });
    }

    // Tratamento para erros de validação do Mongoose
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      
      return res.status(400).json({
        error: 'Erro de validação',
        message: 'Dados inválidos',
        details: errors
      });
    }

    // Erro genérico
    res.status(500).json({
      error: 'Erro ao criar cliente',
      message: error.message
    });
  }
};
// Buscar um cliente pelo ID
exports.buscarClientePorId = async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id).populate('pacote');

    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.status(200).json(cliente);
  } catch (error) {
    console.error('Erro ao buscar cliente:', error.message);
    res.status(400).json({ error: 'Erro ao buscar cliente.' });
  }
};

// Atualizar um cliente pelo ID
exports.atualizarCliente = async (req, res) => {
  try {
    const atualizado = await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!atualizado) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.status(200).json(atualizado);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error.message);
    res.status(400).json({ error: 'Erro ao atualizar cliente.' });
  }
};

// Deletar um cliente pelo ID
exports.deletarCliente = async (req, res) => {
  try {
    console.log('Tentando deletar cliente:', req.params.id);
    const excluido = await Cliente.findByIdAndDelete(req.params.id);

    if (!excluido) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    res.status(200).json({ mensagem: 'Cliente removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar cliente:', error.message);
    res.status(500).json({ error: 'Erro ao deletar cliente.' });
  }
};
