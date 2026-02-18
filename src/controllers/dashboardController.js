import { DateTime } from 'luxon';
import Cliente from '../models/Cliente.js';
import Pacote from '../models/Pacote.js';
import Agendamento from '../models/Agendamento.js';

// @desc    Agendamentos de hoje
export const getAgendamentosDeHoje = async (req, res) => {
  try {
    const { tenantId } = req;
    const inicioDoDia = DateTime.now().setZone('Europe/Lisbon').startOf('day').toJSDate();
    const fimDoDia = DateTime.now().setZone('Europe/Lisbon').endOf('day').toJSDate();

    const agendamentos = await Agendamento.find({
      tenantId,
      dataHora: { $gte: inicioDoDia, $lte: fimDoDia }
    })
      .populate('cliente', 'nome')
      .populate('pacote', 'nome')
      .select('dataHora status cliente pacote servicoAvulsoNome observacoes')
      .sort({ dataHora: 1 });

    // Garante sempre retornar um array, mesmo que a busca falhe por alguma razão
    res.status(200).json(agendamentos || []);

  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao buscar agendamentos de hoje.', details: error.message });
  }
};

// @desc    Contagem de agendamentos de amanhã
export const getContagemAgendamentosAmanha = async (req, res) => {
  try {
    const { tenantId } = req;
    const inicioDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fimDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    const contagem = await Agendamento.countDocuments({
      tenantId,
      dataHora: { $gte: inicioDeAmanha, $lte: fimDeAmanha }
    });

    res.status(200).json({ contagem });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao contar agendamentos de amanhã.', details: error.message });
  }
};

// @desc    Lista de agendamentos de amanhã
export const getAgendamentosAmanha = async (req, res) => {
  try {
    const { tenantId } = req;
    const inicioDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fimDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    const agendamentos = await Agendamento.find({
      tenantId,
      dataHora: { $gte: inicioDeAmanha, $lte: fimDeAmanha }
    })
      .populate('cliente', 'nome')
      .populate('pacote', 'nome')
      .select('dataHora status cliente pacote servicoAvulsoNome observacoes')
      .sort({ dataHora: 1 });

    res.status(200).json(agendamentos || []);
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao buscar a lista de agendamentos de amanhã.', details: error.message });
  }
};

// @desc    Clientes atendidos na semana
export const getClientesAtendidosSemana = async (req, res) => {
  try {
    const { tenantId } = req;
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const fimDoDia = agora.endOf('day').toJSDate();
    const inicioDosSeteDias = agora.minus({ days: 7 }).startOf('day').toJSDate();

    const contagem = await Agendamento.countDocuments({
      tenantId,
      status: 'Realizado',
      dataHora: { $gte: inicioDosSeteDias, $lte: fimDoDia }
    });

    res.status(200).json({ contagem });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao contar clientes atendidos na semana.', details: error.message });
  }
};

