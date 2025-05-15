const Cliente = require('../models/Clientes');
const Pacote = require('../models/Pacote');
const Agendamento = require('../models/Agendamento');

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
// No teu src/controllers/clienteController.js

exports.atualizarCliente = async (req, res) => {
  try {
    const clienteAtualizado = await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true, // Retorna o documento atualizado
        runValidators: true, // MUITO IMPORTANTE: Força o Mongoose a rodar as validações do schema
      }
    );

    if (!clienteAtualizado) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }
    res.status(200).json(clienteAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error); // Para debug no servidor

    if (error.name === 'ValidationError') {
      // Erro de validação do Mongoose
      const mensagens = Object.values(error.errors).map(err => ({
        field: err.path, // Campo que falhou na validação
        message: err.message // Mensagem de erro específica do schema
      }));
      return res.status(400).json({
        message: 'Dados inválidos. Verifique os campos e tente novamente.',
        details: mensagens // Array com os detalhes de cada campo que falhou
      });
    }

    if (error.code === 11000) {
      // Erro de chave duplicada (ex: telefone único)
      // Extrai o campo que causou a duplicidade (pode variar um pouco dependendo da versão do Mongoose/MongoDB)
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        message: `O campo ${field} informado já existe no sistema.`,
        details: [{ field, message: `O ${field} '${error.keyValue[field]}' já está em uso.` }]
      });
    }

    // Outros erros
    res.status(500).json({ message: 'Erro interno ao atualizar o cliente.' });
  }
};

// Deletar um cliente pelo ID
exports.deletarCliente = async (req, res) => {
  try {
    const clienteId = req.params.id;

    // 1. Opcional, mas bom: Verificar se o cliente existe
    const clienteParaDeletar = await Cliente.findById(clienteId);
    if (!clienteParaDeletar) {
      return res.status(404).json({ message: 'Cliente não encontrado para deleção.' });
    }

    // 2. Deletar todos os agendamentos associados a este cliente
    const resultadoDelecaoAgendamentos = await Agendamento.deleteMany({ cliente: clienteId });
    // Log para o servidor (podes remover depois de testar)
    console.log(`Para o cliente ${clienteId}, foram deletados ${resultadoDelecaoAgendamentos.deletedCount} agendamentos.`);

    // 3. Deletar o cliente
    await Cliente.deleteOne({ _id: clienteId });

    res.status(200).json({ message: 'Cliente e seus agendamentos associados foram removidos com sucesso.' });

  } catch (error) {
    console.error('Erro ao deletar cliente e seus agendamentos:', error);
    if (error.name === 'CastError') { // Se o ID fornecido não for um ObjectId válido
        return res.status(400).json({ message: 'ID do cliente inválido para deleção.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao deletar o cliente.', details: error.message });
  }
};
