import { DateTime } from 'luxon';

// @desc    Vender pacote para um cliente
// @route   POST /api/compras-pacotes
export const venderPacote = async (req, res) => {
  try {
    const { CompraPacote, Transacao, Pacote, Cliente, Pagamento } = req.models;
    const {
      clienteId,
      pacoteId,
      diasValidade,
      parcelado,
      numeroParcelas,
      valorEntrada,
      valorPago,
      formaPagamento,
      sessoesUsadas = 0,
      valorTotal: valorTotalCustom,
      dataProximaParcela
    } = req.body;

    if (!clienteId || !pacoteId) {
      return res.status(400).json({ message: 'Cliente e pacote são obrigatórios' });
    }

    const [cliente, pacote] = await Promise.all([
      Cliente.findOne({ _id: clienteId, tenantId: req.tenantId }),
      Pacote.findOne({ _id: pacoteId, tenantId: req.tenantId })
    ]);

    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    if (!pacote)  return res.status(404).json({ message: 'Pacote não encontrado' });
    if (!pacote.ativo) return res.status(400).json({ message: 'Pacote não está ativo' });

    const sessoesContratadas = pacote.sessoes;
    const sessoesUsadasFinal = Math.min(parseInt(sessoesUsadas) || 0, sessoesContratadas - 1);
    const sessoesRestantes = sessoesContratadas - sessoesUsadasFinal;
    const valorTotal = valorTotalCustom > 0 ? parseFloat(valorTotalCustom) : pacote.valor;

    // Fluxo lead (valorEntrada explícito): entrada livre + resto parcelado
    // Fluxo VenderPacote (sem valorEntrada): valorPago = 1ª parcela
    const temEntrada = valorEntrada !== undefined && valorEntrada !== null;
    const valorPagoFinal = temEntrada ? (parseFloat(valorEntrada) || 0) : (parseFloat(valorPago) || 0);
    const valorPendente = Math.max(0, valorTotal - valorPagoFinal);
    const numParcelas = parcelado ? (parseInt(numeroParcelas) || 1) : 1;

    const valorParcelaCalc = !parcelado
      ? valorTotal
      : temEntrada
        ? valorPendente / numParcelas
        : valorTotal / numParcelas;

    const compraPacote = await CompraPacote.create({
      tenantId: req.tenantId,
      cliente: clienteId,
      pacote: pacoteId,
      sessoesContratadas,
      sessoesUsadas: sessoesUsadasFinal,
      sessoesRestantes,
      valorTotal,
      valorPago: valorPagoFinal,
      valorPendente,
      parcelado: parcelado || false,
      numeroParcelas: numParcelas,
      // Em fluxo lead a entrada não conta como parcela; no fluxo VenderPacote o valorPago representa a 1ª parcela
      parcelasPagas: (parcelado && temEntrada) ? 0 : (valorPagoFinal > 0 ? 1 : 0),
      valorParcela: valorParcelaCalc,
      diasValidade: diasValidade || null,
      // dataProximaParcela só faz sentido se há saldo pendente após este registo
      dataProximaParcela: (parcelado && (valorTotal - valorPagoFinal) > 0.001 && dataProximaParcela)
        ? new Date(dataProximaParcela)
        : null,
      dataCompra: new Date()
    });

    const transacao = await Transacao.create({
      tenantId: req.tenantId,
      tipo: 'Receita',
      categoria: 'Pacote',
      valor: valorTotal,
      desconto: 0,
      valorFinal: valorTotal,
      descricao: `Venda de pacote: ${pacote.nome} - ${cliente.nome}`,
      cliente: clienteId,
      compraPacote: compraPacote._id,
      parcelado: parcelado || false,
      numeroParcelas: numParcelas,
      parcelaAtual: (parcelado && temEntrada) ? 1 : (valorPagoFinal > 0 ? 2 : 1),
      statusPagamento: !valorPagoFinal ? 'Pendente' : (valorPagoFinal >= valorTotal ? 'Pago' : 'Parcial'),
      formaPagamento: formaPagamento || null,
      dataPagamento: valorPagoFinal >= valorTotal ? new Date() : null
    });

    // Criar registo de Pagamento para a entrada/valor inicial — assegura que os relatórios
    // de "Recebido vs Pendente" reflectem a realidade desde o momento da venda.
    if (valorPagoFinal > 0 && formaPagamento) {
      try {
        await Pagamento.create({
          tenantId: req.tenantId,
          transacao: transacao._id,
          valor: valorPagoFinal,
          formaPagamento,
          dataPagamento: new Date(),
          observacoes: (parcelado && temEntrada) ? 'Entrada' : 'Pagamento inicial'
        });
      } catch (pagErr) {
        // Forma de pagamento pode exigir dados adicionais (MBWay, Multibanco, Cartão).
        // Se falhar, log e segue — a transação fica com valorPago mas sem Pagamento detalhado.
        console.warn('[venderPacote] Não foi possível registar Pagamento detalhado:', pagErr.message);
      }
    }

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
    res.status(500).json({ message: 'Erro ao vender pacote', details: error.message });
  }
};

