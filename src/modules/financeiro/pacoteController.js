// @desc    Criar um novo pacote
export const createPacote = async (req, res) => {
  try {
    const { Pacote } = req.models;
    // Campos explícitos — nunca passar req.body directamente (mass assignment)
    const { nome, categoria, sessoes, valor, descricao, ativo } = req.body;
    const novoPacote = new Pacote({ nome, categoria, sessoes, valor, descricao, ativo, tenantId: req.tenantId });
    await novoPacote.save();
    res.status(201).json({ success: true, data: novoPacote });
  } catch (error) {
    console.error('Erro ao criar pacote:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, error: messages.join(' ') || 'Dados inválidos.' });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: `Já existe um serviço com o nome '${req.body.nome}'.` });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao criar serviço.' });
  }
};

// @desc    Listar todos os pacotes
export const getAllPacotes = async (req, res) => {
  try {
    const { Pacote } = req.models;
    const filter = { tenantId: req.tenantId };
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [pacotes, total] = await Promise.all([
      Pacote.find(filter).sort({ ativo: -1, nome: 1 }).skip(skip).limit(limit),
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
    res.status(500).json({ success: false, error: 'Erro interno ao buscar serviços.' });
  }
};

// @desc    Buscar um pacote por ID
export const getPacote = async (req, res) => {
  try {
    const { Pacote } = req.models;
    const pacote = await Pacote.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!pacote) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado.' });
    }
    res.status(200).json({ success: true, data: pacote });
  } catch (error) {
    console.error('Erro ao buscar pacote por ID:', error.message);
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'ID do serviço inválido.' });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao buscar o serviço.' });
  }
};

// @desc    Atualizar um pacote
export const updatePacote = async (req, res) => {
  try {
    const { Pacote } = req.models;
    // Campos explícitos — nunca passar req.body directamente (mass assignment)
    const { nome, categoria, sessoes, valor, descricao, ativo } = req.body;
    const camposActualizaveis = { nome, categoria, sessoes, valor, descricao, ativo };
    Object.keys(camposActualizaveis).forEach((key) => {
      if (camposActualizaveis[key] === undefined) delete camposActualizaveis[key];
    });
    const pacote = await Pacote.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      camposActualizaveis,
      { new: true, runValidators: true }
    );
    if (!pacote) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado.' });
    }
    res.status(200).json({ success: true, data: pacote });
  } catch (error) {
    console.error('Erro ao atualizar pacote:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, error: messages.join(' ') || 'Dados inválidos.' });
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: `Já existe um serviço com o nome '${req.body.nome}'.` });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao atualizar o serviço.' });
  }
};

// @desc    Deletar um pacote
export const deletePacote = async (req, res) => {
  try {
    const { Pacote } = req.models;
    const pacote = await Pacote.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!pacote) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado.' });
    }
    res.status(200).json({ success: true, data: { _id: pacote._id } });
  } catch (error) {
    console.error('Erro ao deletar pacote:', error.message);
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'ID do serviço inválido.' });
    }
    res.status(500).json({ success: false, error: 'Erro interno ao remover o serviço.' });
  }
};
