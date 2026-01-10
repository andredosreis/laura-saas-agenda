import Pagamento from '../models/Pagamento.js';
import Transacao from '../models/Transacao.js';
import CompraPacote from '../models/CompraPacote.js';

// @desc    Listar pagamentos
// @route   GET /api/pagamentos
// @access  Private
export const listarPagamentos = async (req, res) => {
  try {
    const {
      transacao,
      formaPagamento,
      dataInicio,
      dataFim,
      limit = 50,
      page = 1
    } = req.query;

    // Construir query
    const query = { tenantId: req.tenantId };

    if (transacao) query.transacao = transacao;
    if (formaPagamento) query.formaPagamento = formaPagamento;

    if (dataInicio || dataFim) {
      query.dataPagamento = {};
      if (dataInicio) query.dataPagamento.$gte = new Date(dataInicio);
      if (dataFim) query.dataPagamento.$lte = new Date(dataFim);
    }

    // Paginação
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [pagamentos, total] = await Promise.all([
      Pagamento.find(query)
        .populate('transacao')
        .sort('-dataPagamento')
        .limit(parseInt(limit))
        .skip(skip),
      Pagamento.countDocuments(query)
    ]);

    // Calcular totais
    const totalValor = pagamentos.reduce((sum, pag) => sum + pag.valor, 0);

    res.status(200).json({
      pagamentos,
      paginacao: {
        total,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(total / parseInt(limit))
      },
      totais: {
        totalValor
      }
    });

  } catch (error) {
    console.error('Erro ao listar pagamentos:', error);
    res.status(500).json({
      message: 'Erro ao listar pagamentos',
      details: error.message
    });
  }
};

// @desc    Buscar detalhes de um pagamento
// @route   GET /api/pagamentos/:id
// @access  Private
export const buscarPagamento = async (req, res) => {
  try {
    const { id } = req.params;

    const pagamento = await Pagamento.findOne({
      _id: id,
      tenantId: req.tenantId
    }).populate({
      path: 'transacao',
      populate: [
        { path: 'cliente', select: 'nome telefone email' },
        { path: 'compraPacote' }
      ]
    });

    if (!pagamento) {
      return res.status(404).json({
        message: 'Pagamento não encontrado'
      });
    }

    res.status(200).json({ pagamento });

  } catch (error) {
    console.error('Erro ao buscar pagamento:', error);
    res.status(500).json({
      message: 'Erro ao buscar pagamento',
      details: error.message
    });
  }
};

// @desc    Atualizar dados de um pagamento
// @route   PUT /api/pagamentos/:id
// @access  Private
export const atualizarPagamento = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      observacoes,
      dadosMBWay,
      dadosMultibanco,
      dadosCartao,
      dadosTransferencia
    } = req.body;

    const pagamento = await Pagamento.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!pagamento) {
      return res.status(404).json({
        message: 'Pagamento não encontrado'
      });
    }

    // Atualizar campos permitidos
    if (observacoes !== undefined) pagamento.observacoes = observacoes;

    // Atualizar dados específicos da forma de pagamento
    if (dadosMBWay && pagamento.formaPagamento === 'MBWay') {
      pagamento.dadosMBWay = { ...pagamento.dadosMBWay, ...dadosMBWay };
    }

    if (dadosMultibanco && pagamento.formaPagamento === 'Multibanco') {
      pagamento.dadosMultibanco = { ...pagamento.dadosMultibanco, ...dadosMultibanco };
    }

    if (dadosCartao && (pagamento.formaPagamento === 'Cartão de Débito' || pagamento.formaPagamento === 'Cartão de Crédito')) {
      pagamento.dadosCartao = { ...pagamento.dadosCartao, ...dadosCartao };
    }

    if (dadosTransferencia && pagamento.formaPagamento === 'Transferência Bancária') {
      pagamento.dadosTransferencia = { ...pagamento.dadosTransferencia, ...dadosTransferencia };
    }

    await pagamento.save();

    await pagamento.populate({
      path: 'transacao',
      populate: { path: 'cliente', select: 'nome telefone' }
    });

    res.status(200).json({
      message: 'Pagamento atualizado com sucesso',
      pagamento
    });

  } catch (error) {
    console.error('Erro ao atualizar pagamento:', error);
    res.status(500).json({
      message: 'Erro ao atualizar pagamento',
      details: error.message
    });
  }
};