// @desc    Listar pacotes vendidos
// @route   GET /api/compras-pacotes
export const listarComprasPacotes = async (req, res) => {
  try {
    const { CompraPacote } = req.models;
    const {
      status,
      cliente,
      pacote,
      expirando,
      poucasSessoes,
      limit = 50,
      page = 1
    } = req.query;

    const query = { tenantId: req.tenantId };
    if (status) query.status = status;
    if (cliente) query.cliente = cliente;
    if (pacote) query.pacote = pacote;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let comprasPacotes;
    let total;

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
    res.status(500).json({ message: 'Erro ao listar compras de pacotes', details: error.message });
  }
};

// @desc    Buscar pacotes ativos de um cliente
// @route   GET /api/compras-pacotes/cliente/:clienteId
export const pacotesDoCliente = async (req, res) => {
  try {
    const { CompraPacote } = req.models;
    const { clienteId } = req.params;

    const pacotes = await CompraPacote.find({
      tenantId: req.tenantId,
      cliente: clienteId
    })
      .populate('pacote')
      .sort('-dataCompra');

    res.status(200).json(pacotes);

  } catch (error) {
    console.error('Erro ao buscar pacotes do cliente:', error);
    res.status(500).json({ message: 'Erro ao buscar pacotes do cliente', details: error.message });
  }
};

// @desc    Buscar detalhes de um pacote comprado
// @route   GET /api/compras-pacotes/:id
export const buscarCompraPacote = async (req, res) => {
  try {
    const { CompraPacote, Transacao, Pagamento } = req.models;
    const { id } = req.params;

    const compraPacote = await CompraPacote.findOne({ _id: id, tenantId: req.tenantId })
      .populate('cliente', 'nome telefone email')
      .populate('pacote')
      .populate('historico.profissional', 'nome')
      .populate('historico.agendamento')
      .populate('extensoes.realizadoPor', 'nome');

    if (!compraPacote) {
      return res.status(404).json({ message: 'Compra de pacote não encontrada' });
    }

    const transacao = await Transacao.findOne({ compraPacote: id, tenantId: req.tenantId });

    let pagamentos = [];
    if (transacao) {
      pagamentos = await Pagamento.find({ transacao: transacao._id, tenantId: req.tenantId }).sort('-dataPagamento');
    }

    res.status(200).json({ compraPacote, transacao, pagamentos });

  } catch (error) {
    console.error('Erro ao buscar compra:', error);
    res.status(500).json({ message: 'Erro ao buscar compra de pacote', details: error.message });
  }
};

