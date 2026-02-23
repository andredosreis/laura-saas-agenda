import { DateTime } from 'luxon';

// @desc    Abrir caixa do dia
// @route   POST /api/caixa/abrir
export const abrirCaixa = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { valorInicial = 0 } = req.body;

    const hoje = DateTime.now().setZone('Europe/Lisbon').startOf('day');

    const caixaExistente = await Transacao.findOne({
      tenantId: req.tenantId,
      categoria: 'Outros',
      descricao: { $regex: /^Abertura de Caixa/ },
      createdAt: { $gte: hoje.toJSDate(), $lt: hoje.plus({ days: 1 }).toJSDate() }
    });

    if (caixaExistente) {
      return res.status(400).json({
        message: 'Caixa já foi aberto hoje',
        horarioAbertura: caixaExistente.createdAt
      });
    }

    if (valorInicial > 0) {
      await Transacao.create({
        tenantId: req.tenantId,
        tipo: 'Receita',
        categoria: 'Outros',
        valor: valorInicial,
        desconto: 0,
        valorFinal: valorInicial,
        descricao: `Abertura de Caixa - ${hoje.toFormat('dd/MM/yyyy')}`,
        statusPagamento: 'Pago',
        formaPagamento: 'Dinheiro',
        dataPagamento: new Date()
      });
    }

    res.status(201).json({
      message: 'Caixa aberto com sucesso',
      data: hoje.toFormat('dd/MM/yyyy'),
      horario: DateTime.now().setZone('Europe/Lisbon').toFormat('HH:mm'),
      valorInicial
    });

  } catch (error) {
    console.error('Erro ao abrir caixa:', error);
    res.status(500).json({ message: 'Erro ao abrir caixa', details: error.message });
  }
};

// @desc    Buscar status do caixa
// @route   GET /api/caixa/status
export const statusCaixa = async (req, res) => {
  try {
    const { Transacao, Pagamento } = req.models;
    const { data } = req.query;

    const dataConsulta = data
      ? DateTime.fromISO(data).setZone('Europe/Lisbon')
      : DateTime.now().setZone('Europe/Lisbon');

    const inicioDia = dataConsulta.startOf('day').toJSDate();
    const fimDia = dataConsulta.endOf('day').toJSDate();

    const pagamentos = await Pagamento.find({
      tenantId: req.tenantId,
      dataPagamento: { $gte: inicioDia, $lte: fimDia }
    }).populate({ path: 'transacao', select: 'tipo categoria valorFinal' });

    const abertura = await Transacao.findOne({
      tenantId: req.tenantId,
      descricao: { $regex: /^Abertura de Caixa/ },
      createdAt: { $gte: inicioDia, $lt: fimDia }
    });

    const fechamento = await Transacao.findOne({
      tenantId: req.tenantId,
      descricao: { $regex: /^Fechamento de Caixa/ },
      createdAt: { $gte: inicioDia, $lt: fimDia }
    });

    const [sangrias, suprimentos] = await Promise.all([
      Transacao.find({
        tenantId: req.tenantId,
        tipo: 'Despesa',
        categoria: 'Outros',
        descricao: { $regex: /Sangria/ },
        createdAt: { $gte: inicioDia, $lt: fimDia }
      }),
      Transacao.find({
        tenantId: req.tenantId,
        tipo: 'Receita',
        categoria: 'Outros',
        descricao: { $regex: /Suprimento/ },
        createdAt: { $gte: inicioDia, $lt: fimDia }
      })
    ]);

    const totaisPorForma = {};
    let totalReceitas = 0;
    let totalDespesas = 0;

    pagamentos.forEach(pag => {
      const forma = pag.formaPagamento;
      const transacao = pag.transacao;

      if (!totaisPorForma[forma]) {
        totaisPorForma[forma] = { receitas: 0, despesas: 0, quantidade: 0 };
      }

      totaisPorForma[forma].quantidade += 1;

      if (transacao.tipo === 'Receita') {
        totaisPorForma[forma].receitas += pag.valor;
        totalReceitas += pag.valor;
      } else if (transacao.tipo === 'Despesa') {
        totaisPorForma[forma].despesas += pag.valor;
        totalDespesas += pag.valor;
      }
    });

    const totalSangrias = sangrias.reduce((sum, s) => sum + s.valorFinal, 0);
    const totalSuprimentos = suprimentos.reduce((sum, s) => sum + s.valorFinal, 0);

    const valorAbertura = abertura ? abertura.valorFinal : 0;
    const saldoAtual = valorAbertura + totalReceitas - totalDespesas + totalSuprimentos - totalSangrias;

    res.status(200).json({
      data: dataConsulta.toFormat('dd/MM/yyyy'),
      status: fechamento ? 'Fechado' : 'Aberto',
      abertura: abertura ? {
        horario: DateTime.fromJSDate(abertura.createdAt).setZone('Europe/Lisbon').toFormat('HH:mm'),
        valor: abertura.valorFinal
      } : null,
      fechamento: fechamento ? {
        horario: DateTime.fromJSDate(fechamento.createdAt).setZone('Europe/Lisbon').toFormat('HH:mm'),
        saldoFinal: fechamento.valorFinal,
        observacoes: fechamento.observacoes
      } : null,
      movimentacao: { receitas: totalReceitas, despesas: totalDespesas, suprimentos: totalSuprimentos, sangrias: totalSangrias, saldoAtual },
      totaisPorForma,
      detalhes: {
        quantidadeSangrias: sangrias.length,
        quantidadeSuprimentos: suprimentos.length,
        quantidadePagamentos: pagamentos.length
      }
    });

  } catch (error) {
    console.error('Erro ao buscar status do caixa:', error);
    res.status(500).json({ message: 'Erro ao buscar status do caixa', details: error.message });
  }
};

