import HistoricoAtendimento from '../models/HistoricoAtendimento.js';
import Cliente from '../models/Cliente.js';
import Agendamento from '../models/Agendamento.js';
import mongoose from 'mongoose';

/**
 * Controller: HistoricoAtendimento
 *
 * Gerencia o histórico de atendimentos realizados
 *
 * @author Laura SaaS Team
 * @version 1.0.0
 */

// ============================================
// @desc    Criar novo histórico de atendimento
// @route   POST /api/historico-atendimentos
// @access  Private
// ============================================
export const criarHistoricoAtendimento = async (req, res) => {
  try {
    const { cliente, agendamento, ...dadosHistorico } = req.body;

    // Validar se o cliente existe e pertence ao tenant
    const clienteExiste = await Cliente.findOne({
      _id: cliente,
      tenantId: req.tenantId
    });

    if (!clienteExiste) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    // Se tiver agendamento, validar
    if (agendamento) {
      const agendamentoExiste = await Agendamento.findOne({
        _id: agendamento,
        tenantId: req.tenantId
      });

      if (!agendamentoExiste) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
    }

    // Criar histórico
    const novoHistorico = new HistoricoAtendimento({
      tenantId: req.tenantId,
      cliente,
      agendamento: agendamento || null,
      profissional: req.user.userId,
      ...dadosHistorico
    });

    await novoHistorico.save();

    // Popular dados para retorno
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
    res.status(500).json({
      success: false,
      message: 'Erro ao criar histórico de atendimento',
      error: error.message
    });
  }
};

// ============================================
// @desc    Listar históricos de atendimento
// @route   GET /api/historico-atendimentos
// @access  Private
// ============================================
export const listarHistoricosAtendimento = async (req, res) => {
  try {
    const {
      cliente,
      profissional,
      status,
      dataInicio,
      dataFim,
      page = 1,
      limit = 20,
      sortBy = 'dataAtendimento',
      order = 'desc'
    } = req.query;

    // Construir query
    const query = { tenantId: req.tenantId };

    if (cliente) query.cliente = cliente;
    if (profissional) query.profissional = profissional;
    if (status) query.status = status;

    // Filtro de data
    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio);
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim);
    }

    // Paginação
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    // Buscar históricos
    const historicos = await HistoricoAtendimento.find(query)
      .populate('cliente', 'nome telefone email')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status')
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit));

    // Contar total
    const total = await HistoricoAtendimento.countDocuments(query);

    res.status(200).json({
      success: true,
      data: historicos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Erro ao listar históricos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao listar históricos de atendimento',
      error: error.message
    });
  }
};

// ============================================
// @desc    Buscar histórico por ID
// @route   GET /api/historico-atendimentos/:id
// @access  Private
// ============================================
export const buscarHistoricoPorId = async (req, res) => {
  try {
    const historico = await HistoricoAtendimento.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    })
      .populate('cliente', 'nome telefone email dataNascimento')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status observacoes');

    if (!historico) {
      return res.status(404).json({
        success: false,
        message: 'Histórico de atendimento não encontrado'
      });
    }

    res.status(200).json({
      success: true,
      data: historico
    });

  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico de atendimento',
      error: error.message
    });
  }
};

// ============================================
// @desc    Atualizar histórico de atendimento
// @route   PUT /api/historico-atendimentos/:id
// @access  Private
// ============================================
export const atualizarHistoricoAtendimento = async (req, res) => {
  try {
    const historico = await HistoricoAtendimento.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!historico) {
      return res.status(404).json({
        success: false,
        message: 'Histórico de atendimento não encontrado'
      });
    }

    // Verificar se pode editar
    if (historico.status === 'Finalizado' && !historico.podeEditar) {
      return res.status(400).json({
        success: false,
        message: 'Histórico finalizado não pode ser editado'
      });
    }

    // Atualizar campos
    Object.keys(req.body).forEach(key => {
      if (key !== 'tenantId' && key !== 'cliente' && key !== '_id') {
        historico[key] = req.body[key];
      }
    });

    await historico.save();

    // Popular dados para retorno
    const historicoAtualizado = await HistoricoAtendimento.findById(historico._id)
      .populate('cliente', 'nome telefone email')
      .populate('profissional', 'nome email')
      .populate('agendamento', 'dataHora status');

    res.status(200).json({
      success: true,
      message: 'Histórico atualizado com sucesso',
      data: historicoAtualizado
    });

  } catch (error) {
    console.error('Erro ao atualizar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar histórico de atendimento',
      error: error.message
    });
  }
};

