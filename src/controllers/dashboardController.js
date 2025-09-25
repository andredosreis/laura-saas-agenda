import { DateTime } from 'luxon';
import Cliente from '../models/Cliente.js';
import Pacote from '../models/Pacote.js';
import Agendamento from '../models/Agendamento.js';

// @desc    Agendamentos de hoje
export const getAgendamentosDeHoje = async (req, res) => {
  try {
    const inicioDoDia = DateTime.now().setZone('Europe/Lisbon').startOf('day').toJSDate();
    const fimDoDia = DateTime.now().setZone('Europe/Lisbon').endOf('day').toJSDate();

    const agendamentos = await Agendamento.find({
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
    const inicioDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fimDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    const contagem = await Agendamento.countDocuments({
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
    const inicioDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fimDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    const agendamentos = await Agendamento.find({
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
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const fimDoDia = agora.endOf('day').toJSDate();
    const inicioDosSeteDias = agora.minus({ days: 7 }).startOf('day').toJSDate();

    const contagem = await Agendamento.countDocuments({
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
    const totalClientes = await Cliente.countDocuments();
    const totalPacotes = await Pacote.countDocuments();
    const totalAgendamentosGeral = await Agendamento.countDocuments();
    const agora = DateTime.now().setZone('Europe/Lisbon').toJSDate();

    const totalAgendamentosFuturos = await Agendamento.countDocuments({
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
    const limite = parseInt(req.query.limite, 10) || 2;
    const clientesBaixos = await Cliente.find({
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
    const limit = parseInt(req.query.limit, 10) || 5;
    const agora = DateTime.now().setZone('Europe/Lisbon').toJSDate();

    const agendamentos = await Agendamento.find({ dataHora: { $gt: agora } })
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