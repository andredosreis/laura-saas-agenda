// src/controllers/clienteController.js


let Agendamento;
try {
  console.log('CONTROLLER (clienteCtrl): Tentando fazer require de ../models/Agendamento');
  Agendamento = require('../models/Agendamento');
  console.log('CONTROLLER (clienteCtrl): Modelo Agendamento CARREGADO COM SUCESSO');
} catch (err) {
  console.error('CONTROLLER (clienteCtrl): FALHA AO FAZER REQUIRE DE AGENDAMENTO:', err);
  throw err;
}

const Cliente = require('../models/Clientes'); // Verifique se o nome do arquivo é Clientes.js ou Cliente.js
const Pacote = require('../models/Pacote');

// Listar todos os clientes
const getAllClientes = async (req, res) => { // Mudado de exports. para const
  try {
    const clientes = await Cliente.find().populate('pacote');
    res.status(200).json(clientes);
  } catch (error) {
    console.error('Erro ao listar clientes:', error.message);
    res.status(500).json({ message: 'Erro interno ao listar clientes.', details: error.message });
  }
};

// Criar um novo cliente
const createCliente = async (req, res) => { // Mudado de exports. para const
  try {
    console.log('Dados recebidos para criar cliente:', req.body);
    const novoCliente = new Cliente(req.body);
    const salvo = await novoCliente.save();
    res.status(201).json(salvo);
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Já existe um cliente com este telefone ou outro campo único.',
        // details: [{ field: Object.keys(error.keyValue)[0], message: 'Valor duplicado.' }] // Mais genérico
      });
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json({ message: 'Dados inválidos ao criar cliente.', details: errors });
    }
    res.status(500).json({ message: 'Erro interno ao criar cliente.', details: error.message });
  }
};

// Buscar um cliente pelo ID
const buscarClientePorId = async (req, res) => { // Mudado de exports. para const
  try {
    const cliente = await Cliente.findById(req.params.id).populate('pacote');
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }
    res.status(200).json(cliente);
  } catch (error) {
    console.error('Erro ao buscar cliente por ID:', error.message);
     if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID do cliente inválido.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao buscar cliente.', details: error.message });
  }
};

// Atualizar um cliente pelo ID
const atualizarCliente = async (req, res) => { // Mudado de exports. para const
  try {
    const clienteAtualizado = await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('pacote');

    if (!clienteAtualizado) {
      return res.status(404).json({ message: 'Cliente não encontrado para atualização.' });
    }
    res.status(200).json(clienteAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    if (error.name === 'ValidationError') {
      const mensagens = Object.values(error.errors).map(err => ({ field: err.path, message: err.message }));
      return res.status(400).json({ message: 'Dados inválidos na atualização.', details: mensagens });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        message: `Na atualização, o campo ${field} com valor '${error.keyValue[field]}' já existe.`,
        details: [{ field, message: `O ${field} '${error.keyValue[field]}' já está em uso.` }]
      });
    }
     if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID do cliente inválido para atualização.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao atualizar o cliente.', details: error.message });
  }
};

// Deletar um cliente pelo ID
const deletarCliente = async (req, res) => { // Mudado de exports. para const
  try {
    const clienteId = req.params.id;
    const clienteParaDeletar = await Cliente.findById(clienteId);
    if (!clienteParaDeletar) {
      return res.status(404).json({ message: 'Cliente não encontrado para deleção.' });
    }
    const resultadoDelecaoAgendamentos = await Agendamento.deleteMany({ cliente: clienteId });
    console.log(`AGENDAMENTOS DELETADOS (clienteCtrl) para o cliente ${clienteId}: ${resultadoDelecaoAgendamentos.deletedCount}`);
    await Cliente.deleteOne({ _id: clienteId });
    res.status(200).json({ message: 'Cliente e seus agendamentos associados foram removidos com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar cliente e seus agendamentos:', error);
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID do cliente inválido para deleção.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao deletar o cliente.', details: error.message });
  }
};

module.exports = {
    getAllClientes,
    createCliente,
    buscarClientePorId,
    atualizarCliente,
    deletarCliente
};