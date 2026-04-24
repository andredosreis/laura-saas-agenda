import { DateTime } from 'luxon';
import mongoose from 'mongoose';

// @desc    Criar nova transação
// @route   POST /api/transacoes
export const criarTransacao = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const {
      tipo, categoria, valor, desconto, descricao, observacoes,
      agendamento, cliente, compraPacote, profissional,
      parcelado, numeroParcelas, comissao
    } = req.body;

    if (!tipo || !categoria || !valor || !descricao) {
      return res.status(400).json({ message: 'Campos obrigatórios: tipo, categoria, valor, descricao' });
    }

    if (valor <= 0) {
      return res.status(400).json({ message: 'O valor deve ser maior que zero' });
    }

    const transacao = await Transacao.create({
      tenantId: req.tenantId,
      tipo, categoria, valor,
      desconto: desconto || 0,
      valorFinal: valor - (desconto || 0),
      descricao,
      observacoes: observacoes || '',
      agendamento: agendamento || null,
      cliente: cliente || null,
      compraPacote: compraPacote || null,
      profissional: profissional || null,
      parcelado: parcelado || false,
      numeroParcelas: parcelado ? (numeroParcelas || 1) : 1,
      parcelaAtual: 1,
      statusPagamento: 'Pendente',
      comissao: comissao || {}
    });

    await transacao.populate([
      { path: 'cliente', select: 'nome telefone email' },
      { path: 'compraPacote' },
      { path: 'profissional', select: 'nome' }
    ]);

    res.status(201).json({ message: 'Transação criada com sucesso', transacao });

  } catch (error) {
    console.error('Erro ao criar transação:', error);
    res.status(500).json({ message: 'Erro ao criar transação', details: error.message });
  }
};

