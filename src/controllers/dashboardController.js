import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import Cliente from '../models/Cliente.js';
import Pacote from '../models/Pacote.js';
import Agendamento from '../models/Agendamento.js';
import CompraPacote from '../models/CompraPacote.js';
import logger from '../utils/logger.js';

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

// Helper: faturamento = vendas de pacotes (valorPago) + serviços avulsos realizados
async function calcularFaturamento(tenantId, inicio, fim) {
  const tid = new mongoose.Types.ObjectId(tenantId);
  const [pacotesRes, avulsosRes] = await Promise.all([
    // Vendas de pacotes registadas no período (dinheiro recebido)
    CompraPacote.aggregate([
      {
        $match: {
          tenantId: tid,
          status: { $ne: 'Cancelado' },
          dataCompra: { $gte: inicio, $lte: fim }
        }
      },
      { $group: { _id: null, total: { $sum: '$valorPago' } } }
    ]),
    // Serviços avulsos realizados no período (sem pacote)
    Agendamento.aggregate([
      {
        $match: {
          tenantId: tid,
          status: 'Realizado',
          dataHora: { $gte: inicio, $lte: fim },
          servicoAvulsoValor: { $gt: 0 }
        }
      },
      { $group: { _id: null, total: { $sum: '$servicoAvulsoValor' } } }
    ])
  ]);
  return (pacotesRes[0]?.total || 0) + (avulsosRes[0]?.total || 0);
}

// @desc    Dados Financeiros (Faturamento e Comparecimento)
export const getDadosFinanceiros = async (req, res) => {
  try {
    const { tenantId } = req;
    const tid = new mongoose.Types.ObjectId(tenantId);
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const inicioMes = agora.startOf('month').toJSDate();
    const fimMes = agora.endOf('month').toJSDate();

    // 1. Faturamento total acumulado: pacotes (sem filtro de data) + avulsos do mês
    const [pacotesRes, avulsosRes] = await Promise.all([
      // Pacotes: total acumulado (sem filtro de data)
      CompraPacote.aggregate([
        {
          $match: {
            tenantId: tid,
            status: { $ne: 'Cancelado' }
          }
        },
        { $group: { _id: null, total: { $sum: '$valorPago' } } }
      ]),
      // Serviços avulsos: filtrados pelo mês actual
      Agendamento.aggregate([
        {
          $match: {
            tenantId: tid,
            status: 'Realizado',
            dataHora: { $gte: inicioMes, $lte: fimMes },
            servicoAvulsoValor: { $gt: 0 }
          }
        },
        { $group: { _id: null, total: { $sum: '$servicoAvulsoValor' } } }
      ])
    ]);

    const faturamentoPacotes = pacotesRes[0]?.total || 0;
    const faturamentoAvulsos = avulsosRes[0]?.total || 0;
    const faturamentoMensal = faturamentoPacotes + faturamentoAvulsos;

    // Log de diagnóstico
    const countPacotes = await CompraPacote.countDocuments({ tenantId: tid, status: { $ne: 'Cancelado' } });
    logger.info({ tenantId, countPacotes, faturamentoPacotes, faturamentoAvulsos, faturamentoMensal }, 'getDadosFinanceiros — diagnóstico');

    // 2. Taxa de Comparecimento
    const [agendamentosTotaisMes, agendamentosComparecidos] = await Promise.all([
      Agendamento.countDocuments({
        tenantId,
        dataHora: { $gte: inicioMes, $lte: fimMes },
        status: { $in: ['Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu'] }
      }),
      Agendamento.countDocuments({
        tenantId,
        dataHora: { $gte: inicioMes, $lte: fimMes },
        status: 'Realizado'
      }),
    ]);

    const taxaComparecimento = agendamentosTotaisMes > 0
      ? Math.round((agendamentosComparecidos / agendamentosTotaisMes) * 100)
      : 0;

    res.status(200).json({
      faturamentoMensal: Math.round(faturamentoMensal * 100) / 100,
      taxaComparecimento,
      agendamentosTotaisMes
    });

  } catch (error) {
    logger.error({ err: error }, 'Erro em getDadosFinanceiros');
    res.status(500).json({ message: 'Erro ao buscar dados financeiros.', details: error.message });
  }
};