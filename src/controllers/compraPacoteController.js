import CompraPacote from '../models/CompraPacote.js';
import Transacao from '../models/Transacao.js';
import Pacote from '../models/Pacote.js';
import Cliente from '../models/Cliente.js';
import { DateTime } from 'luxon';

// @desc    Vender pacote para um cliente
// @route   POST /api/compras-pacotes
// @access  Private
export const venderPacote = async (req, res) => {
  try {
    const {
      clienteId,
      pacoteId,
      diasValidade,
      parcelado,
      numeroParcelas,
      valorPago,
      formaPagamento
    } = req.body;

    // Validações
    if (!clienteId || !pacoteId) {
      return res.status(400).json({
        message: 'Cliente e pacote são obrigatórios'
      });
    }

    // Buscar cliente e pacote
    const [cliente, pacote] = await Promise.all([
      Cliente.findOne({ _id: clienteId, tenantId: req.tenantId }),
      Pacote.findOne({ _id: pacoteId, tenantId: req.tenantId })
    ]);

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    if (!pacote) {
      return res.status(404).json({ message: 'Pacote não encontrado' });
    }

    if (!pacote.ativo) {
      return res.status(400).json({ message: 'Pacote não está ativo' });
    }

    // Criar compraPacote
    const compraPacote = await CompraPacote.create({
      tenantId: req.tenantId,
      cliente: clienteId,
      pacote: pacoteId,
      sessoesContratadas: pacote.sessoes,
      sessoesUsadas: 0,
      sessoesRestantes: pacote.sessoes,
      valorTotal: pacote.valor,
      valorPago: valorPago || 0,
      valorPendente: pacote.valor - (valorPago || 0),
      parcelado: parcelado || false,
      numeroParcelas: parcelado ? (numeroParcelas || 1) : 1,
      parcelasPagas: valorPago > 0 ? 1 : 0,
      valorParcela: parcelado ? pacote.valor / (numeroParcelas || 1) : pacote.valor,
      diasValidade: diasValidade || null,
      dataCompra: new Date()
    });

    // Criar transação de receita
    const transacao = await Transacao.create({
      tenantId: req.tenantId,
      tipo: 'Receita',
      categoria: 'Pacote',
      valor: pacote.valor,
      desconto: 0,
      valorFinal: pacote.valor,
      descricao: `Venda de pacote: ${pacote.nome} - ${cliente.nome}`,
      cliente: clienteId,
      compraPacote: compraPacote._id,
      parcelado: parcelado || false,
      numeroParcelas: parcelado ? (numeroParcelas || 1) : 1,
      parcelaAtual: valorPago > 0 ? 2 : 1,
      statusPagamento: !valorPago ? 'Pendente' : (valorPago >= pacote.valor ? 'Pago' : 'Parcial'),
      formaPagamento: formaPagamento || null,
      dataPagamento: valorPago >= pacote.valor ? new Date() : null
    });

    // Popular dados
    await compraPacote.populate([
      { path: 'cliente', select: 'nome telefone email' },
      { path: 'pacote' }
    ]);

    res.status(201).json({
      message: 'Pacote vendido com sucesso',
      compraPacote,
      transacao
    });

  } catch (error) {
    console.error('Erro ao vender pacote:', error);
    res.status(500).json({
      message: 'Erro ao vender pacote',
      details: error.message
    });
  }
};