// @desc    Listar transações com filtros
// @route   GET /api/transacoes
export const listarTransacoes = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const {
      tipo, categoria, statusPagamento, dataInicio, dataFim,
      cliente, limit = 50, page = 1, sort = '-createdAt'
    } = req.query;

    const query = {
      tenantId: mongoose.Types.ObjectId.isValid(req.tenantId)
        ? new mongoose.Types.ObjectId(req.tenantId)
        : req.tenantId
    };

    if (tipo) query.tipo = tipo;
    if (categoria) query.categoria = categoria;
    if (statusPagamento) query.statusPagamento = statusPagamento;
    if (cliente) query.cliente = cliente;

    if (dataInicio && dataFim) {
      const inicio = DateTime.fromISO(dataInicio).setZone('Europe/Lisbon').startOf('day').toJSDate();
      const fim = DateTime.fromISO(dataFim).setZone('Europe/Lisbon').endOf('day').toJSDate();
      query.createdAt = { $gte: inicio, $lte: fim };
    } else if (dataInicio) {
      const inicio = DateTime.fromISO(dataInicio).setZone('Europe/Lisbon').startOf('day').toJSDate();
      query.createdAt = { $gte: inicio };
    } else if (dataFim) {
      const fim = DateTime.fromISO(dataFim).setZone('Europe/Lisbon').endOf('day').toJSDate();
      query.createdAt = { $lte: fim };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [transacoes, total] = await Promise.all([
      Transacao.find(query)
        .populate('cliente', 'nome telefone')
        .populate('compraPacote')
        .populate('profissional', 'nome')
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip),
      Transacao.countDocuments(query)
    ]);

    if (transacoes.length > 0) {
      console.log('[listarTransacoes] 🔍 Primeira transação:', {
        _id: transacoes[0]._id,
        tipo: transacoes[0].tipo,
        categoria: transacoes[0].categoria,
        valor: transacoes[0].valor,
        valorFinal: transacoes[0].valorFinal
      });
    }

    console.log('[listarTransacoes] 🔍 Query para aggregate:', JSON.stringify(query, null, 2));
    console.log('[listarTransacoes] 📊 Total de transações encontradas:', total);

    const resumo = await Transacao.aggregate([
      { $match: query },
      { $group: { _id: '$tipo', total: { $sum: '$valorFinal' }, quantidade: { $sum: 1 } } }
    ]);

    // Calcular "recebido" real: soma dos Pagamentos para receitas + fallback histórico
    const { Pagamento } = req.models;
    const receitasNoRange = await Transacao.find({ ...query, tipo: 'Receita' })
      .select('_id valorFinal statusPagamento')
      .lean();

    const receitaIds = receitasNoRange.map(r => r._id);
    const pagamentosAgg = receitaIds.length > 0
      ? await Pagamento.aggregate([
          {
            $match: {
              tenantId: new mongoose.Types.ObjectId(req.tenantId),
              transacao: { $in: receitaIds }
            }
          },
          { $group: { _id: '$transacao', total: { $sum: '$valor' } } }
        ])
      : [];

    const pagamentosPorTransacao = new Map(
      pagamentosAgg.map(p => [String(p._id), p.total])
    );

    let recebido = 0;
    for (const r of receitasNoRange) {
      const pago = pagamentosPorTransacao.get(String(r._id)) || 0;
      if (pago > 0) {
        recebido += pago;
      } else if (r.statusPagamento === 'Pago') {
        // Fallback histórico: transação marcada Pago mas sem Pagamentos registados
        recebido += r.valorFinal || 0;
      }
    }

    const vendido = resumo.find(r => r._id === 'Receita')?.total || 0;
    const pendente = Math.max(0, vendido - recebido);

    const totais = {
      receitas: vendido, // mantém retrocompat — alias para "vendido"
      vendido,
      recebido,
      pendente,
      despesas: resumo.find(r => r._id === 'Despesa')?.total || 0,
      saldo: 0
    };
    totais.saldo = recebido - totais.despesas;

    console.log('[listarTransacoes] 💰 Totais calculados:', totais);

    res.status(200).json({
      transacoes,
      paginacao: {
        total,
        pagina: parseInt(page),
        limite: parseInt(limit),
        totalPaginas: Math.ceil(total / parseInt(limit))
      },
      totais
    });

  } catch (error) {
    console.error('Erro ao listar transações:', error);
    res.status(500).json({ message: 'Erro ao listar transações', details: error.message });
  }
};

// @desc    Buscar transação por ID
// @route   GET /api/transacoes/:id
export const buscarTransacao = async (req, res) => {
  try {
    const { Transacao, Pagamento } = req.models;
    const { id } = req.params;

    const transacao = await Transacao.findOne({ _id: id, tenantId: req.tenantId })
      .populate('cliente', 'nome telefone email')
      .populate('compraPacote')
      .populate('profissional', 'nome email')
      .populate('agendamento');

    if (!transacao) {
      return res.status(404).json({ message: 'Transação não encontrada' });
    }

    const pagamentos = await Pagamento.find({ transacao: id, tenantId: req.tenantId }).sort('-dataPagamento');

    res.status(200).json({ transacao, pagamentos });

  } catch (error) {
    console.error('Erro ao buscar transação:', error);
    res.status(500).json({ message: 'Erro ao buscar transação', details: error.message });
  }
};