// @desc    Estender prazo de validade de um pacote
// @route   PUT /api/compras-pacotes/:id/estender-prazo
export const estenderPrazo = async (req, res) => {
  try {
    const { CompraPacote } = req.models;
    const { id } = req.params;
    const { novosDias, motivo } = req.body;

    if (!novosDias || novosDias <= 0) {
      return res.status(400).json({ message: 'Número de dias deve ser maior que zero' });
    }

    const compraPacote = await CompraPacote.findOne({ _id: id, tenantId: req.tenantId });

    if (!compraPacote) {
      return res.status(404).json({ message: 'Compra de pacote não encontrada' });
    }

    if (compraPacote.status === 'Concluído') {
      return res.status(400).json({ message: 'Não é possível estender prazo de pacote concluído' });
    }

    if (compraPacote.status === 'Cancelado') {
      return res.status(400).json({ message: 'Não é possível estender prazo de pacote cancelado' });
    }

    await compraPacote.estenderPrazo(novosDias, motivo, req.userId);

    await compraPacote.populate([
      { path: 'cliente', select: 'nome telefone' },
      { path: 'pacote' }
    ]);

    res.status(200).json({ message: `Prazo estendido por ${novosDias} dias`, compraPacote });

  } catch (error) {
    console.error('Erro ao estender prazo:', error);
    res.status(500).json({ message: 'Erro ao estender prazo', details: error.message });
  }
};

// @desc    Cancelar pacote comprado
// @route   PUT /api/compras-pacotes/:id/cancelar
export const cancelarPacote = async (req, res) => {
  try {
    const { CompraPacote, Transacao } = req.models;
    const { id } = req.params;
    const { motivo } = req.body;

    const compraPacote = await CompraPacote.findOne({ _id: id, tenantId: req.tenantId });

    if (!compraPacote) {
      return res.status(404).json({ message: 'Compra de pacote não encontrada' });
    }

    if (compraPacote.status === 'Cancelado') {
      return res.status(400).json({ message: 'Pacote já está cancelado' });
    }

    if (compraPacote.status === 'Concluído') {
      return res.status(400).json({ message: 'Não é possível cancelar pacote concluído' });
    }

    await compraPacote.cancelar(motivo);

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

    res.status(200).json({ message: 'Pacote cancelado com sucesso', compraPacote });

  } catch (error) {
    console.error('Erro ao cancelar pacote:', error);
    res.status(500).json({ message: 'Erro ao cancelar pacote', details: error.message });
  }
};

// @desc    Buscar pacotes expirando em breve
// @route   GET /api/compras-pacotes/expirando
export const pacotesExpirando = async (req, res) => {
  try {
    const { CompraPacote } = req.models;
    const { dias = 7 } = req.query;

    const pacotes = await CompraPacote.buscarExpirandoEmBreve(req.tenantId, parseInt(dias));

    res.status(200).json({ pacotes, quantidade: pacotes.length, diasAlerta: parseInt(dias) });

  } catch (error) {
    console.error('Erro ao buscar pacotes expirando:', error);
    res.status(500).json({ message: 'Erro ao buscar pacotes expirando', details: error.message });
  }
};

// @desc    Buscar alertas (pacotes expirando + poucas sessões)
// @route   GET /api/compras-pacotes/alertas
export const alertasPacotes = async (req, res) => {
  try {
    const { CompraPacote } = req.models;
    const [expirando, poucasSessoes] = await Promise.all([
      CompraPacote.buscarExpirandoEmBreve(req.tenantId, 7),
      CompraPacote.buscarComPoucasSessoes(req.tenantId, 2)
    ]);

    const totalAtivos = await CompraPacote.countDocuments({ tenantId: req.tenantId, status: 'Ativo' });

    res.status(200).json({
      alertas: {
        expirando: { quantidade: expirando.length, pacotes: expirando },
        poucasSessoes: { quantidade: poucasSessoes.length, pacotes: poucasSessoes }
      },
      estatisticas: { totalAtivos, comAlertas: expirando.length + poucasSessoes.length }
    });

  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    res.status(500).json({ message: 'Erro ao buscar alertas', details: error.message });
  }
};

