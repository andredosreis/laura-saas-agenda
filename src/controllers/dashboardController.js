// src/controllers/dashboardController.js
const Cliente = require('../models/Clientes');
const Pacote = require('../models/Pacote');
const Agendamento = require('../models/Agendamento');
// const { get } = require('mongoose'); // Removido, pois não estava a ser usado

// Função para buscar agendamentos de hoje para o dashboard
const getAgendamentosDeHoje = async (req, res) => {
  try {
    const hoje = new Date();
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
    const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

    // console.log(`Buscando agendamentos entre ${inicioDoDia.toISOString()} e ${fimDoDia.toISOString()}`);

    const agendamentos = await Agendamento.find({
      dataHora: { $gte: inicioDoDia, $lte: fimDoDia }
    })
    .populate('cliente', 'nome')
    .populate('pacote', 'nome')
    .select('dataHora status cliente pacote servicoAvulsoNome observacoes')
    .sort({ dataHora: 1 });

    res.status(200).json(agendamentos); // Retorna a lista, frontend pode usar .length para o total

  } catch (error) {
    console.error('Erro ao buscar agendamentos de hoje para o dashboard:', error);
    res.status(500).json({ message: 'Erro interno ao buscar agendamentos de hoje.', details: error.message });
  }
};

// Função para buscar a CONTAGEM de agendamentos de amanhã (para o mini-card)
const getContagemAgendamentosAmanha = async (req, res) => {
  try {
    const amanhaDate = new Date();
    amanhaDate.setDate(amanhaDate.getDate() + 1);

    const inicioDeAmanha = new Date(amanhaDate.getFullYear(), amanhaDate.getMonth(), amanhaDate.getDate(), 0, 0, 0, 0);
    const fimDeAmanha = new Date(amanhaDate.getFullYear(), amanhaDate.getMonth(), amanhaDate.getDate(), 23, 59, 59, 999);

    // console.log(`Contando agendamentos entre ${inicioDeAmanha.toISOString()} e ${fimDeAmanha.toISOString()}`);

    const contagem = await Agendamento.countDocuments({
      dataHora: { $gte: inicioDeAmanha, $lte: fimDeAmanha }
    });

    res.status(200).json({ contagem: contagem });

  } catch (error) {
    console.error('Erro ao contar agendamentos de amanhã para o dashboard:', error);
    res.status(500).json({ message: 'Erro interno ao contar agendamentos de amanhã.', details: error.message });
  }
};

// Função para buscar a LISTA DETALHADA de agendamentos de amanhã (para o card maior)
const getAgendamentosAmanha = async (req, res) => {
  try {
    const hoje = new Date(); // Usar uma nova instância para não modificar a data de `getContagemAgendamentosAmanha` se forem chamadas próximas
    const inicioDeAmanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1, 0, 0, 0, 0);
    const fimDeAmanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1, 23, 59, 59, 999);

    // console.log(`Buscando LISTA de agendamentos entre ${inicioDeAmanha.toISOString()} e ${fimDeAmanha.toISOString()}`);

    const agendamentos = await Agendamento.find({
      dataHora: { $gte: inicioDeAmanha, $lte: fimDeAmanha }
    })
    .populate('cliente', 'nome')
    .populate('pacote', 'nome')
    .select('dataHora status cliente pacote servicoAvulsoNome observacoes')
    .sort({ dataHora: 1 });

    res.status(200).json(agendamentos); // Retorna a LISTA

  } catch (error) {
    console.error('Erro ao buscar a lista de agendamentos de amanhã:', error);
    res.status(500).json({ message: 'Erro interno ao buscar a lista de agendamentos de amanhã.', details: error.message });
  }
};

// Função para buscar a contagem de clientes atendidos na semana
const getClientesAtendidosSemana = async (req, res) => {
  try {
    const hoje = new Date();
    const fimDoDiaDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 7);
    const inicioDosSeteDias = new Date(seteDiasAtras.getFullYear(), seteDiasAtras.getMonth(), seteDiasAtras.getDate(), 0, 0, 0, 0);

    // console.log(`Contando agendamentos CONCLUIDOS entre ${inicioDosSeteDias.toISOString()} e ${fimDoDiaDeHoje.toISOString()}`);

    const contagem = await Agendamento.countDocuments({
      status: 'Realizado',
      dataHora: { $gte: inicioDosSeteDias, $lte: fimDoDiaDeHoje }
    });

    res.status(200).json({ contagem: contagem });

  } catch (error) {
    console.error('Erro ao contar clientes atendidos na semana:', error);
    res.status(500).json({ message: 'Erro interno ao contar clientes atendidos na semana.', details: error.message });
  }
};

// Função para buscar totais gerais do sistema
const getTotaisSistema = async (req, res) => {
  try {
    const totalClientes = await Cliente.countDocuments();
    const totalPacotes = await Pacote.countDocuments(); // Mantido, caso precises para outros fins
    const totalAgendamentosGeral = await Agendamento.countDocuments();

    const agora = new Date();
    const totalAgendamentosFuturos = await Agendamento.countDocuments({
      dataHora: { $gte: agora }
    });

    res.status(200).json({
      totalClientes,
      totalPacotes, // O frontend pode ignorar se não precisar
      totalAgendamentosGeral,
      totalAgendamentosFuturos // Adicionado para dar mais opções ao frontend
    });
  } catch (error) {
    console.error('Erro ao buscar totais do sistema:', error);
    res.status(500).json({ message: 'Erro interno ao buscar totais do sistema.', details: error.message });
  }
};

// Função para buscar clientes com sessões baixas
const getClientesComSessoesBaixas = async (req, res) => {
  try {
    const limite = parseInt(req.query.limite, 10) || 2;
    const clientesBaixos = await Cliente.find({
      sessoesRestantes: { $lte: limite }
    }).select('nome telefone sessoesRestantes'); // Adicionei _id implicitamente, é bom para keys no React

    res.status(200).json({
      total: clientesBaixos.length,
      clientes: clientesBaixos
    });
  } catch (error) {
    console.error('Erro ao buscar clientes com sessões baixas:', error);
    res.status(500).json({ message: 'Erro interno ao buscar clientes com sessões baixas.', details: error.message });
  }
};

// Função para buscar os próximos X agendamentos
const getProximosAgendamentos = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const agora = new Date();

    const agendamentos = await Agendamento.find({
      dataHora: { $gt: agora }
    })
      .populate('cliente', 'nome')
      .populate('pacote', 'nome')
      .select('dataHora status cliente pacote servicoAvulsoNome observacoes')
      .sort({ dataHora: 1 })
      .limit(limit);

    res.status(200).json({ // Retorna o total e a lista
      total: agendamentos.length,
      agendamentos
    });
  } catch (error) {
    console.error('Erro ao buscar próximos agendamentos:', error);
    res.status(500).json({ message: 'Erro interno ao buscar próximos agendamentos.', details: error.message });
  }
};

// Exporta TODAS as funções de uma só vez no final
module.exports = {
  getAgendamentosDeHoje,
  getContagemAgendamentosAmanha,    // Para o mini-card (número)
  getAgendamentosAmanha,            // Para o card detalhado (lista)
  getClientesAtendidosSemana,
  getTotaisSistema,
  getClientesComSessoesBaixas,
  getProximosAgendamentos,
};