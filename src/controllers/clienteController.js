import Agendamento from '../models/Agendamento.js';
import Cliente from '../models/Cliente.js';

// @desc    Listar todos os clientes
export const getAllClientes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { tenantId: req.tenantId };

    const [clientes, total] = await Promise.all([
      Cliente.find(filter).populate('pacote').skip(skip).limit(limit),
      Cliente.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: clientes,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error('Erro ao listar clientes:', error.message);
    res.status(500).json({ message: 'Erro interno ao listar clientes.', details: error.message });
  }
};

// @desc    Criar um novo cliente
export const createCliente = async (req, res) => {
  try {
    // 🆕 Injetar tenantId do usuário logado e garantir que não venha do body
    const novoCliente = new Cliente({
      ...req.body,
      tenantId: req.tenantId
    });
    const salvo = await novoCliente.save();
    res.status(201).json(salvo);
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Já existe um cliente com este telefone ou outro campo único.',
      });
    }
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({ field: err.path, message: err.message }));
      return res.status(400).json({ message: 'Dados inválidos ao criar cliente.', details: errors });
    }
    res.status(500).json({ message: 'Erro interno ao criar cliente.', details: error.message });
  }
};

// @desc    Buscar um cliente pelo ID
export const getCliente = async (req, res) => {
  try {
    // 🆕 Garantir que o cliente pertença ao tenant
    const cliente = await Cliente.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    }).populate('pacote');

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

// @desc    Atualizar um cliente pelo ID
export const updateCliente = async (req, res) => {
  try {
    // 🆕 Garantir update apenas no tenant correto
    const clienteAtualizado = await Cliente.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true, runValidators: true }
    ).populate('pacote');

    if (!clienteAtualizado) {
      return res.status(404).json({ message: 'Cliente não encontrado para atualização.' });
    }
    res.status(200).json(clienteAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar cliente:', error);
    // ... (seu excelente tratamento de erros continua aqui)
    res.status(500).json({ message: 'Erro interno ao atualizar o cliente.', details: error.message });
  }
};

// @desc    Deletar um cliente pelo ID
export const deleteCliente = async (req, res) => {
  try {
    const clienteId = req.params.id;
    // 🆕 Garantir deleção apenas no tenant correto
    const clienteParaDeletar = await Cliente.findOne({ _id: clienteId, tenantId: req.tenantId });

    if (!clienteParaDeletar) {
      return res.status(404).json({ message: 'Cliente não encontrado para deleção.' });
    }
    await Agendamento.deleteMany({ cliente: clienteId, tenantId: req.tenantId }); // Também deletar agendamentos do tenant
    await Cliente.deleteOne({ _id: clienteId });
    res.status(200).json({ message: 'Cliente e seus agendamentos associados foram removidos com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar cliente e seus agendamentos:', error);
    // ... (seu excelente tratamento de erros continua aqui)
    res.status(500).json({ message: 'Erro interno ao deletar o cliente.', details: error.message });
  }
};