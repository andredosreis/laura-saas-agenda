import { DateTime } from 'luxon';

const ZONA = 'Europe/Lisbon';

/**
 * Gera um snapshot mensal do estado financeiro do tenant.
 *
 * @param {Object} models  — { Transacao, Pagamento, CompraPacote, ... } via getModels(getTenantDB(tenantId))
 * @param {string} tenantId
 * @param {number} ano   — 2020-2099
 * @param {number} mes   — 1-12
 * @returns {Promise<Object>} snapshot pronto a persistir em FechamentoMensal (sem metadata)
 */
export async function gerarSnapshotMensal(models, tenantId, ano, mes) {
  const inicio = DateTime.fromObject({ year: ano, month: mes }, { zone: ZONA }).startOf('month').toJSDate();
  const fim    = DateTime.fromObject({ year: ano, month: mes }, { zone: ZONA }).endOf('month').toJSDate();

  // 4 queries independentes em paralelo:
  //   1. Pagamentos do mês (populamos `transacao` para tipo+categoria)
  //   2. Despesas pagas no mês
  //   3. Contagem de CompraPacotes vendidos no mês (inclui retroactivos via dataCompra)
  //   4. Receitas em aberto até ao fim do mês (Pendentes/Parciais)
  const [pagamentosNoMes, despesasPagas, comprasPacoteCount, pendentes] = await Promise.all([
    models.Pagamento.find({
      tenantId,
      dataPagamento: { $gte: inicio, $lte: fim },
    }).populate('transacao', 'tipo categoria'),
    models.Transacao.find({
      tenantId,
      tipo: 'Despesa',
      statusPagamento: 'Pago',
      dataPagamento: { $gte: inicio, $lte: fim },
    }),
    models.CompraPacote.countDocuments({
      tenantId,
      dataCompra: { $gte: inicio, $lte: fim },
    }),
    models.Transacao.find({
      tenantId,
      tipo: 'Receita',
      statusPagamento: { $ne: 'Pago' },
      createdAt: { $lte: fim },
    }),
  ]);

  // Agregar Receitas + Retroactivos a partir de Pagamentos (cash-flow real).
  let receitas = 0;
  let retroactivosQtd = 0;
  let retroactivosValor = 0;
  const receitasPorCatMap = new Map();    // categoria → soma
  const receitasPorFormaMap = new Map();  // forma → soma

  for (const p of pagamentosNoMes) {
    if (p.transacao?.tipo === 'Receita') {
      receitas += p.valor;
      const cat = p.transacao.categoria || 'Sem categoria';
      receitasPorCatMap.set(cat, (receitasPorCatMap.get(cat) || 0) + p.valor);
      const forma = p.formaPagamento || 'Sem forma';
      receitasPorFormaMap.set(forma, (receitasPorFormaMap.get(forma) || 0) + p.valor);
    }
    if (p.origemRetroactiva?.motivo) {
      retroactivosQtd += 1;
      retroactivosValor += p.valor;
    }
  }

  // Agregar Despesas (statusPagamento='Pago' + dataPagamento no mês).
  let despesas = 0;
  const despesasPorCatMap = new Map();
  for (const t of despesasPagas) {
    despesas += t.valorFinal;
    const cat = t.categoria || 'Sem categoria';
    despesasPorCatMap.set(cat, (despesasPorCatMap.get(cat) || 0) + t.valorFinal);
  }

  // Pendente: para cada Transacao em aberto, subtrair sum(Pagamentos) — em paralelo.
  const pagosPorPendente = await Promise.all(
    pendentes.map((t) =>
      models.Pagamento.find({ tenantId, transacao: t._id })
        .then((ps) => ps.reduce((s, p) => s + p.valor, 0))
    )
  );

  let pendente = 0;
  pendentes.forEach((t, i) => {
    pendente += Math.max(0, t.valorFinal - pagosPorPendente[i]);
  });

  const saldo = receitas - despesas;

  return {
    periodo: { inicio, fim },
    totais: {
      receitas,
      despesas,
      saldo,
      pendente,
      receitasPorCategoria: [...receitasPorCatMap].map(([categoria, valor]) => ({ categoria, valor })),
      receitasPorFormaPagamento: [...receitasPorFormaMap].map(([forma, valor]) => ({ forma, valor })),
      despesasPorCategoria: [...despesasPorCatMap].map(([categoria, valor]) => ({ categoria, valor })),
    },
    contagens: {
      transacoes: despesasPagas.length,
      pagamentos: pagamentosNoMes.length,
      comprasPacote: comprasPacoteCount,
    },
    retroactivos: { quantidade: retroactivosQtd, valorTotal: retroactivosValor },
  };
}
