import Pacote from '../models/Pacote.js';

// @desc    Criar um novo pacote
export const createPacote = async (req, res) => {
  try {
    const novoPacote = new Pacote(req.body);
    await novoPacote.save();
    res.status(201).json(novoPacote);
  } catch (error) {
    console.error('Erro ao criar pacote:', error);
    // Tratamento de erro detalhado
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Dados inválidos.', details: messages });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: `O pacote com nome '${req.body.nome}' já existe.` });
    }
    res.status(500).json({ message: 'Erro interno ao criar pacote.' });
  }
};

// @desc    Listar todos os pacotes
export const getAllPacotes = async (req, res) => {
  try {
    const filter = req.tenantFilter || {};
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [pacotes, total] = await Promise.all([
      Pacote.find(filter).skip(skip).limit(limit),
      Pacote.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: pacotes,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar pacotes:', error.message);
    res.status(500).json({ message: 'Erro interno ao buscar todos os pacotes.' });
  }
};

// @desc    Buscar um pacote por ID
export const getPacote = async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...(req.tenantFilter || {}) };
    const pacote = await Pacote.findOne(filter);
    if (!pacote) {
      return res.status(404).json({ message: 'Pacote não encontrado.' });
    }
    res.status(200).json(pacote);
  } catch (error) {
    console.error('Erro ao buscar pacote por ID:', error.message);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do pacote inválido.' });
    }
    res.status(500).json({ message: 'Erro interno ao buscar o pacote.' });
  }
};

// @desc    Atualizar um pacote
export const updatePacote = async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...(req.tenantFilter || {}) };
    const pacote = await Pacote.findOneAndUpdate(
      filter,
      req.body,
      { new: true, runValidators: true }
    );
    if (!pacote) {
      return res.status(404).json({ message: 'Pacote não encontrado para atualização.' });
    }
    res.status(200).json(pacote);
  } catch (error) {
    console.error('Erro ao atualizar pacote:', error);
    // Tratamento de erro detalhado, similar à criação
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: 'Dados inválidos.', details: messages });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: `O nome de pacote '${req.body.nome}' já está em uso.` });
    }
    res.status(500).json({ message: 'Erro interno ao atualizar o pacote.' });
  }
};

// @desc    Deletar um pacote
export const deletePacote = async (req, res) => {
  try {
    const filter = { _id: req.params.id, ...(req.tenantFilter || {}) };
    const pacote = await Pacote.findOneAndDelete(filter);
    if (!pacote) {
      return res.status(404).json({ message: 'Pacote não encontrado para deleção.' });
    }
    res.status(200).json({ message: 'Pacote removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar pacote:', error.message);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do pacote inválido.' });
    }
    res.status(500).json({ message: 'Erro interno ao deletar o pacote.' });
  }
};