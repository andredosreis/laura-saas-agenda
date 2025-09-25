import Agendamento from '../models/Agendamento.js';

// @desc    Criar novo agendamento
export const createAgendamento = async (req, res) => {
  try {
    const novoAgendamento = new Agendamento(req.body);
    await novoAgendamento.save();
    res.status(201).json(novoAgendamento);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Dados inválidos.', details: messages });
    }
    res.status(500).json({ message: 'Erro interno ao criar agendamento.' });
  }
};

// @desc    Listar todos os agendamentos
export const getAllAgendamentos = async (req, res) => {
  try {
    const agendamentos = await Agendamento.find().populate('cliente pacote');
    res.status(200).json(agendamentos);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar agendamentos.', details: error.message });
  }
};

// @desc    Buscar um agendamento por ID
export const getAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id).populate('cliente pacote');
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do agendamento inválido.' });
    }
    res.status(500).json({ message: 'Erro ao buscar agendamento.', details: error.message });
  }
};

// @desc    Atualizar agendamento completo
export const updateAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Dados inválidos.', details: messages });
    }
    res.status(500).json({ message: 'Erro ao atualizar agendamento.', details: error.message });
  }
};

// @desc    Atualizar status do agendamento
export const updateStatusAgendamento = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'O campo status é obrigatório.' });
    }
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar status.', details: error.message });
  }
};

// @desc    Deletar agendamento
export const deleteAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findByIdAndDelete(req.params.id);
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json({ message: 'Agendamento deletado com sucesso.' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do agendamento inválido.' });
    }
    res.status(500).json({ message: 'Erro ao deletar agendamento.', details: error.message });
  }
};