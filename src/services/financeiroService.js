import Transacao from '../models/Transacao.js';
import Pagamento from '../models/Pagamento.js';
import CompraPacote from '../models/CompraPacote.js';
import Agendamento from '../models/Agendamento.js';
import { DateTime } from 'luxon';

/**
 * Serviço de Finanças
 * Contém lógica de negócio reutilizável para operações financeiras
 */

// =============================================
// CÁLCULOS DE RECEITA
// =============================================

/**
 * Calcular receita de um agendamento
 * @param {Object} agendamento - Documento do agendamento
 * @returns {Number} Valor da receita
 */
export const calcularReceitaAgendamento = (agendamento) => {
  // Se tem valor avulso, usar este
  if (agendamento.servicoAvulsoValor) {
    return agendamento.servicoAvulsoValor;
  }

  // Se tem valor cobrado, usar este
  if (agendamento.valorCobrado) {
    return agendamento.valorCobrado;
  }

  // Se é de um pacote, buscar valor por sessão
  if (agendamento.pacote && agendamento.pacote.valor && agendamento.pacote.sessoes) {
    return agendamento.pacote.valor / agendamento.pacote.sessoes;
  }

  return 0;
};

/**
 * Calcular receita total de um período
 * @param {String} tenantId - ID do tenant
 * @param {Date} dataInicio - Data inicial
 * @param {Date} dataFim - Data final
 * @returns {Object} { receitas, despesas, saldo, transacoes }
 */
export const calcularReceitaPeriodo = async (tenantId, dataInicio, dataFim) => {
  const transacoes = await Transacao.find({
    tenantId,
    statusPagamento: 'Pago',
    dataPagamento: {
      $gte: dataInicio,
      $lte: dataFim
    }
  }).populate('cliente compraPacote');

  let totalReceitas = 0;
  let totalDespesas = 0;

  transacoes.forEach(t => {
    if (t.tipo === 'Receita') {
      totalReceitas += t.valorFinal;
    } else if (t.tipo === 'Despesa') {
      totalDespesas += t.valorFinal;
    }
  });

  return {
    receitas: totalReceitas,
    despesas: totalDespesas,
    saldo: totalReceitas - totalDespesas,
    transacoes
  };
};

/**
 * Calcular receita por categoria
 * @param {String} tenantId - ID do tenant
 * @param {Date} dataInicio - Data inicial
 * @param {Date} dataFim - Data final
 * @returns {Array} [ { categoria, total, quantidade } ]
 */
export const calcularReceitaPorCategoria = async (tenantId, dataInicio, dataFim) => {
  const resultado = await Transacao.aggregate([
    {
      $match: {
        tenantId,
        tipo: 'Receita',
        statusPagamento: 'Pago',
        dataPagamento: {
          $gte: dataInicio,
          $lte: dataFim
        }
      }
    },
    {
      $group: {
        _id: '$categoria',
        total: { $sum: '$valorFinal' },
        quantidade: { $sum: 1 }
      }
    },
    { $sort: { total: -1 } }
  ]);

  return resultado.map(r => ({
    categoria: r._id,
    total: r.total,
    quantidade: r.quantidade
  }));
};

// =============================================
// CÁLCULOS DE COMISSÃO
// =============================================

/**
 * Calcular comissão de um agendamento
 * @param {Number} valorServico - Valor do serviço
 * @param {Number} percentualComissao - Percentual da comissão (0-100)
 * @returns {Number} Valor da comissão
 */
export const calcularComissao = (valorServico, percentualComissao) => {
  if (!valorServico || !percentualComissao || percentualComissao === 0) {
    return 0;
  }

  return (valorServico * percentualComissao) / 100;
};

/**
 * Buscar comissões pendentes de um profissional
 * @param {String} tenantId - ID do tenant
 * @param {String} profissionalId - ID do profissional
 * @returns {Object} { quantidade, valorTotal, agendamentos }
 */
export const buscarComissoesPendentes = async (tenantId, profissionalId) => {
  const agendamentos = await Agendamento.find({
    tenantId,
    profissional: profissionalId,
    status: 'Realizado',
    statusPagamento: 'Pago',
    'comissao.pago': false,
    'comissao.valor': { $gt: 0 }
  }).populate('cliente', 'nome telefone');

  const valorTotal = agendamentos.reduce((sum, a) => sum + (a.comissao?.valor || 0), 0);

  return {
    quantidade: agendamentos.length,
    valorTotal,
    agendamentos
  };
};