// @desc    Estatísticas de pacotes
// @route   GET /api/compras-pacotes/estatisticas
export const estatisticasPacotes = async (req, res) => {
  try {
    const { CompraPacote } = req.models;
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

    const totais = estatisticas.reduce((acc, stat) => {
      acc.quantidade += stat.quantidade;
      acc.valorTotal += stat.valorTotal;
      acc.valorPago += stat.valorPago;
      acc.sessoesContratadas += stat.sessoesContratadas;
      acc.sessoesUsadas += stat.sessoesUsadas;
      return acc;
    }, { quantidade: 0, valorTotal: 0, valorPago: 0, sessoesContratadas: 0, sessoesUsadas: 0 });

    totais.valorPendente = totais.valorTotal - totais.valorPago;
    totais.sessoesRestantes = totais.sessoesContratadas - totais.sessoesUsadas;
    totais.taxaUso = totais.sessoesContratadas > 0
      ? ((totais.sessoesUsadas / totais.sessoesContratadas) * 100).toFixed(1)
      : 0;

    res.status(200).json({ porStatus: estatisticas, totais });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ message: 'Erro ao buscar estatísticas', details: error.message });
  }
};

// @desc    Editar venda de pacote existente
// @route   PUT /api/compras-pacotes/:id
// Permite corrigir valores, parcelamento e sessões já realizadas.
// Mantém os Pagamentos já registados (histórico imutável) mas recalcula o status
// da Transação com base em `valorPago` actual (soma dos pagamentos) vs `valorTotal` novo.
export const editarVenda = async (req, res) => {
  try {
    const { CompraPacote, Transacao, Pagamento } = req.models;
    const { id } = req.params;
    const {
      valorTotal: valorTotalNovo,
      parcelado,
      numeroParcelas,
      valorEntrada,
      sessoesUsadas,
      diasValidade,
      formaPagamento
    } = req.body;

    const compraPacote = await CompraPacote.findOne({ _id: id, tenantId: req.tenantId });
    if (!compraPacote) {
      return res.status(404).json({ message: 'Compra de pacote não encontrada' });
    }

    if (compraPacote.status === 'Cancelado') {
      return res.status(400).json({ message: 'Não é possível editar pacote cancelado' });
    }

    // Pagamentos existentes mantêm-se; valorPago é a soma real dos pagamentos
    const pagamentos = await Pagamento.find({
      tenantId: req.tenantId,
      transacao: { $in: await Transacao.find({ compraPacote: id, tenantId: req.tenantId }).distinct('_id') }
    });
    const valorPagoReal = pagamentos.reduce((sum, p) => sum + (p.valor || 0), 0);

    // Aplicar alterações
    const valorTotalFinal = valorTotalNovo !== undefined && valorTotalNovo !== null && valorTotalNovo > 0
      ? parseFloat(valorTotalNovo)
      : compraPacote.valorTotal;

    const sessoesUsadasFinal = sessoesUsadas !== undefined
      ? Math.max(0, Math.min(parseInt(sessoesUsadas) || 0, compraPacote.sessoesContratadas))
      : compraPacote.sessoesUsadas;

    const parceladoFinal = parcelado !== undefined ? !!parcelado : compraPacote.parcelado;
    const numParcelasFinal = parceladoFinal
      ? Math.max(1, Math.min(4, parseInt(numeroParcelas) || compraPacote.numeroParcelas || 1))
      : 1;

    // Se frontend enviar valorEntrada explícito, recalcula valorParcela com base no restante
    // Caso contrário, valorParcela = valorTotal / numParcelas (comportamento antigo)
    const temEntrada = valorEntrada !== undefined && valorEntrada !== null;
    const entradaNum = temEntrada ? Math.max(0, parseFloat(valorEntrada) || 0) : 0;
    const valorParcelaNovo = !parceladoFinal
      ? valorTotalFinal
      : temEntrada
        ? Math.max(0, (valorTotalFinal - entradaNum)) / numParcelasFinal
        : valorTotalFinal / numParcelasFinal;

    // Actualizar compraPacote
    compraPacote.valorTotal = valorTotalFinal;
    compraPacote.valorPago = valorPagoReal; // usa soma real dos pagamentos
    compraPacote.valorPendente = Math.max(0, valorTotalFinal - valorPagoReal);
    compraPacote.parcelado = parceladoFinal;
    compraPacote.numeroParcelas = numParcelasFinal;
    compraPacote.valorParcela = valorParcelaNovo;
    compraPacote.sessoesUsadas = sessoesUsadasFinal;
    compraPacote.sessoesRestantes = compraPacote.sessoesContratadas - sessoesUsadasFinal;
    if (parceladoFinal && compraPacote.valorParcela > 0) {
      compraPacote.parcelasPagas = Math.floor(valorPagoReal / compraPacote.valorParcela);
    }
    if (diasValidade !== undefined) {
      compraPacote.diasValidade = diasValidade || null;
    }

    await compraPacote.save();

    // Sincronizar Transação associada
    const transacao = await Transacao.findOne({ compraPacote: id, tenantId: req.tenantId });
    if (transacao) {
      transacao.valor = valorTotalFinal;
      transacao.valorFinal = valorTotalFinal;
      transacao.parcelado = parceladoFinal;
      transacao.numeroParcelas = numParcelasFinal;
      transacao.statusPagamento = valorPagoReal >= valorTotalFinal
        ? 'Pago'
        : (valorPagoReal > 0 ? 'Parcial' : 'Pendente');
      if (formaPagamento) transacao.formaPagamento = formaPagamento;
      if (valorPagoReal >= valorTotalFinal && !transacao.dataPagamento) {
        transacao.dataPagamento = new Date();
      } else if (valorPagoReal < valorTotalFinal) {
        transacao.dataPagamento = null;
      }
      await transacao.save();
    }

    await compraPacote.populate([
      { path: 'cliente', select: 'nome telefone email' },
      { path: 'pacote' }
    ]);

    res.status(200).json({
      message: 'Venda atualizada com sucesso',
      compraPacote,
      transacao
    });

  } catch (error) {
    console.error('Erro ao editar venda:', error);
    res.status(500).json({ message: 'Erro ao editar venda', details: error.message });
  }
};

