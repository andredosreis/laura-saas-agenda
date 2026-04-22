// @desc    Listar todos os clientes
export const getAllClientes = async (req, res) => {
  try {
    const { Cliente } = req.models;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { tenantId: req.tenantId };

    const [clientes, total] = await Promise.all([
      Cliente.find(filter).populate('pacote').skip(skip).limit(limit).sort({ createdAt: -1 }),
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
    res.status(500).json({ success: false, error: 'Erro interno ao listar clientes.' });
  }
};

// @desc    Criar um novo cliente
export const createCliente = async (req, res) => {
  try {
    const { Cliente } = req.models;
    const { nome, telefone: telefoneBruto, email, dataNascimento, observacoes } = req.body;

    if (!nome || !telefoneBruto) {
      return res.status(400).json({ success: false, error: 'Nome e telefone são obrigatórios.' });
    }

    const telefone = String(telefoneBruto).replace(/[^\d]/g, '');

    const existente = await Cliente.findOne({ tenantId: req.tenantId, telefone });
    if (existente) {
      return res.status(409).json({ success: false, error: 'Já existe um cliente com este telefone.' });
    }

    const salvo = await Cliente.create({
      nome,
      telefone,
      email: email || undefined,
      dataNascimento: dataNascimento || null,
      observacoes: observacoes || '',
      tenantId: req.tenantId,
    });

    res.status(201).json({ success: true, data: salvo });
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Já existe um cliente com este telefone ou email.' });
    }
    if (error.name === 'ValidationError') {
      const msgs = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ success: false, error: msgs });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao criar cliente.' });
  }
};

// @desc    Buscar um cliente pelo ID
export const getCliente = async (req, res) => {
  try {
    const { Cliente } = req.models;
    const cliente = await Cliente.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    }).populate('pacote');

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }
    res.status(200).json(cliente);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao buscar cliente.' });
  }
};

// @desc    Atualizar um cliente pelo ID
export const updateCliente = async (req, res) => {
  try {
    const { Cliente } = req.models;
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
    res.status(500).json({ message: 'Erro interno ao atualizar o cliente.', details: error.message });
  }
};

// @desc    Deletar um cliente pelo ID
export const deleteCliente = async (req, res) => {
  try {
    const { Cliente, Agendamento } = req.models;
    const clienteId = req.params.id;
    const clienteParaDeletar = await Cliente.findOne({ _id: clienteId, tenantId: req.tenantId });

    if (!clienteParaDeletar) {
      return res.status(404).json({ message: 'Cliente não encontrado para deleção.' });
    }
    await Agendamento.deleteMany({ cliente: clienteId, tenantId: req.tenantId });
    await Cliente.deleteOne({ _id: clienteId, tenantId: req.tenantId });
    res.status(200).json({ message: 'Cliente e seus agendamentos associados foram removidos com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar cliente e seus agendamentos:', error);
    res.status(500).json({ message: 'Erro interno ao deletar o cliente.', details: error.message });
  }
};