// @desc    Totais gerais
export const getTotaisSistema = async (req, res) => {
  try {
    const { tenantId } = req;
    const totalClientes = await Cliente.countDocuments({ tenantId });
    const totalPacotes = await Pacote.countDocuments({ tenantId });
    const totalAgendamentosGeral = await Agendamento.countDocuments({ tenantId });
    const agora = DateTime.now().setZone('Europe/Lisbon').toJSDate();

    const totalAgendamentosFuturos = await Agendamento.countDocuments({
      tenantId,
      dataHora: { $gte: agora }
    });

    res.status(200).json({
      totalClientes,
      totalPacotes,
      totalAgendamentosGeral,
      totalAgendamentosFuturos
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao buscar totais do sistema.', details: error.message });
  }
};

// @desc    Clientes com sessões baixas
export const getClientesComSessoesBaixas = async (req, res) => {
  try {
    const { tenantId } = req;
    const limite = parseInt(req.query.limite, 10) || 2;
    const clientesBaixos = await Cliente.find({
      tenantId,
      sessoesRestantes: { $lte: limite }
    }).select('nome telefone sessoesRestantes');

    res.status(200).json({ total: clientesBaixos.length, clientes: clientesBaixos || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao buscar clientes com sessões baixas.', details: error.message });
  }
};

// @desc    Próximos agendamentos
export const getProximosAgendamentos = async (req, res) => {
  try {
    const { tenantId } = req;
    const limit = parseInt(req.query.limit, 10) || 5;
    const agora = DateTime.now().setZone('Europe/Lisbon').toJSDate();

    const agendamentos = await Agendamento.find({ tenantId, dataHora: { $gt: agora } })
      .populate('cliente', 'nome')
      .populate('pacote', 'nome')
      .select('dataHora status cliente pacote servicoAvulsoNome observacoes')
      .sort({ dataHora: 1 })
      .limit(limit);

    res.status(200).json({ total: agendamentos.length, agendamentos: agendamentos || [] });
  } catch (error) {
    res.status(500).json({ message: 'Erro interno ao buscar próximos agendamentos.', details: error.message });
  }
};

// @desc    Dados Financeiros (Faturamento e Comparecimento)
export const getDadosFinanceiros = async (req, res) => {
  try {
    const { tenantId } = req;
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const inicioMes = agora.startOf('month').toJSDate();
    const fimMes = agora.endOf('month').toJSDate();

    // 1. Faturamento Mensal (apenas servicos avulsos realizados por enquanto)
    // TODO: Incluir vendas de pacotes quando houver modelo de transação
    const agendamentosRealizados = await Agendamento.find({
      tenantId,
      status: 'Realizado',
      dataHora: { $gte: inicioMes, $lte: fimMes }
    }).select('servicoAvulsoValor');

    const faturamentoMensal = agendamentosRealizados.reduce((acc, curr) => acc + (curr.servicoAvulsoValor || 0), 0);

    // 2. Taxa de Comparecimento
    // Considera: Realizado, Cancelado (ambos), Não Compareceu
    const agendamentosTotaisMes = await Agendamento.countDocuments({
      tenantId,
      dataHora: { $gte: inicioMes, $lte: fimMes },
      status: { $in: ['Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu'] }
    });

    const agendamentosComparecidos = await Agendamento.countDocuments({
      tenantId,
      dataHora: { $gte: inicioMes, $lte: fimMes },
      status: 'Realizado'
    });

    let taxaComparecimento = 0;
    if (agendamentosTotaisMes > 0) {
      taxaComparecimento = Math.round((agendamentosComparecidos / agendamentosTotaisMes) * 100);
    }

    // Comparativo (Mockado por enquanto para UI, ou calcular mês anterior)
    const inicioMesAnterior = agora.minus({ months: 1 }).startOf('month').toJSDate();
    const fimMesAnterior = agora.minus({ months: 1 }).endOf('month').toJSDate();

    const realizadosMesAnterior = await Agendamento.find({
      tenantId,
      status: 'Realizado',
      dataHora: { $gte: inicioMesAnterior, $lte: fimMesAnterior }
    }).select('servicoAvulsoValor');

    const faturamentoMesAnterior = realizadosMesAnterior.reduce((acc, curr) => acc + (curr.servicoAvulsoValor || 0), 0);

    let crescimentoFaturamento = 0;
    if (faturamentoMesAnterior > 0) {
      crescimentoFaturamento = Math.round(((faturamentoMensal - faturamentoMesAnterior) / faturamentoMesAnterior) * 100);
    } else if (faturamentoMensal > 0) {
      crescimentoFaturamento = 100; // Crescimento infinito se partiu de 0
    }

    res.status(200).json({
      faturamentoMensal,
      faturamentoMesAnterior,
      crescimentoFaturamento,
      taxaComparecimento,
      agendamentosTotaisMes
    });

  } catch (error) {
    console.error('Erro em getDadosFinanceiros:', error);
    res.status(500).json({ message: 'Erro ao buscar dados financeiros.', details: error.message });
  }
};