// @desc    Atualizar transação
// @route   PUT /api/transacoes/:id
export const atualizarTransacao = async (req, res) => {
  try {
    const { Transacao, Pagamento } = req.models;
    const { id } = req.params;
    const updates = req.body;

    const transacao = await Transacao.findOne({ _id: id, tenantId: req.tenantId });

    if (!transacao) {
      return res.status(404).json({ message: 'Transação não encontrada' });
    }

    if (transacao.statusPagamento === 'Pago' && updates.valor) {
      return res.status(400).json({ message: 'Não é possível alterar valor de transação já paga' });
    }

    const pagamentos = await Pagamento.countDocuments({ transacao: id, tenantId: req.tenantId });

    if (pagamentos > 0 && (updates.tipo || updates.categoria)) {
      return res.status(400).json({ message: 'Não é possível alterar tipo/categoria de transação com pagamentos' });
    }

    const camposPermitidos = ['descricao', 'observacoes', 'valor', 'desconto', 'categoria', 'formaPagamento'];

    camposPermitidos.forEach(campo => {
      if (updates[campo] !== undefined) {
        transacao[campo] = updates[campo];
      }
    });

    await transacao.save();

    res.status(200).json({ message: 'Transação atualizada com sucesso', transacao });

  } catch (error) {
    console.error('Erro ao atualizar transação:', error);
    res.status(500).json({ message: 'Erro ao atualizar transação', details: error.message });
  }
};

// @desc    Cancelar/Estornar transação
// @route   DELETE /api/transacoes/:id
export const cancelarTransacao = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { id } = req.params;
    const { motivo } = req.body;

    const transacao = await Transacao.findOne({ _id: id, tenantId: req.tenantId });

    if (!transacao) {
      return res.status(404).json({ message: 'Transação não encontrada' });
    }

    if (transacao.statusPagamento === 'Cancelado' || transacao.statusPagamento === 'Estornado') {
      return res.status(400).json({ message: 'Transação já está cancelada/estornada' });
    }

    await transacao.cancelar(motivo);

    res.status(200).json({
      message: transacao.statusPagamento === 'Estornado'
        ? 'Transação estornada com sucesso'
        : 'Transação cancelada com sucesso',
      transacao
    });

  } catch (error) {
    console.error('Erro ao cancelar transação:', error);
    res.status(500).json({ message: 'Erro ao cancelar transação', details: error.message });
  }
};

// @desc    Buscar transações pendentes
// @route   GET /api/transacoes/pendentes
export const listarTransacoesPendentes = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { tipo = 'Receita' } = req.query;

    const transacoes = await Transacao.find({
      tenantId: req.tenantId,
      tipo,
      statusPagamento: { $in: ['Pendente', 'Parcial'] }
    })
      .populate('cliente', 'nome telefone')
      .populate('compraPacote')
      .sort('createdAt');

    const totalPendente = transacoes.reduce((sum, t) => {
      if (t.statusPagamento === 'Pendente') return sum + t.valorFinal;
      return sum + (t.valorFinal / 2);
    }, 0);

    res.status(200).json({ transacoes, totalPendente, quantidade: transacoes.length });

  } catch (error) {
    console.error('Erro ao listar pendentes:', error);
    res.status(500).json({ message: 'Erro ao listar transações pendentes', details: error.message });
  }
};