// @desc    Registrar sangria (retirada de dinheiro)
// @route   POST /api/caixa/sangria
export const registrarSangria = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { valor, motivo, formaPagamento = 'Dinheiro' } = req.body;

    if (!valor || valor <= 0) {
      return res.status(400).json({ message: 'Valor da sangria deve ser maior que zero' });
    }

    if (!motivo) {
      return res.status(400).json({ message: 'Motivo da sangria é obrigatório' });
    }

    const hoje = DateTime.now().setZone('Europe/Lisbon');

    const sangria = await Transacao.create({
      tenantId: req.tenantId,
      tipo: 'Despesa',
      categoria: 'Outros',
      valor, desconto: 0, valorFinal: valor,
      descricao: `Sangria - ${motivo}`,
      observacoes: `Sangria realizada em ${hoje.toFormat('dd/MM/yyyy HH:mm')}`,
      statusPagamento: 'Pago',
      formaPagamento,
      dataPagamento: new Date()
    });

    res.status(201).json({
      message: 'Sangria registrada com sucesso',
      sangria: { id: sangria._id, valor: sangria.valorFinal, motivo, formaPagamento: sangria.formaPagamento, horario: hoje.toFormat('HH:mm') }
    });

  } catch (error) {
    console.error('Erro ao registrar sangria:', error);
    res.status(500).json({ message: 'Erro ao registrar sangria', details: error.message });
  }
};

// @desc    Registrar suprimento (entrada de dinheiro)
// @route   POST /api/caixa/suprimento
export const registrarSuprimento = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { valor, motivo, formaPagamento = 'Dinheiro' } = req.body;

    if (!valor || valor <= 0) {
      return res.status(400).json({ message: 'Valor do suprimento deve ser maior que zero' });
    }

    if (!motivo) {
      return res.status(400).json({ message: 'Motivo do suprimento é obrigatório' });
    }

    const hoje = DateTime.now().setZone('Europe/Lisbon');

    const suprimento = await Transacao.create({
      tenantId: req.tenantId,
      tipo: 'Receita',
      categoria: 'Outros',
      valor, desconto: 0, valorFinal: valor,
      descricao: `Suprimento - ${motivo}`,
      observacoes: `Suprimento realizado em ${hoje.toFormat('dd/MM/yyyy HH:mm')}`,
      statusPagamento: 'Pago',
      formaPagamento,
      dataPagamento: new Date()
    });

    res.status(201).json({
      message: 'Suprimento registrado com sucesso',
      suprimento: { id: suprimento._id, valor: suprimento.valorFinal, motivo, formaPagamento: suprimento.formaPagamento, horario: hoje.toFormat('HH:mm') }
    });

  } catch (error) {
    console.error('Erro ao registrar suprimento:', error);
    res.status(500).json({ message: 'Erro ao registrar suprimento', details: error.message });
  }
};