/**
 * Marcar comissões como pagas
 * @param {String} tenantId - ID do tenant
 * @param {Array} agendamentoIds - IDs dos agendamentos
 * @returns {Object} { quantidade, valorTotal }
 */
export const pagarComissoes = async (tenantId, agendamentoIds) => {
  const dataPagamento = new Date();

  const resultado = await Agendamento.updateMany(
    {
      _id: { $in: agendamentoIds },
      tenantId,
      'comissao.pago': false
    },
    {
      $set: {
        'comissao.pago': true,
        'comissao.dataPagamento': dataPagamento
      }
    }
  );

  // Buscar agendamentos atualizados para calcular total
  const agendamentos = await Agendamento.find({
    _id: { $in: agendamentoIds },
    tenantId
  });

  const valorTotal = agendamentos.reduce((sum, a) => sum + (a.comissao?.valor || 0), 0);

  return {
    quantidade: resultado.modifiedCount,
    valorTotal
  };
};

// =============================================
// GESTÃO DE PACOTES
// =============================================

/**
 * Verificar se pacote está próximo de expirar
 * @param {Object} compraPacote - Documento da compra do pacote
 * @param {Number} diasAlerta - Dias para considerar "próximo" (default: 7)
 * @returns {Boolean} true se está expirando em breve
 */
export const pacoteExpirandoEmBreve = (compraPacote, diasAlerta = 7) => {
  if (!compraPacote.dataExpiracao || compraPacote.status !== 'Ativo') {
    return false;
  }

  const hoje = DateTime.now().setZone('Europe/Lisbon').startOf('day');
  const expiracao = DateTime.fromJSDate(compraPacote.dataExpiracao).setZone('Europe/Lisbon').startOf('day');
  const diasRestantes = expiracao.diff(hoje, 'days').days;

  return diasRestantes >= 0 && diasRestantes <= diasAlerta;
};

/**
 * Verificar se pacote tem poucas sessões
 * @param {Object} compraPacote - Documento da compra do pacote
 * @param {Number} limiteAlerta - Sessões para considerar "poucas" (default: 2)
 * @returns {Boolean} true se tem poucas sessões
 */
export const pacotePoucasSessoes = (compraPacote, limiteAlerta = 2) => {
  if (compraPacote.status !== 'Ativo') {
    return false;
  }

  return compraPacote.sessoesRestantes > 0 && compraPacote.sessoesRestantes <= limiteAlerta;
};

/**
 * Buscar alertas de pacotes
 * @param {String} tenantId - ID do tenant
 * @param {Number} diasExpiracao - Dias para alerta de expiração (default: 7)
 * @param {Number} limiteSessoes - Sessões para alerta (default: 2)
 * @returns {Object} { expirando, poucasSessoes }
 */
export const buscarAlertas = async (tenantId, diasExpiracao = 7, limiteSessoes = 2) => {
  const [expirando, poucasSessoes] = await Promise.all([
    CompraPacote.buscarExpirandoEmBreve(tenantId, diasExpiracao),
    CompraPacote.buscarComPoucasSessoes(tenantId, limiteSessoes)
  ]);

  return {
    expirando: {
      quantidade: expirando.length,
      pacotes: expirando
    },
    poucasSessoes: {
      quantidade: poucasSessoes.length,
      pacotes: poucasSessoes
    }
  };
};

// =============================================
// ANÁLISE FINANCEIRA
// =============================================

/**
 * Calcular ticket médio
 * @param {Number} receitaTotal - Receita total
 * @param {Number} quantidadeAgendamentos - Quantidade de agendamentos
 * @returns {Number} Ticket médio
 */
export const calcularTicketMedio = (receitaTotal, quantidadeAgendamentos) => {
  if (!quantidadeAgendamentos || quantidadeAgendamentos === 0) {
    return 0;
  }

  return receitaTotal / quantidadeAgendamentos;
};

/**
 * Calcular taxa de crescimento
 * @param {Number} valorAtual - Valor do período atual
 * @param {Number} valorAnterior - Valor do período anterior
 * @returns {Number} Taxa de crescimento (percentual)
 */
export const calcularTaxaCrescimento = (valorAtual, valorAnterior) => {
  if (!valorAnterior || valorAnterior === 0) {
    return valorAtual > 0 ? 100 : 0;
  }

  return ((valorAtual - valorAnterior) / valorAnterior) * 100;
};

/**
 * Gerar resumo financeiro completo
 * @param {String} tenantId - ID do tenant
 * @param {Date} dataInicio - Data inicial
 * @param {Date} dataFim - Data final
 * @returns {Object} Resumo completo
 */