// @desc    Registrar pagamento de uma transação
// @route   POST /api/transacoes/:id/pagamento
export const registrarPagamento = async (req, res) => {
  try {
    const { Transacao, Pagamento, CompraPacote } = req.models;
    const { id } = req.params;
    const {
      valor, formaPagamento, dataPagamento,
      dadosMBWay, dadosMultibanco, dadosCartao, dadosTransferencia, observacoes
    } = req.body;

    if (!valor || valor <= 0) {
      return res.status(400).json({ message: 'Valor do pagamento deve ser maior que zero' });
    }

    if (!formaPagamento) {
      return res.status(400).json({ message: 'Forma de pagamento é obrigatória' });
    }

    const transacao = await Transacao.findOne({ _id: id, tenantId: req.tenantId });

    if (!transacao) return res.status(404).json({ message: 'Transação não encontrada' });

    if (transacao.statusPagamento === 'Pago') {
      return res.status(400).json({ message: 'Transação já está totalmente paga' });
    }

    if (transacao.statusPagamento === 'Cancelado' || transacao.statusPagamento === 'Estornado') {
      return res.status(400).json({ message: 'Não é possível registrar pagamento em transação cancelada/estornada' });
    }

    const pagamento = await Pagamento.create({
      tenantId: req.tenantId,
      transacao: id,
      valor,
      formaPagamento,
      dataPagamento: dataPagamento || new Date(),
      dadosMBWay: formaPagamento === 'MBWay' ? dadosMBWay : undefined,
      dadosMultibanco: formaPagamento === 'Multibanco' ? dadosMultibanco : undefined,
      dadosCartao: (formaPagamento === 'Cartão de Débito' || formaPagamento === 'Cartão de Crédito') ? dadosCartao : undefined,
      dadosTransferencia: formaPagamento === 'Transferência Bancária' ? dadosTransferencia : undefined,
      observacoes: observacoes || ''
    });

    await transacao.registrarPagamento(valor, formaPagamento, dataPagamento);

    if (transacao.compraPacote) {
      const compraPacote = await CompraPacote.findOne({ _id: transacao.compraPacote, tenantId: req.tenantId });
      if (compraPacote) {
        await compraPacote.registrarPagamento(valor);
      }
    }

    await transacao.populate([
      { path: 'cliente', select: 'nome telefone' },
      { path: 'compraPacote' }
    ]);

    res.status(201).json({ message: 'Pagamento registrado com sucesso', pagamento, transacao });

  } catch (error) {
    console.error('Erro ao registrar pagamento:', error);
    res.status(500).json({ message: 'Erro ao registrar pagamento', details: error.message });
  }
};

// @desc    Buscar transações por período (para relatórios)
// @route   GET /api/transacoes/relatorio/periodo
export const relatorioPorPeriodo = async (req, res) => {
  try {
    const { Transacao, Pagamento } = req.models;
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ message: 'dataInicio e dataFim são obrigatórios' });
    }

    const inicio = DateTime.fromISO(dataInicio).setZone('Europe/Lisbon').startOf('day').toJSDate();
    const fim = DateTime.fromISO(dataFim).setZone('Europe/Lisbon').endOf('day').toJSDate();

    const tenantIdObj = mongoose.Types.ObjectId.isValid(req.tenantId)
      ? new mongoose.Types.ObjectId(req.tenantId)
      : req.tenantId;

    const transacoes = await Transacao.find({
      tenantId: req.tenantId,
      statusPagamento: 'Pago',
      dataPagamento: { $gte: inicio, $lte: fim }
    });

    const resumoPorTipo = await Transacao.aggregate([
      {
        $match: {
          tenantId: tenantIdObj,
          statusPagamento: 'Pago',
          dataPagamento: { $gte: inicio, $lte: fim }
        }
      },
      { $group: { _id: '$tipo', total: { $sum: '$valorFinal' }, quantidade: { $sum: 1 } } }
    ]);

    const resumoPorCategoria = await Transacao.aggregate([
      {
        $match: {
          tenantId: tenantIdObj,
          statusPagamento: 'Pago',
          dataPagamento: { $gte: inicio, $lte: fim }
        }
      },
      {
        $group: {
          _id: { tipo: '$tipo', categoria: '$categoria' },
          total: { $sum: '$valorFinal' },
          quantidade: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    const formasPagamento = await Pagamento.totalPorFormaPagamento(req.tenantId, dataInicio, dataFim);

    const receitas = resumoPorTipo.find(r => r._id === 'Receita')?.total || 0;
    const despesas = resumoPorTipo.find(r => r._id === 'Despesa')?.total || 0;
    const saldo = receitas - despesas;

    res.status(200).json({
      periodo: {
        dataInicio: DateTime.fromJSDate(inicio).toFormat('dd/MM/yyyy'),
        dataFim: DateTime.fromJSDate(fim).toFormat('dd/MM/yyyy')
      },
      resumo: { receitas, despesas, saldo, quantidadeTransacoes: transacoes.length },
      resumoPorTipo,
      resumoPorCategoria,
      formasPagamento
    });

  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ message: 'Erro ao gerar relatório', details: error.message });
  }
};