// @desc    Fechar caixa do dia
// @route   POST /api/caixa/fechar
export const fecharCaixa = async (req, res) => {
  try {
    const { Transacao, Pagamento } = req.models;
    const { saldoContado, observacoes = '' } = req.body;

    if (saldoContado === undefined || saldoContado < 0) {
      return res.status(400).json({ message: 'Saldo contado é obrigatório e deve ser maior ou igual a zero' });
    }

    const hoje = DateTime.now().setZone('Europe/Lisbon');
    const inicioDia = hoje.startOf('day').toJSDate();
    const fimDia = hoje.endOf('day').toJSDate();

    const fechamentoExistente = await Transacao.findOne({
      tenantId: req.tenantId,
      descricao: { $regex: /^Fechamento de Caixa/ },
      createdAt: { $gte: inicioDia, $lt: fimDia }
    });

    if (fechamentoExistente) {
      return res.status(400).json({ message: 'Caixa já foi fechado hoje', horarioFechamento: fechamentoExistente.createdAt });
    }

    const pagamentos = await Pagamento.find({
      tenantId: req.tenantId,
      dataPagamento: { $gte: inicioDia, $lte: fimDia }
    }).populate({ path: 'transacao', select: 'tipo valorFinal' });

    const abertura = await Transacao.findOne({
      tenantId: req.tenantId,
      descricao: { $regex: /^Abertura de Caixa/ },
      createdAt: { $gte: inicioDia, $lt: fimDia }
    });

    const sangrias = await Transacao.find({
      tenantId: req.tenantId, tipo: 'Despesa', categoria: 'Outros',
      descricao: { $regex: /Sangria/ },
      createdAt: { $gte: inicioDia, $lt: fimDia }
    });

    const suprimentos = await Transacao.find({
      tenantId: req.tenantId, tipo: 'Receita', categoria: 'Outros',
      descricao: { $regex: /Suprimento/ },
      createdAt: { $gte: inicioDia, $lt: fimDia }
    });

    const valorAbertura = abertura ? abertura.valorFinal : 0;
    let totalReceitas = 0;
    let totalDespesas = 0;

    pagamentos.forEach(pag => {
      if (pag.transacao.tipo === 'Receita') {
        totalReceitas += pag.valor;
      } else if (pag.transacao.tipo === 'Despesa') {
        totalDespesas += pag.valor;
      }
    });

    const totalSangrias = sangrias.reduce((sum, s) => sum + s.valorFinal, 0);
    const totalSuprimentos = suprimentos.reduce((sum, s) => sum + s.valorFinal, 0);

    const saldoEsperado = valorAbertura + totalReceitas - totalDespesas + totalSuprimentos - totalSangrias;
    const diferenca = saldoContado - saldoEsperado;

    await Transacao.create({
      tenantId: req.tenantId,
      tipo: diferenca >= 0 ? 'Receita' : 'Despesa',
      categoria: 'Outros',
      valor: Math.abs(diferenca),
      desconto: 0,
      valorFinal: saldoContado,
      descricao: `Fechamento de Caixa - ${hoje.toFormat('dd/MM/yyyy')}`,
      observacoes: `${observacoes}\n\nSaldo Esperado: €${saldoEsperado.toFixed(2)}\nSaldo Contado: €${saldoContado.toFixed(2)}\nDiferença: €${diferenca.toFixed(2)}`,
      statusPagamento: 'Pago',
      formaPagamento: 'Dinheiro',
      dataPagamento: new Date()
    });

    res.status(201).json({
      message: 'Caixa fechado com sucesso',
      fechamento: {
        horario: hoje.toFormat('HH:mm'),
        saldoEsperado, saldoContado, diferenca,
        resumo: { abertura: valorAbertura, receitas: totalReceitas, despesas: totalDespesas, suprimentos: totalSuprimentos, sangrias: totalSangrias }
      }
    });

  } catch (error) {
    console.error('Erro ao fechar caixa:', error);
    res.status(500).json({ message: 'Erro ao fechar caixa', details: error.message });
  }
};

// @desc    Relatório de caixas (histórico)
// @route   GET /api/caixa/relatorio
export const relatorioCaixas = async (req, res) => {
  try {
    const { Transacao } = req.models;
    const { dataInicio, dataFim, limit = 30 } = req.query;

    const query = {
      tenantId: req.tenantId,
      descricao: { $regex: /^Fechamento de Caixa/ }
    };

    if (dataInicio || dataFim) {
      query.createdAt = {};
      if (dataInicio) query.createdAt.$gte = new Date(dataInicio);
      if (dataFim) query.createdAt.$lte = new Date(dataFim);
    }

    const fechamentos = await Transacao.find(query).sort('-createdAt').limit(parseInt(limit));

    const relatorio = fechamentos.map(f => {
      const obsLines = f.observacoes.split('\n');
      const saldoEsperadoLine = obsLines.find(l => l.includes('Saldo Esperado'));
      const saldoContadoLine = obsLines.find(l => l.includes('Saldo Contado'));
      const diferencaLine = obsLines.find(l => l.includes('Diferença'));

      const extrairValor = (linha) => {
        if (!linha) return 0;
        const match = linha.match(/€([\d.-]+)/);
        return match ? parseFloat(match[1]) : 0;
      };

      return {
        data: DateTime.fromJSDate(f.createdAt).setZone('Europe/Lisbon').toFormat('dd/MM/yyyy'),
        horario: DateTime.fromJSDate(f.createdAt).setZone('Europe/Lisbon').toFormat('HH:mm'),
        saldoEsperado: extrairValor(saldoEsperadoLine),
        saldoContado: extrairValor(saldoContadoLine),
        diferenca: extrairValor(diferencaLine),
        observacoes: f.observacoes.split('\n\n')[0]
      };
    });

    res.status(200).json({ relatorio, quantidade: relatorio.length });

  } catch (error) {
    console.error('Erro ao buscar relatório:', error);
    res.status(500).json({ message: 'Erro ao buscar relatório de caixas', details: error.message });
  }
};
