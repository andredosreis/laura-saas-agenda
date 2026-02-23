import mongoose from 'mongoose';

// @desc    Criar novo histórico de atendimento
// @route   POST /api/historico-atendimentos
export const criarHistoricoAtendimento = async (req, res) => {
  try {
    const { HistoricoAtendimento, Cliente, Agendamento } = req.models;
    const { cliente, agendamento, ...dadosHistorico } = req.body;

    const clienteExiste = await Cliente.findOne({ _id: cliente, tenantId: req.tenantId });

    if (!clienteExiste) {
      return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
    }

    if (agendamento) {
      const agendamentoExiste = await Agendamento.findOne({ _id: agendamento, tenantId: req.tenantId });
      if (!agendamentoExiste) {
        return res.status(404).json({ success: false, message: 'Agendamento não encontrado' });
      }
    }

    const novoHistorico = new HistoricoAtendimento({
      tenantId: req.tenantId,
      cliente,
      agendamento: agendamento || null,
      profissional: req.user.userId,
      ...dadosHistorico
    });

    await novoHistorico.save();

    const historicoPopulado = await HistoricoAtendimento.findById(novoHistorico._id)
      .populate('cliente', 'nome telefone email')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status');

    res.status(201).json({
      success: true,
      message: 'Histórico de atendimento criado com sucesso',
      data: historicoPopulado
    });

  } catch (error) {
    console.error('Erro ao criar histórico de atendimento:', error);
    res.status(500).json({ success: false, message: 'Erro ao criar histórico de atendimento', error: error.message });
  }
};

// @desc    Listar históricos de atendimento
// @route   GET /api/historico-atendimentos
export const listarHistoricosAtendimento = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const {
      cliente, profissional, status, dataInicio, dataFim,
      page = 1, limit = 20, sortBy = 'dataAtendimento', order = 'desc'
    } = req.query;

    const query = { tenantId: req.tenantId };

    if (cliente) query.cliente = cliente;
    if (profissional) query.profissional = profissional;
    if (status) query.status = status;

    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio);
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const historicos = await HistoricoAtendimento.find(query)
      .populate('cliente', 'nome telefone email')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await HistoricoAtendimento.countDocuments(query);

    res.status(200).json({
      success: true,
      data: historicos,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });

  } catch (error) {
    console.error('Erro ao listar históricos:', error);
    res.status(500).json({ success: false, message: 'Erro ao listar históricos de atendimento', error: error.message });
  }
};

// @desc    Buscar histórico por ID
// @route   GET /api/historico-atendimentos/:id
export const buscarHistoricoPorId = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const historico = await HistoricoAtendimento.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('cliente', 'nome telefone email dataNascimento')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status observacoes');

    if (!historico) {
      return res.status(404).json({ success: false, message: 'Histórico de atendimento não encontrado' });
    }

    res.status(200).json({ success: true, data: historico });

  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar histórico de atendimento', error: error.message });
  }
};

// @desc    Atualizar histórico de atendimento
// @route   PUT /api/historico-atendimentos/:id
export const atualizarHistoricoAtendimento = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const historico = await HistoricoAtendimento.findOne({ _id: req.params.id, tenantId: req.tenantId });

    if (!historico) {
      return res.status(404).json({ success: false, message: 'Histórico de atendimento não encontrado' });
    }

    if (historico.status === 'Finalizado' && !historico.podeEditar) {
      return res.status(400).json({ success: false, message: 'Histórico finalizado não pode ser editado' });
    }

    Object.keys(req.body).forEach(key => {
      if (key !== 'tenantId' && key !== 'cliente' && key !== '_id') {
        historico[key] = req.body[key];
      }
    });

    await historico.save();

    const historicoAtualizado = await HistoricoAtendimento.findById(historico._id)
      .populate('cliente', 'nome telefone email')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status');

    res.status(200).json({ success: true, message: 'Histórico atualizado com sucesso', data: historicoAtualizado });

  } catch (error) {
    console.error('Erro ao atualizar histórico:', error);
    res.status(500).json({ success: false, message: 'Erro ao atualizar histórico de atendimento', error: error.message });
  }
};

// @desc    Finalizar histórico de atendimento
// @route   PUT /api/historico-atendimentos/:id/finalizar
export const finalizarHistoricoAtendimento = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const historico = await HistoricoAtendimento.findOne({ _id: req.params.id, tenantId: req.tenantId });

    if (!historico) {
      return res.status(404).json({ success: false, message: 'Histórico de atendimento não encontrado' });
    }

    if (historico.status === 'Finalizado') {
      return res.status(400).json({ success: false, message: 'Histórico já está finalizado' });
    }

    await historico.finalizar();

    res.status(200).json({ success: true, message: 'Histórico finalizado com sucesso', data: historico });

  } catch (error) {
    console.error('Erro ao finalizar histórico:', error);
    res.status(500).json({ success: false, message: 'Erro ao finalizar histórico de atendimento', error: error.message });
  }
};