// @desc    Listar pacotes vendidos (compras de pacotes)
// @route   GET /api/compras-pacotes
// @access  Private
export const listarComprasPacotes = async (req, res) => {
  try {
    const {
      status,
      cliente,
      pacote,
      expirando,
      poucasSessoes,
      limit = 50,
      page = 1
    } = req.query;

    // Construir query
    const query = { tenantId: req.tenantId };

    if (status) query.status = status;
    if (cliente) query.cliente = cliente;
    if (pacote) query.pacote = pacote;

    // Paginação
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let comprasPacotes;
    let total;

    // Filtros especiais
    if (expirando === 'true') {
      const dias = parseInt(req.query.dias) || 7;
      const resultado = await CompraPacote.buscarExpirandoEmBreve(req.tenantId, dias);
      comprasPacotes = resultado.slice(skip, skip + parseInt(limit));
      total = resultado.length;
    } else if (poucasSessoes === 'true') {
      const limite = parseInt(req.query.limiteSessoes) || 2;
      const resultado = await CompraPacote.buscarComPoucasSessoes(req.tenantId, limite);
      comprasPacotes = resultado.slice(skip, skip + parseInt(limit));
      total = resultado.length;
    } else {
      // Busca normal
      [comprasPacotes, total] = await Promise.all([
        CompraPacote.find(query)
          .populate('cliente', 'nome telefone email')
          .populate('pacote')
          .sort('-dataCompra')
          .limit(parseInt(limit))
          .skip(skip),
        CompraPacote.countDocuments(query)
      ]);
    }

    res.status(200).json({
      comprasPacotes,
      paginacao: {
        total,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Erro ao listar compras:', error);
    res.status(500).json({
      message: 'Erro ao listar compras de pacotes',
      details: error.message
    });
  }
};

// @desc    Buscar pacotes ativos de um cliente
// @route   GET /api/compras-pacotes/cliente/:clienteId
// @access  Private
export const pacotesDoCliente = async (req, res) => {
  try {
    const { clienteId } = req.params;

    const pacotes = await CompraPacote.find({
      tenantId: req.tenantId,
      cliente: clienteId
    })
      .populate('pacote')
      .sort('-dataCompra');

    // Retornar array diretamente para facilitar no frontend
    res.status(200).json(pacotes);

  } catch (error) {
    console.error('Erro ao buscar pacotes do cliente:', error);
    res.status(500).json({
      message: 'Erro ao buscar pacotes do cliente',
      details: error.message
    });
  }
};

// @desc    Buscar detalhes de um pacote comprado
// @route   GET /api/compras-pacotes/:id
// @access  Private
export const buscarCompraPacote = async (req, res) => {
  try {
    const { id } = req.params;

    const compraPacote = await CompraPacote.findOne({
      _id: id,
      tenantId: req.tenantId
    })
      .populate('cliente', 'nome telefone email')
      .populate('pacote')
      .populate('historico.profissional', 'nome')
      .populate('historico.agendamento')
      .populate('extensoes.realizadoPor', 'nome');

    if (!compraPacote) {
      return res.status(404).json({
        message: 'Compra de pacote não encontrada'
      });
    }

    // Buscar transação relacionada
    const transacao = await Transacao.findOne({
      compraPacote: id,
      tenantId: req.tenantId
    });

    // Buscar pagamentos da transação
    let pagamentos = [];
    if (transacao) {
      const Pagamento = (await import('../models/Pagamento.js')).default;
      pagamentos = await Pagamento.find({
        transacao: transacao._id,
        tenantId: req.tenantId
      }).sort('-dataPagamento');
    }

    res.status(200).json({
      compraPacote,
      transacao,
      pagamentos
    });

  } catch (error) {
    console.error('Erro ao buscar compra:', error);
    res.status(500).json({
      message: 'Erro ao buscar compra de pacote',
      details: error.message
    });
  }
};

// @desc    Estender prazo de validade de um pacote
// @route   PUT /api/compras-pacotes/:id/estender-prazo
// @access  Private
export const estenderPrazo = async (req, res) => {
  try {
    const { id } = req.params;
    const { novosDias, motivo } = req.body;

    if (!novosDias || novosDias <= 0) {
      return res.status(400).json({
        message: 'Número de dias deve ser maior que zero'
      });
    }

    const compraPacote = await CompraPacote.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!compraPacote) {
      return res.status(404).json({
        message: 'Compra de pacote não encontrada'
      });
    }

    if (compraPacote.status === 'Concluído') {
      return res.status(400).json({
        message: 'Não é possível estender prazo de pacote concluído'
      });
    }

    if (compraPacote.status === 'Cancelado') {
      return res.status(400).json({
        message: 'Não é possível estender prazo de pacote cancelado'
      });
    }

    // Estender prazo
    await compraPacote.estenderPrazo(novosDias, motivo, req.userId);

    await compraPacote.populate([
      { path: 'cliente', select: 'nome telefone' },
      { path: 'pacote' }
    ]);

    res.status(200).json({
      message: `Prazo estendido por ${novosDias} dias`,
      compraPacote
    });

  } catch (error) {
    console.error('Erro ao estender prazo:', error);
    res.status(500).json({
      message: 'Erro ao estender prazo',
      details: error.message
    });
  }
};

// @desc    Cancelar pacote comprado
// @route   PUT /api/compras-pacotes/:id/cancelar
// @access  Private
export const cancelarPacote = async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    const compraPacote = await CompraPacote.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!compraPacote) {
      return res.status(404).json({
        message: 'Compra de pacote não encontrada'
      });
    }

    if (compraPacote.status === 'Cancelado') {
      return res.status(400).json({
        message: 'Pacote já está cancelado'
      });
    }

    if (compraPacote.status === 'Concluído') {
      return res.status(400).json({
        message: 'Não é possível cancelar pacote concluído'
      });
    }

    // Cancelar
    await compraPacote.cancelar(motivo);

    // Cancelar transação relacionada se existir e não estiver paga
    const transacao = await Transacao.findOne({
      compraPacote: id,
      tenantId: req.tenantId,
      statusPagamento: { $ne: 'Pago' }
    });

    if (transacao) {
      await transacao.cancelar(`Pacote cancelado: ${motivo}`);
    }

    await compraPacote.populate([
      { path: 'cliente', select: 'nome telefone' },
      { path: 'pacote' }
    ]);

    res.status(200).json({
      message: 'Pacote cancelado com sucesso',
      compraPacote
    });

  } catch (error) {
    console.error('Erro ao cancelar pacote:', error);
    res.status(500).json({
      message: 'Erro ao cancelar pacote',
      details: error.message
    });
  }
};