// ============================================
// @desc    Finalizar histórico de atendimento
// @route   PUT /api/historico-atendimentos/:id/finalizar
// @access  Private
// ============================================
export const finalizarHistoricoAtendimento = async (req, res) => {
  try {
    const historico = await HistoricoAtendimento.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!historico) {
      return res.status(404).json({
        success: false,
        message: 'Histórico de atendimento não encontrado'
      });
    }

    if (historico.status === 'Finalizado') {
      return res.status(400).json({
        success: false,
        message: 'Histórico já está finalizado'
      });
    }

    await historico.finalizar();

    res.status(200).json({
      success: true,
      message: 'Histórico finalizado com sucesso',
      data: historico
    });

  } catch (error) {
    console.error('Erro ao finalizar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao finalizar histórico de atendimento',
      error: error.message
    });
  }
};

// ============================================
// @desc    Deletar histórico de atendimento
// @route   DELETE /api/historico-atendimentos/:id
// @access  Private (Admin only)
// ============================================
export const deletarHistoricoAtendimento = async (req, res) => {
  try {
    const historico = await HistoricoAtendimento.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!historico) {
      return res.status(404).json({
        success: false,
        message: 'Histórico de atendimento não encontrado'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Histórico deletado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar histórico:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao deletar histórico de atendimento',
      error: error.message
    });
  }
};

// ============================================
// @desc    Buscar histórico de um cliente específico
// @route   GET /api/historico-atendimentos/cliente/:clienteId
// @access  Private
// ============================================
export const buscarHistoricoCliente = async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { limit = 10 } = req.query;

    // Verificar se cliente existe
    const cliente = await Cliente.findOne({
      _id: clienteId,
      tenantId: req.tenantId
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente não encontrado'
      });
    }

    // Buscar históricos
    const historicos = await HistoricoAtendimento.find({
      cliente: clienteId,
      tenantId: req.tenantId
    })
      .populate('profissional', 'nome')
      .populate('agendamento', 'dataHora')
      .sort({ dataAtendimento: -1 })
      .limit(parseInt(limit));

    // Estatísticas
    const stats = {
      totalAtendimentos: historicos.length,
      ultimoAtendimento: historicos[0]?.dataAtendimento || null
    };

    // Média de satisfação
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

    res.status(200).json({
      success: true,
      data: {
        historicos,
        stats
      }
    });

  } catch (error) {
    console.error('Erro ao buscar histórico do cliente:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico do cliente',
      error: error.message
    });
  }
};

// ============================================
// @desc    Buscar técnicas mais utilizadas para um cliente
// @route   GET /api/historico-atendimentos/cliente/:clienteId/tecnicas
// @access  Private
// ============================================
export const buscarTecnicasMaisUsadas = async (req, res) => {
  try {
    const { clienteId } = req.params;
    const { limite = 5 } = req.query;

    const tecnicas = await HistoricoAtendimento.tecnicasMaisUsadas(
      clienteId,
      parseInt(limite)
    );

    res.status(200).json({
      success: true,
      data: tecnicas
    });

  } catch (error) {
    console.error('Erro ao buscar técnicas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar técnicas mais utilizadas',
      error: error.message
    });
  }
};

// ============================================
// @desc    Estatísticas gerais de atendimentos
// @route   GET /api/historico-atendimentos/stats
// @access  Private
// ============================================
export const estatisticasAtendimentos = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    // Converter tenantId para ObjectId
    const tenantIdObj = mongoose.Types.ObjectId.isValid(req.tenantId)
      ? new mongoose.Types.ObjectId(req.tenantId)
      : req.tenantId;

    const query = {
      tenantId: tenantIdObj,
      status: 'Finalizado'
    };

    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio);
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim);
    }

    // Total de atendimentos
    const totalAtendimentos = await HistoricoAtendimento.countDocuments(query);

    // Média de satisfação
    const mediaSatisfacao = await HistoricoAtendimento.aggregate([
      { $match: query },
      {
        $match: {
          satisfacaoCliente: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          media: { $avg: '$satisfacaoCliente' }
        }
      }
    ]);

    // Serviços mais realizados
    const servicosMaisRealizados = await HistoricoAtendimento.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$servico',
          quantidade: { $sum: 1 }
        }
      },
      { $sort: { quantidade: -1 } },
      { $limit: 5 }
    ]);

    // Técnicas mais utilizadas
    const tecnicasMaisUtilizadas = await HistoricoAtendimento.aggregate([
      { $match: query },
      { $unwind: '$tecnicasUtilizadas' },
      {
        $group: {
          _id: '$tecnicasUtilizadas',
          quantidade: { $sum: 1 }
        }
      },
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
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar estatísticas de atendimentos',
      error: error.message
    });
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