// @desc    Deletar histórico de atendimento
// @route   DELETE /api/historico-atendimentos/:id
export const deletarHistoricoAtendimento = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const historico = await HistoricoAtendimento.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });

    if (!historico) {
      return res.status(404).json({ success: false, message: 'Histórico de atendimento não encontrado' });
    }

    res.status(200).json({ success: true, message: 'Histórico deletado com sucesso' });

  } catch (error) {
    console.error('Erro ao deletar histórico:', error);
    res.status(500).json({ success: false, message: 'Erro ao deletar histórico de atendimento', error: error.message });
  }
};

// @desc    Buscar histórico de um cliente específico
// @route   GET /api/historico-atendimentos/cliente/:clienteId
export const buscarHistoricoCliente = async (req, res) => {
  try {
    const { HistoricoAtendimento, Cliente } = req.models;
    const { clienteId } = req.params;
    const { limit = 10 } = req.query;

    const cliente = await Cliente.findOne({ _id: clienteId, tenantId: req.tenantId });

    if (!cliente) {
      return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
    }

    const historicos = await HistoricoAtendimento.find({ cliente: clienteId, tenantId: req.tenantId })
      .populate('profissional', 'nome')
      .populate('agendamento', 'dataHora')
      .sort({ dataAtendimento: -1 })
      .limit(parseInt(limit));

    const stats = {
      totalAtendimentos: historicos.length,
      ultimoAtendimento: historicos[0]?.dataAtendimento || null
    };

    if (historicos.length > 0) {
      const satisfacoes = historicos
        .filter(h => h.satisfacaoCliente)
        .map(h => h.satisfacaoCliente);

      if (satisfacoes.length > 0) {
        stats.mediaSatisfacao = (
          satisfacoes.reduce((a, b) => a + b, 0) / satisfacoes.length
        ).toFixed(1);
      }
    }

    res.status(200).json({ success: true, data: { historicos, stats } });

  } catch (error) {
    console.error('Erro ao buscar histórico do cliente:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar histórico do cliente', error: error.message });
  }
};

// @desc    Buscar técnicas mais utilizadas para um cliente
// @route   GET /api/historico-atendimentos/cliente/:clienteId/tecnicas
export const buscarTecnicasMaisUsadas = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const { clienteId } = req.params;
    const { limite = 5 } = req.query;

    const tecnicas = await HistoricoAtendimento.tecnicasMaisUsadas(clienteId, parseInt(limite));

    res.status(200).json({ success: true, data: tecnicas });

  } catch (error) {
    console.error('Erro ao buscar técnicas:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar técnicas mais utilizadas', error: error.message });
  }
};

// @desc    Estatísticas gerais de atendimentos
// @route   GET /api/historico-atendimentos/stats
export const estatisticasAtendimentos = async (req, res) => {
  try {
    const { HistoricoAtendimento } = req.models;
    const { dataInicio, dataFim } = req.query;

    const tenantIdObj = mongoose.Types.ObjectId.isValid(req.tenantId)
      ? new mongoose.Types.ObjectId(req.tenantId)
      : req.tenantId;

    const query = { tenantId: tenantIdObj, status: 'Finalizado' };

    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio);
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim);
    }

    const totalAtendimentos = await HistoricoAtendimento.countDocuments(query);

    const mediaSatisfacao = await HistoricoAtendimento.aggregate([
      { $match: query },
      { $match: { satisfacaoCliente: { $exists: true, $ne: null } } },
      { $group: { _id: null, media: { $avg: '$satisfacaoCliente' } } }
    ]);

    const servicosMaisRealizados = await HistoricoAtendimento.aggregate([
      { $match: query },
      { $group: { _id: '$servico', quantidade: { $sum: 1 } } },
      { $sort: { quantidade: -1 } },
      { $limit: 5 }
    ]);

    const tecnicasMaisUtilizadas = await HistoricoAtendimento.aggregate([
      { $match: query },
      { $unwind: '$tecnicasUtilizadas' },
      { $group: { _id: '$tecnicasUtilizadas', quantidade: { $sum: 1 } } },
      { $sort: { quantidade: -1 } },
      { $limit: 5 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalAtendimentos,
        mediaSatisfacao: mediaSatisfacao[0]?.media?.toFixed(1) || 0,
        servicosMaisRealizados,
        tecnicasMaisUtilizadas
      }
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas de atendimentos', error: error.message });
  }
};

export default {
  criarHistoricoAtendimento,
  listarHistoricosAtendimento,
  buscarHistoricoPorId,
  atualizarHistoricoAtendimento,
  finalizarHistoricoAtendimento,
  deletarHistoricoAtendimento,
  buscarHistoricoCliente,
  buscarTecnicasMaisUsadas,
  estatisticasAtendimentos
};