// @desc    Deletar/Estornar um pagamento
// @route   DELETE /api/pagamentos/:id
// @access  Private
export const deletarPagamento = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const pagamento = await Pagamento.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!pagamento) {
      return res.status(404).json({
        message: 'Pagamento não encontrado'
      });
    }

    // Buscar transação relacionada
    const transacao = await Transacao.findOne({
      _id: pagamento.transacao,
      tenantId: req.tenantId
    });

    if (!transacao) {
      return res.status(404).json({
        message: 'Transação relacionada não encontrada'
      });
    }

    // Reverter o pagamento na transação
    transacao.valorPago -= pagamento.valor;
    transacao.valorPendente = transacao.valorFinal - transacao.valorPago;

    // Atualizar status da transação
    if (transacao.valorPago <= 0) {
      transacao.statusPagamento = 'Pendente';
      transacao.dataPagamento = null;
    } else if (transacao.valorPago < transacao.valorFinal) {
      transacao.statusPagamento = 'Parcial';
    }

    // Se tiver parcelas, ajustar
    if (transacao.parcelado && transacao.valorParcela > 0) {
      const parcelasPagas = Math.floor(transacao.valorPago / transacao.valorParcela);
      transacao.parcelaAtual = parcelasPagas + 1;
    }

    await transacao.save();

    // Se for de um pacote, reverter pagamento
    if (transacao.compraPacote) {
      const compraPacote = await CompraPacote.findById(transacao.compraPacote);
      if (compraPacote) {
        compraPacote.valorPago -= pagamento.valor;
        compraPacote.valorPendente = compraPacote.valorTotal - compraPacote.valorPago;

        // Ajustar parcelas pagas
        if (compraPacote.parcelado && compraPacote.valorParcela > 0) {
          compraPacote.parcelasPagas = Math.floor(compraPacote.valorPago / compraPacote.valorParcela);
        }

        await compraPacote.save();
      }
    }

    // Deletar pagamento
    await pagamento.deleteOne();

    res.status(200).json({
      message: `Pagamento estornado com sucesso${motivo ? `: ${motivo}` : ''}`,
      valorEstornado: pagamento.valor
    });

  } catch (error) {
    console.error('Erro ao deletar pagamento:', error);
    res.status(500).json({
      message: 'Erro ao deletar pagamento',
      details: error.message
    });
  }
};

// @desc    Estatísticas de pagamentos por forma de pagamento
// @route   GET /api/pagamentos/estatisticas/formas-pagamento
// @access  Private
export const estatisticasPorFormaPagamento = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    const query = { tenantId: req.tenantId };

    if (dataInicio || dataFim) {
      query.dataPagamento = {};
      if (dataInicio) query.dataPagamento.$gte = new Date(dataInicio);
      if (dataFim) query.dataPagamento.$lte = new Date(dataFim);
    }

    const estatisticas = await Pagamento.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$formaPagamento',
          total: { $sum: '$valor' },
          quantidade: { $sum: 1 },
          media: { $avg: '$valor' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Calcular totais gerais
    const totais = estatisticas.reduce((acc, stat) => {
      acc.totalGeral += stat.total;
      acc.quantidadeGeral += stat.quantidade;
      return acc;
    }, { totalGeral: 0, quantidadeGeral: 0 });

    // Adicionar percentuais
    const estatisticasComPercentual = estatisticas.map(stat => ({
      formaPagamento: stat._id,
      total: stat.total,
      quantidade: stat.quantidade,
      media: parseFloat(stat.media.toFixed(2)),
      percentual: parseFloat(((stat.total / totais.totalGeral) * 100).toFixed(1))
    }));

    res.status(200).json({
      estatisticas: estatisticasComPercentual,
      totais: {
        totalGeral: totais.totalGeral,
        quantidadeGeral: totais.quantidadeGeral,
        mediaGeral: totais.quantidadeGeral > 0
          ? parseFloat((totais.totalGeral / totais.quantidadeGeral).toFixed(2))
          : 0
      }
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      message: 'Erro ao buscar estatísticas',
      details: error.message
    });
  }
};

