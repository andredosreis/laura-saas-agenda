import Cliente from '../models/Cliente.js';
import Agendamento from '../models/Agendamento.js';
import Pacote from '../models/Pacote.js';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';

/**
 * @desc    Busca clientes com um número baixo de sessões restantes num pacote.
 * @route   GET /api/analytics/sessoes-baixas
 * @access  Private
 */
export const getAlertaSessoesBaixas = async (req, res) => {
  try {
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
 * @query   periodo ('dia'|'semana'|'mes'), dias (número de dias para trás)
 * @access  Private
 */
export const getReceitaTemporal = async (req, res) => {
  try {
    // Converter tenantId para ObjectId para agregação
    const tenantId = new mongoose.Types.ObjectId(req.tenantId);
    const { periodo = 'dia', dias = 30 } = req.query;

    // Calcular data de início
    const dataFim = DateTime.now().setZone('Europe/Lisbon').endOf('day');
    const dataInicio = dataFim.minus({ days: parseInt(dias) }).startOf('day');

    // Definir formato de agrupamento baseado no período
    let dateFormat;
    switch (periodo) {
      case 'semana':
        dateFormat = { year: { $year: '$dataHora' }, week: { $isoWeek: '$dataHora' } };
        break;
      case 'mes':
        dateFormat = { year: { $year: '$dataHora' }, month: { $month: '$dataHora' } };
        break;
      default: // 'dia'
        dateFormat = { year: { $year: '$dataHora' }, month: { $month: '$dataHora' }, day: { $dayOfMonth: '$dataHora' } };
    }

    // Agregação para calcular receita
    const resultados = await Agendamento.aggregate([
      {
        $match: {
          tenantId: tenantId,
          status: 'Realizado',
          dataHora: {
            $gte: dataInicio.toJSDate(),
            $lte: dataFim.toJSDate()
          }
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
      {
        $unwind: {
          path: '$pacoteInfo',
          preserveNullAndEmptyArrays: true
        }
      },
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
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1, '_id.day': 1 }
      },
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

    // Formatar dados para frontend
    const dados = resultados.map(r => {
      let data;
      if (periodo === 'semana') {
        data = `Sem ${r.periodo.week}/${r.periodo.year}`;
      } else if (periodo === 'mes') {
        const dt = DateTime.fromObject({ year: r.periodo.year, month: r.periodo.month });
        data = dt.toFormat('MMM/yy', { locale: 'pt' });
      } else {
        const dt = DateTime.fromObject({ year: r.periodo.year, month: r.periodo.month, day: r.periodo.day });
        data = dt.toFormat('dd/MM');
      }
      return {
        data,
        receita: r.receita,
        agendamentos: r.agendamentos,
        media: r.media
      };
    });

    res.status(200).json({
      success: true,
      periodo,
      dias: parseInt(dias),
      dados
    });

  } catch (error) {
    console.error('Erro ao buscar receita temporal:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar receita temporal.',
      details: error.message
    });
  }
};

/**
 * @desc    Obtém distribuição de serviços por receita
 * @route   GET /api/analytics/distribuicao-servicos
 * @query   dataInicio, dataFim (ISO dates)
 * @access  Private
 */
export const getDistribuicaoServicos = async (req, res) => {
  try {
    // Converter tenantId para ObjectId para agregação
    const tenantId = new mongoose.Types.ObjectId(req.tenantId);
    const { dataInicio, dataFim } = req.query;

    // Datas padrão: último mês
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
          dataHora: {
            $gte: inicio.toJSDate(),
            $lte: fim.toJSDate()
          }
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
      {
        $unwind: {
          path: '$pacoteInfo',
          preserveNullAndEmptyArrays: true
        }
      },
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
      {
        $group: {
          _id: '$nomeServico',
          quantidade: { $sum: 1 },
          receita: { $sum: '$receita' }
        }
      },
      {
        $sort: { receita: -1 }
      }
    ]);

    // Calcular total e percentuais
    const totalReceita = resultados.reduce((acc, r) => acc + r.receita, 0);
    const servicos = resultados.map(r => ({
      nome: r._id,
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
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar distribuição de serviços.',
      details: error.message
    });
  }
};

/**
 * @desc    Obtém ranking de clientes por receita
 * @route   GET /api/analytics/top-clientes
 * @query   limite (default 10), dataInicio, dataFim
 * @access  Private
 */
export const getTopClientes = async (req, res) => {
  try {
    // Converter tenantId para ObjectId para agregação
    const tenantId = new mongoose.Types.ObjectId(req.tenantId);
    const { limite = 10, dataInicio, dataFim } = req.query;

    // Datas padrão: último mês
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
          dataHora: {
            $gte: inicio.toJSDate(),
            $lte: fim.toJSDate()
          }
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
      {
        $unwind: {
          path: '$pacoteInfo',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'clientes',
          localField: 'cliente',
          foreignField: '_id',
          as: 'clienteInfo'
        }
      },
      {
        $unwind: '$clienteInfo'
      },
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
      {
        $sort: { receita: -1 }
      },
      {
        $limit: parseInt(limite)
      },
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

    // Adicionar ranking
    const clientes = resultados.map((c, idx) => ({
      ranking: idx + 1,
      ...c
    }));

    res.status(200).json({
      success: true,
      dataInicio: inicio.toISODate(),
      dataFim: fim.toISODate(),
      clientes
    });

  } catch (error) {
    console.error('Erro ao buscar top clientes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar top clientes.',
      details: error.message
    });
  }
};