// @desc    Registar pagamento de parcela de uma compra de pacote
// @route   POST /api/compras-pacotes/:id/registrar-pagamento
// @body    { valor, formaPagamento, dataPagamento?, observacoes? }
//
// Único ponto de entrada para registar pagamento de uma venda parcelada.
// Cria Pagamento + actualiza Transacao + actualiza CompraPacote (valorPago,
// valorPendente, parcelasPagas, statusPagamento). Falha se valor exceder valorPendente.
export const registrarPagamentoParcela = async (req, res) => {
  try {
    const { CompraPacote, Transacao, Pagamento } = req.models;
    const { id } = req.params;
    const { valor, formaPagamento, dataPagamento, observacoes, dataProximaParcela } = req.body;

    const valorNum = parseFloat(valor);
    if (!valorNum || valorNum <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }
    if (!formaPagamento) {
      return res.status(400).json({ message: 'Forma de pagamento é obrigatória' });
    }

    const compraPacote = await CompraPacote.findOne({ _id: id, tenantId: req.tenantId });
    if (!compraPacote) {
      return res.status(404).json({ message: 'Compra de pacote não encontrada' });
    }
    if (compraPacote.status === 'Cancelado') {
      return res.status(400).json({ message: 'Não é possível registar pagamento em pacote cancelado' });
    }

    const valorPendenteAtual = Math.max(0, compraPacote.valorTotal - compraPacote.valorPago);
    if (valorNum > valorPendenteAtual + 0.001) {
      return res.status(400).json({
        message: `Valor (${valorNum.toFixed(2)}) excede pendente (${valorPendenteAtual.toFixed(2)})`
      });
    }

    const transacao = await Transacao.findOne({ compraPacote: id, tenantId: req.tenantId });
    if (!transacao) {
      return res.status(404).json({ message: 'Transação associada não encontrada' });
    }

    const dataPag = dataPagamento ? new Date(dataPagamento) : new Date();

    // 1. Criar Pagamento
    const pagamento = await Pagamento.create({
      tenantId: req.tenantId,
      transacao: transacao._id,
      valor: valorNum,
      formaPagamento,
      dataPagamento: dataPag,
      observacoes: observacoes || `Parcela ${(compraPacote.parcelasPagas || 0) + 1}`
    });

    // 2. Actualizar CompraPacote — usa método do schema (recalcula parcelasPagas, valorPendente)
    //    Após esta chamada, compraPacote.valorPago é a fonte de verdade.
    await compraPacote.registrarPagamento(valorNum);

    // Actualizar data prevista da próxima parcela (e resetar lembrete enviado para a nova data)
    const totalmentePagoApos = compraPacote.valorPago >= compraPacote.valorTotal - 0.001;
    if (totalmentePagoApos) {
      // Pagou tudo — limpar a próxima parcela e o lembrete
      compraPacote.dataProximaParcela = null;
      compraPacote.lembreteParcelaEnviadoEm = null;
    } else if (dataProximaParcela !== undefined) {
      // Utilizador definiu nova data (pode ser null para limpar)
      const novaData = dataProximaParcela ? new Date(dataProximaParcela) : null;
      const mudou = String(compraPacote.dataProximaParcela) !== String(novaData);
      compraPacote.dataProximaParcela = novaData;
      if (mudou) compraPacote.lembreteParcelaEnviadoEm = null;
    }
    await compraPacote.save();

    // 3. Sincronizar Transacao baseado em CompraPacote.valorPago (Transacao não tem campo valorPago)
    const totalmentePago = compraPacote.valorPago >= compraPacote.valorTotal - 0.001;
    transacao.statusPagamento = totalmentePago
      ? 'Pago'
      : (compraPacote.valorPago > 0 ? 'Parcial' : 'Pendente');
    if (transacao.parcelado) {
      transacao.parcelasPagas = compraPacote.parcelasPagas || 0;
    }
    if (totalmentePago && !transacao.dataPagamento) {
      transacao.dataPagamento = dataPag;
    }
    transacao.formaPagamento = formaPagamento;
    await transacao.save();

    await compraPacote.populate([
      { path: 'cliente', select: 'nome telefone email' },
      { path: 'pacote' }
    ]);

    res.status(201).json({
      message: 'Pagamento registado com sucesso',
      pagamento,
      compraPacote,
      transacao
    });

  } catch (error) {
    console.error('Erro ao registar pagamento:', error);
    res.status(500).json({ message: 'Erro ao registar pagamento', details: error.message });
  }
};