// @desc    Buscar comissões pendentes de pagamento
// @route   GET /api/transacoes/comissoes/pendentes
export const comissoesPendentes = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { profissional } = req.query;

    const query = {
      tenantId: req.tenantId,
      tipo: 'Receita',
      statusPagamento: 'Pago',
      'comissao.valor': { $gt: 0 },
      'comissao.pago': false
    };

    if (profissional) query['comissao.profissional'] = profissional;

    const transacoes = await Transacao.find(query)
      .populate('comissao.profissional', 'nome email dadosBancarios')
      .populate('cliente', 'nome')
      .sort('dataPagamento');

    const comissoesPorProfissional = {};

    transacoes.forEach(t => {
      const profId = t.comissao.profissional._id.toString();

      if (!comissoesPorProfissional[profId]) {
        comissoesPorProfissional[profId] = {
          profissional: t.comissao.profissional,
          totalComissao: 0,
          transacoes: []
        };
      }

      comissoesPorProfissional[profId].totalComissao += t.comissao.valor;
      comissoesPorProfissional[profId].transacoes.push({
        transacaoId: t._id,
        descricao: t.descricao,
        valorServico: t.valorFinal,
        percentual: t.comissao.percentual,
        valorComissao: t.comissao.valor,
        data: t.dataPagamento
      });
    });

    const resultado = Object.values(comissoesPorProfissional);

    res.status(200).json({
      comissoes: resultado,
      totalGeral: resultado.reduce((sum, c) => sum + c.totalComissao, 0)
    });

  } catch (error) {
    console.error('Erro ao buscar comissões:', error);
    res.status(500).json({ message: 'Erro ao buscar comissões pendentes', details: error.message });
  }
};

// @desc    Marcar comissão como paga
// @route   PUT /api/transacoes/:id/comissao/pagar
export const pagarComissao = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { id } = req.params;
    const { dataPagamento } = req.body;

    const transacao = await Transacao.findOne({ _id: id, tenantId: req.tenantId });

    if (!transacao) return res.status(404).json({ message: 'Transação não encontrada' });

    if (!transacao.comissao || transacao.comissao.valor === 0) {
      return res.status(400).json({ message: 'Transação não possui comissão' });
    }

    if (transacao.comissao.pago) {
      return res.status(400).json({ message: 'Comissão já foi paga' });
    }

    transacao.comissao.pago = true;
    transacao.comissao.dataPagamento = dataPagamento || new Date();

    await transacao.save();

    res.status(200).json({ message: 'Comissão marcada como paga', transacao });

  } catch (error) {
    console.error('Erro ao pagar comissão:', error);
    res.status(500).json({ message: 'Erro ao pagar comissão', details: error.message });
  }
};

// @desc    Deletar transação permanentemente
// @route   DELETE /api/transacoes/:id/deletar
export const deletarTransacao = async (req, res) => {
  try {
    const { Transacao, Pagamento } = req.models;
    const { id } = req.params;

    const transacao = await Transacao.findOne({ _id: id, tenantId: req.tenantId });

    if (!transacao) return res.status(404).json({ message: 'Transação não encontrada' });

    if (transacao.agendamento) {
      return res.status(400).json({
        message: 'Não é possível deletar transação vinculada a um agendamento. Cancele o agendamento primeiro.'
      });
    }

    const pagamentos = await Pagamento.countDocuments({ transacao: id, tenantId: req.tenantId });

    if (pagamentos > 0) {
      return res.status(400).json({
        message: 'Não é possível deletar transação com pagamentos registrados. Cancele a transação.'
      });
    }

    await Transacao.deleteOne({ _id: id, tenantId: req.tenantId });

    res.status(200).json({ message: 'Transação deletada com sucesso', deletedId: id });

  } catch (error) {
    console.error('Erro ao deletar transação:', error);
    res.status(500).json({ message: 'Erro ao deletar transação', details: error.message });
  }
};