// @desc    Resumo diário de pagamentos
// @route   GET /api/pagamentos/resumo/diario
// @access  Private
export const resumoDiario = async (req, res) => {
  try {
    const { data } = req.query;

    const dataConsulta = data ? new Date(data) : new Date();
    const inicioDia = new Date(dataConsulta);
    inicioDia.setHours(0, 0, 0, 0);

    const fimDia = new Date(dataConsulta);
    fimDia.setHours(23, 59, 59, 999);

    const pagamentos = await Pagamento.find({
      tenantId: req.tenantId,
      dataPagamento: {
        $gte: inicioDia,
        $lte: fimDia
      }
    }).populate({
      path: 'transacao',
      select: 'tipo categoria cliente',
      populate: { path: 'cliente', select: 'nome' }
    });

    // Agrupar por forma de pagamento
    const resumoPorForma = {};
    let totalDia = 0;

    pagamentos.forEach(pag => {
      const forma = pag.formaPagamento;
      if (!resumoPorForma[forma]) {
        resumoPorForma[forma] = {
          quantidade: 0,
          valor: 0
        };
      }
      resumoPorForma[forma].quantidade += 1;
      resumoPorForma[forma].valor += pag.valor;
      totalDia += pag.valor;
    });

    res.status(200).json({
      data: dataConsulta.toISOString().split('T')[0],
      resumoPorForma,
      totais: {
        quantidadeTotal: pagamentos.length,
        valorTotal: totalDia
      },
      pagamentos
    });

  } catch (error) {
    console.error('Erro ao buscar resumo diário:', error);
    res.status(500).json({
      message: 'Erro ao buscar resumo diário',
      details: error.message
    });
  }
};

// @desc    Resumo mensal de pagamentos
// @route   GET /api/pagamentos/resumo/mensal
// @access  Private
export const resumoMensal = async (req, res) => {
  try {
    const { mes, ano } = req.query;

    const anoConsulta = ano ? parseInt(ano) : new Date().getFullYear();
    const mesConsulta = mes ? parseInt(mes) : new Date().getMonth() + 1;

    const inicioMes = new Date(anoConsulta, mesConsulta - 1, 1);
    const fimMes = new Date(anoConsulta, mesConsulta, 0, 23, 59, 59, 999);

    const pagamentos = await Pagamento.find({
      tenantId: req.tenantId,
      dataPagamento: {
        $gte: inicioMes,
        $lte: fimMes
      }
    });

    // Resumo por forma de pagamento
    const resumoPorForma = {};
    let totalMes = 0;

    pagamentos.forEach(pag => {
      const forma = pag.formaPagamento;
      if (!resumoPorForma[forma]) {
        resumoPorForma[forma] = {
          quantidade: 0,
          valor: 0
        };
      }
      resumoPorForma[forma].quantidade += 1;
      resumoPorForma[forma].valor += pag.valor;
      totalMes += pag.valor;
    });

    // Resumo por dia (para gráfico)
    const pagamentosPorDia = await Pagamento.aggregate([
      {
        $match: {
          tenantId: req.tenantId,
          dataPagamento: {
            $gte: inicioMes,
            $lte: fimMes
          }
        }
      },
      {
        $group: {
          _id: { $dayOfMonth: '$dataPagamento' },
          total: { $sum: '$valor' },
          quantidade: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      mes: mesConsulta,
      ano: anoConsulta,
      resumoPorForma,
      pagamentosPorDia: pagamentosPorDia.map(item => ({
        dia: item._id,
        total: item.total,
        quantidade: item.quantidade
      })),
      totais: {
        quantidadeTotal: pagamentos.length,
        valorTotal: totalMes,
        mediadiaria: parseFloat((totalMes / new Date(anoConsulta, mesConsulta, 0).getDate()).toFixed(2))
      }
    });

  } catch (error) {
    console.error('Erro ao buscar resumo mensal:', error);
    res.status(500).json({
      message: 'Erro ao buscar resumo mensal',
      details: error.message
    });
  }
};