// @desc    Deletar compra de pacote (e tudo o que está ligado)
// @route   DELETE /api/compras-pacotes/:id
//
// Cascade delete: CompraPacote → Transacao(es) → Pagamento(s) ligados.
// Sem isto, a Transacao ficaria órfã na lista de Transações.
export const deletarPacote = async (req, res) => {
  try {
    const { CompraPacote, Transacao, Pagamento } = req.models;
    const { id } = req.params;

    const compraPacote = await CompraPacote.findOne({ _id: id, tenantId: req.tenantId });
    if (!compraPacote) {
      return res.status(404).json({ message: 'Pacote não encontrado' });
    }

    // 1. Encontrar todas as Transações ligadas a esta compra
    const transacoes = await Transacao.find({ compraPacote: id, tenantId: req.tenantId }).select('_id');
    const transacaoIds = transacoes.map(t => t._id);

    // 2. Apagar todos os Pagamentos das transações encontradas
    let pagamentosDeletados = 0;
    if (transacaoIds.length > 0) {
      const resPag = await Pagamento.deleteMany({
        tenantId: req.tenantId,
        transacao: { $in: transacaoIds }
      });
      pagamentosDeletados = resPag.deletedCount || 0;
    }

    // 3. Apagar as Transações
    const resTrans = await Transacao.deleteMany({
      tenantId: req.tenantId,
      compraPacote: id
    });

    // 4. Apagar a CompraPacote
    await CompraPacote.deleteOne({ _id: id, tenantId: req.tenantId });

    res.status(200).json({
      message: 'Pacote e registos relacionados deletados com sucesso',
      deletedId: id,
      pagamentosDeletados,
      transacoesDeletadas: resTrans.deletedCount || 0
    });

  } catch (error) {
    console.error('Erro ao deletar pacote:', error);
    res.status(500).json({ message: 'Erro ao deletar pacote', details: error.message });
  }
};
