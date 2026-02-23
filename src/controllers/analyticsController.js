import { DateTime } from 'luxon';
import mongoose from 'mongoose';

/**
 * @desc    Busca clientes com um número baixo de sessões restantes num pacote.
 * @route   GET /api/analytics/sessoes-baixas
 */
export const getAlertaSessoesBaixas = async (req, res) => {
  try {
    const { Cliente } = req.models;
    const tenantId = req.tenantId;
    const limiteSessoes = parseInt(req.query.limite, 10) || 1;

    const clientesComSessoesBaixas = await Cliente.find({
      tenantId,
      pacote: { $ne: null },
      sessoesRestantes: { $lte: limiteSessoes, $gte: 0 }
    })
      .populate('pacote', 'nome sessoes')
      .select('nome telefone sessoesRestantes pacote email');

    res.status(200).json(clientesComSessoesBaixas);

  } catch (error) {
    console.error('Erro ao buscar alerta de sessões baixas:', error);
    res.status(500).json({ message: 'Erro interno ao buscar alerta de sessões baixas.', details: error.message });
  }
};

/**
 * @desc    Obtém receita temporal agrupada por período
 * @route   GET /api/analytics/receita-temporal
 */
export const getReceitaTemporal = async (req, res) => {
  try {
    const { Agendamento, CompraPacote } = req.models;
    const tenantId = new mongoose.Types.ObjectId(req.tenantId);
    const { periodo = 'dia', dias = 30 } = req.query;

    const dataFim = DateTime.now().setZone('Europe/Lisbon').endOf('day');
    const dataInicio = dataFim.minus({ days: parseInt(dias) }).startOf('day');

    let dateFormat;
    switch (periodo) {
      case 'semana':
        dateFormat = { year: { $year: '$dataHora' }, week: { $isoWeek: '$dataHora' } };
        break;
      case 'mes':
        dateFormat = { year: { $year: '$dataHora' }, month: { $month: '$dataHora' } };
        break;
      default:
        dateFormat = { year: { $year: '$dataHora' }, month: { $month: '$dataHora' }, day: { $dayOfMonth: '$dataHora' } };
    }

    const resultados = await Agendamento.aggregate([
      {
        $match: {
          tenantId: tenantId,
          status: 'Realizado',
          dataHora: { $gte: dataInicio.toJSDate(), $lte: dataFim.toJSDate() }
        }
      },
      {
        $lookup: {
          from: 'pacotes',
          localField: 'pacote',
          foreignField: '_id',
          as: 'pacoteInfo'
        }
      },
      { $unwind: { path: '$pacoteInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          receita: {
            $cond: {
              if: { $gt: ['$servicoAvulsoValor', 0] },
              then: '$servicoAvulsoValor',
              else: {
                $cond: {
                  if: { $and: [{ $gt: ['$pacoteInfo.valor', 0] }, { $gt: ['$pacoteInfo.sessoes', 0] }] },
                  then: { $divide: ['$pacoteInfo.valor', '$pacoteInfo.sessoes'] },
                  else: 0
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: dateFormat,
          receita: { $sum: '$receita' },
          agendamentos: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.day': 1 } },
      {
        $project: {
          _id: 0,
          periodo: '$_id',
          receita: { $round: ['$receita', 2] },
          agendamentos: 1,
          media: {
            $cond: {
              if: { $eq: ['$agendamentos', 0] },
              then: 0,
              else: { $round: [{ $divide: ['$receita', '$agendamentos'] }, 2] }
            }
          }
        }
      }
    ]);

    const formatarChave = (periodo_obj) => {
      if (periodo === 'semana') return `Sem ${periodo_obj.week}/${periodo_obj.year}`;
      if (periodo === 'mes') {
        return DateTime.fromObject({ year: periodo_obj.year, month: periodo_obj.month })
          .toFormat('MMM/yy', { locale: 'pt' });
      }
      return DateTime.fromObject({ year: periodo_obj.year, month: periodo_obj.month, day: periodo_obj.day })
        .toFormat('dd/MM');
    };

    let compraPacoteDateFormat;
    switch (periodo) {
      case 'semana':
        compraPacoteDateFormat = { year: { $year: '$dataCompra' }, week: { $isoWeek: '$dataCompra' } };
        break;
      case 'mes':
        compraPacoteDateFormat = { year: { $year: '$dataCompra' }, month: { $month: '$dataCompra' } };
        break;
      default:
        compraPacoteDateFormat = { year: { $year: '$dataCompra' }, month: { $month: '$dataCompra' }, day: { $dayOfMonth: '$dataCompra' } };
    }

    const resultadosPacotes = await CompraPacote.aggregate([
      {
        $match: {
          tenantId,
          status: { $ne: 'Cancelado' }
        }
      },
      {
        $group: {
          _id: compraPacoteDateFormat,
          receita: { $sum: '$valorPago' },
          agendamentos: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.day': 1 } }
    ]);

    const mapa = new Map();

    for (const r of resultados) {
      const chave = formatarChave(r.periodo);
      mapa.set(chave, { data: chave, receita: r.receita, agendamentos: r.agendamentos });
    }

    for (const r of resultadosPacotes) {
      const chave = formatarChave(r._id);
      const existente = mapa.get(chave) || { data: chave, receita: 0, agendamentos: 0 };
      mapa.set(chave, {
        data: chave,
        receita: existente.receita + r.receita,
        agendamentos: existente.agendamentos + r.agendamentos
      });
    }

    const dados = Array.from(mapa.values())
      .map(d => ({
        data: d.data,
        receita: Math.round(d.receita * 100) / 100,
        agendamentos: d.agendamentos,
        media: d.agendamentos > 0 ? Math.round((d.receita / d.agendamentos) * 100) / 100 : 0
      }));

    res.status(200).json({ success: true, periodo, dias: parseInt(dias), dados });

  } catch (error) {
    console.error('Erro ao buscar receita temporal:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar receita temporal.', details: error.message });
  }
};

/**
 * @desc    Obtém distribuição de serviços por receita
 * @route   GET /api/analytics/distribuicao-servicos
 */
export const getDistribuicaoServicos = async (req, res) => {
  try {
    const { Agendamento, CompraPacote } = req.models;
    const tenantId = new mongoose.Types.ObjectId(req.tenantId);
    const { dataInicio, dataFim } = req.query;

    const fim = dataFim
      ? DateTime.fromISO(dataFim, { zone: 'Europe/Lisbon' }).endOf('day')
      : DateTime.now().setZone('Europe/Lisbon').endOf('day');
    const inicio = dataInicio
      ? DateTime.fromISO(dataInicio, { zone: 'Europe/Lisbon' }).startOf('day')
      : fim.minus({ months: 1 }).startOf('day');

    const resultados = await Agendamento.aggregate([
      {
        $match: {
          tenantId: tenantId,
          status: 'Realizado',
          dataHora: { $gte: inicio.toJSDate(), $lte: fim.toJSDate() }
        }
      },
      { $lookup: { from: 'pacotes', localField: 'pacote', foreignField: '_id', as: 'pacoteInfo' } },
      { $unwind: { path: '$pacoteInfo', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          nomeServico: {
            $cond: {
              if: { $gt: [{ $strLenCP: { $ifNull: ['$servicoAvulsoNome', ''] } }, 0] },
              then: '$servicoAvulsoNome',
              else: { $ifNull: ['$pacoteInfo.nome', 'Serviço não identificado'] }
            }
          },
          receita: {
            $cond: {
              if: { $gt: ['$servicoAvulsoValor', 0] },
              then: '$servicoAvulsoValor',
              else: {
                $cond: {
                  if: { $and: [{ $gt: ['$pacoteInfo.valor', 0] }, { $gt: ['$pacoteInfo.sessoes', 0] }] },
                  then: { $divide: ['$pacoteInfo.valor', '$pacoteInfo.sessoes'] },
                  else: 0
                }
              }
            }
          }
        }
      },
      { $group: { _id: '$nomeServico', quantidade: { $sum: 1 }, receita: { $sum: '$receita' } } },
      { $sort: { receita: -1 } }
    ]);

    const resultadosPacotes = await CompraPacote.aggregate([
      { $match: { tenantId, status: { $ne: 'Cancelado' } } },
      { $lookup: { from: 'pacotes', localField: 'pacote', foreignField: '_id', as: 'pacoteInfo' } },
      { $unwind: { path: '$pacoteInfo', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ['$pacoteInfo.nome', 'Pacote'] },
          quantidade: { $sum: 1 },
          receita: { $sum: '$valorPago' }
        }
      }
    ]);

    const mapaServicos = new Map();

    for (const r of resultados) {
      const nome = r._id;
      const existente = mapaServicos.get(nome) || { nome, quantidade: 0, receita: 0 };
      mapaServicos.set(nome, { nome, quantidade: existente.quantidade + r.quantidade, receita: existente.receita + r.receita });
    }
    for (const r of resultadosPacotes) {
      const nome = r._id;
      const existente = mapaServicos.get(nome) || { nome, quantidade: 0, receita: 0 };
      mapaServicos.set(nome, { nome, quantidade: existente.quantidade + r.quantidade, receita: existente.receita + r.receita });
    }

    const totalReceita = Array.from(mapaServicos.values()).reduce((acc, r) => acc + r.receita, 0);
    const servicos = Array.from(mapaServicos.values())
      .sort((a, b) => b.receita - a.receita)
      .map(r => ({
        nome: r.nome,
        quantidade: r.quantidade,
        receita: Math.round(r.receita * 100) / 100,
        percentual: totalReceita > 0 ? Math.round((r.receita / totalReceita) * 100) : 0
      }));

    res.status(200).json({
      success: true,
      dataInicio: inicio.toISODate(),
      dataFim: fim.toISODate(),
      servicos,
      totalReceita: Math.round(totalReceita * 100) / 100
    });

  } catch (error) {
    console.error('Erro ao buscar distribuição de serviços:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar distribuição de serviços.', details: error.message });
  }
};

/**
 * @desc    Obtém ranking de clientes por receita
 * @route   GET /api/analytics/top-clientes
 */
export const getTopClientes = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const tenantId = new mongoose.Types.ObjectId(req.tenantId);
    const { limite = 10, dataInicio, dataFim } = req.query;

    const fim = dataFim
      ? DateTime.fromISO(dataFim, { zone: 'Europe/Lisbon' }).endOf('day')
      : DateTime.now().setZone('Europe/Lisbon').endOf('day');
    const inicio = dataInicio
      ? DateTime.fromISO(dataInicio, { zone: 'Europe/Lisbon' }).startOf('day')
      : fim.minus({ months: 1 }).startOf('day');

    const resultados = await Agendamento.aggregate([
      {
        $match: {
          tenantId: tenantId,
          status: 'Realizado',
          dataHora: { $gte: inicio.toJSDate(), $lte: fim.toJSDate() }
        }
      },
      { $lookup: { from: 'pacotes', localField: 'pacote', foreignField: '_id', as: 'pacoteInfo' } },
      { $unwind: { path: '$pacoteInfo', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'clientes', localField: 'cliente', foreignField: '_id', as: 'clienteInfo' } },
      { $unwind: '$clienteInfo' },
      {
        $addFields: {
          receita: {
            $cond: {
              if: { $gt: ['$servicoAvulsoValor', 0] },
              then: '$servicoAvulsoValor',
              else: {
                $cond: {
                  if: { $and: [{ $gt: ['$pacoteInfo.valor', 0] }, { $gt: ['$pacoteInfo.sessoes', 0] }] },
                  then: { $divide: ['$pacoteInfo.valor', '$pacoteInfo.sessoes'] },
                  else: 0
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$cliente',
          nome: { $first: '$clienteInfo.nome' },
          telefone: { $first: '$clienteInfo.telefone' },
          email: { $first: '$clienteInfo.email' },
          receita: { $sum: '$receita' },
          agendamentos: { $sum: 1 }
        }
      },
      { $sort: { receita: -1 } },
      { $limit: parseInt(limite) },
      {
        $project: {
          _id: 0,
          clienteId: '$_id',
          nome: 1,
          telefone: 1,
          email: 1,
          receita: { $round: ['$receita', 2] },
          agendamentos: 1,
          ticketMedio: {
            $cond: {
              if: { $eq: ['$agendamentos', 0] },
              then: 0,
              else: { $round: [{ $divide: ['$receita', '$agendamentos'] }, 2] }
            }
          }
        }
      }
    ]);

    const clientes = resultados.map((c, idx) => ({ ranking: idx + 1, ...c }));

    res.status(200).json({
      success: true,
      dataInicio: inicio.toISODate(),
      dataFim: fim.toISODate(),
      clientes
    });

  } catch (error) {
    console.error('Erro ao buscar top clientes:', error);
    res.status(500).json({ success: false, message: 'Erro ao buscar top clientes.', details: error.message });
  }
};