// @desc    Buscar pacotes expirando em breve
// @route   GET /api/compras-pacotes/expirando
// @access  Private
export const pacotesExpirando = async (req, res) => {
  try {
    const { dias = 7 } = req.query;

    const pacotes = await CompraPacote.buscarExpirandoEmBreve(req.tenantId, parseInt(dias));

    res.status(200).json({
      pacotes,
      quantidade: pacotes.length,
      diasAlerta: parseInt(dias)
    });

  } catch (error) {
    console.error('Erro ao buscar pacotes expirando:', error);
    res.status(500).json({
      message: 'Erro ao buscar pacotes expirando',
      details: error.message
    });
  }
};

// @desc    Buscar alertas (pacotes expirando + poucas sessões)
// @route   GET /api/compras-pacotes/alertas
// @access  Private
export const alertasPacotes = async (req, res) => {
  try {
    const [
      expirando,
      poucasSessoes
    ] = await Promise.all([
      CompraPacote.buscarExpirandoEmBreve(req.tenantId, 7),
      CompraPacote.buscarComPoucasSessoes(req.tenantId, 2)
    ]);

    // Calcular estatísticas
    const totalAtivos = await CompraPacote.countDocuments({
      tenantId: req.tenantId,
      status: 'Ativo'
    });

    res.status(200).json({
      alertas: {
        expirando: {
          quantidade: expirando.length,
          pacotes: expirando
        },
        poucasSessoes: {
          quantidade: poucasSessoes.length,
          pacotes: poucasSessoes
        }
      },
      estatisticas: {
        totalAtivos,
        comAlertas: expirando.length + poucasSessoes.length
      }
    });

  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    res.status(500).json({
      message: 'Erro ao buscar alertas',
      details: error.message
    });
  }
};

// @desc    Estatísticas de pacotes
// @route   GET /api/compras-pacotes/estatisticas
// @access  Private
export const estatisticasPacotes = async (req, res) => {
  try {
    const estatisticas = await CompraPacote.aggregate([
      { $match: { tenantId: req.tenantId } },
      {
        $group: {
          _id: '$status',
          quantidade: { $sum: 1 },
          valorTotal: { $sum: '$valorTotal' },
          valorPago: { $sum: '$valorPago' },
          sessoesContratadas: { $sum: '$sessoesContratadas' },
          sessoesUsadas: { $sum: '$sessoesUsadas' }
        }
      }
    ]);

    // Totais gerais
    const totais = estatisticas.reduce((acc, stat) => {
      acc.quantidade += stat.quantidade;
      acc.valorTotal += stat.valorTotal;
      acc.valorPago += stat.valorPago;
      acc.sessoesContratadas += stat.sessoesContratadas;
      acc.sessoesUsadas += stat.sessoesUsadas;
      return acc;
    }, {
      quantidade: 0,
      valorTotal: 0,
      valorPago: 0,
      sessoesContratadas: 0,
      sessoesUsadas: 0
    });

    totais.valorPendente = totais.valorTotal - totais.valorPago;
    totais.sessoesRestantes = totais.sessoesContratadas - totais.sessoesUsadas;
    totais.taxaUso = totais.sessoesContratadas > 0
      ? ((totais.sessoesUsadas / totais.sessoesContratadas) * 100).toFixed(1)
      : 0;

    res.status(200).json({
      porStatus: estatisticas,
      totais
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      message: 'Erro ao buscar estatísticas',
      details: error.message
    });
  }
};

// @desc    Deletar compra de pacote
// @route   DELETE /api/compras-pacotes/:id
// @access  Private
export const deletarPacote = async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar compraPacote
    const compraPacote = await CompraPacote.findOne({
      _id: id,
      tenantId: req.tenantId
    });

    if (!compraPacote) {
      return res.status(404).json({ message: 'Pacote não encontrado' });
    }

    // Verificar se há sessões agendadas para este pacote
    // (opcional - você pode decidir se quer permitir deletar com sessões ou não)
    
    // Deletar o pacote
    await CompraPacote.deleteOne({ _id: id, tenantId: req.tenantId });

    res.status(200).json({ 
      message: 'Pacote deletado com sucesso',
      deletedId: id
    });

  } catch (error) {
    console.error('Erro ao deletar pacote:', error);
    res.status(500).json({
      message: 'Erro ao deletar pacote',
      details: error.message
    });
  }
};