export const gerarResumoFinanceiro = async (tenantId, dataInicio, dataFim) => {
  const [
    receitaPeriodo,
    receitaPorCategoria,
    pagamentosPorForma,
    agendamentosRealizados
  ] = await Promise.all([
    calcularReceitaPeriodo(tenantId, dataInicio, dataFim),
    calcularReceitaPorCategoria(tenantId, dataInicio, dataFim),
    Pagamento.totalPorFormaPagamento(tenantId, dataInicio, dataFim),
    Agendamento.countDocuments({
      tenantId,
      status: 'Realizado',
      dataHora: { $gte: dataInicio, $lte: dataFim }
    })
  ]);

  const ticketMedio = calcularTicketMedio(receitaPeriodo.receitas, agendamentosRealizados);

  return {
    periodo: {
      inicio: DateTime.fromJSDate(dataInicio).toFormat('dd/MM/yyyy'),
      fim: DateTime.fromJSDate(dataFim).toFormat('dd/MM/yyyy')
    },
    resumo: {
      receitas: receitaPeriodo.receitas,
      despesas: receitaPeriodo.despesas,
      saldo: receitaPeriodo.saldo,
      ticketMedio,
      quantidadeAgendamentos: agendamentosRealizados
    },
    receitaPorCategoria,
    pagamentosPorForma
  };
};

// =============================================
// VALIDAÇÕES FINANCEIRAS
// =============================================

/**
 * Validar forma de pagamento
 * @param {String} formaPagamento - Forma de pagamento
 * @returns {Boolean} true se é válida
 */
export const validarFormaPagamento = (formaPagamento) => {
  const formasValidas = [
    'Dinheiro',
    'MBWay',
    'Multibanco',
    'Cartão de Débito',
    'Cartão de Crédito',
    'Transferência Bancária',
    'Múltiplas'
  ];

  return formasValidas.includes(formaPagamento);
};

/**
 * Validar telefone MBWay (português)
 * @param {String} telefone - Número de telefone
 * @returns {Boolean} true se é válido
 */
export const validarTelefoneMBWay = (telefone) => {
  const regex = /^9[0-9]{8}$/;
  return regex.test(telefone);
};

/**
 * Validar IBAN português
 * @param {String} iban - IBAN
 * @returns {Boolean} true se é válido
 */
export const validarIBAN = (iban) => {
  const regex = /^PT50[0-9]{21}$/;
  return regex.test(iban.replace(/\s/g, ''));
};

/**
 * Validar número de parcelas
 * @param {Number} numeroParcelas - Número de parcelas
 * @returns {Boolean} true se é válido
 */
export const validarNumeroParcelas = (numeroParcelas) => {
  return numeroParcelas >= 1 && numeroParcelas <= 12;
};

// =============================================
// FORMATAÇÃO
// =============================================

/**
 * Formatar valor monetário
 * @param {Number} valor - Valor numérico
 * @returns {String} Valor formatado (ex: "€ 45,50")
 */
export const formatarValor = (valor) => {
  if (valor === null || valor === undefined) return '€ 0,00';

  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(valor);
};

/**
 * Formatar data
 * @param {Date} data - Data
 * @param {String} formato - Formato (default: 'dd/MM/yyyy')
 * @returns {String} Data formatada
 */
export const formatarData = (data, formato = 'dd/MM/yyyy') => {
  if (!data) return '';

  return DateTime.fromJSDate(data).setZone('Europe/Lisbon').toFormat(formato);
};

/**
 * Formatar percentual
 * @param {Number} valor - Valor numérico
 * @param {Number} casasDecimais - Casas decimais (default: 1)
 * @returns {String} Percentual formatado (ex: "15,5%")
 */
export const formatarPercentual = (valor, casasDecimais = 1) => {
  if (valor === null || valor === undefined) return '0%';

  return `${valor.toFixed(casasDecimais)}%`;
};

export default {
  // Receita
  calcularReceitaAgendamento,
  calcularReceitaPeriodo,
  calcularReceitaPorCategoria,

  // Comissão
  calcularComissao,
  buscarComissoesPendentes,
  pagarComissoes,

  // Pacotes
  pacoteExpirandoEmBreve,
  pacotePoucasSessoes,
  buscarAlertas,

  // Análise
  calcularTicketMedio,
  calcularTaxaCrescimento,
  gerarResumoFinanceiro,

  // Validações
  validarFormaPagamento,
  validarTelefoneMBWay,
  validarIBAN,
  validarNumeroParcelas,

  // Formatação
  formatarValor,
  formatarData,
  formatarPercentual
};
