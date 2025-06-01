// src/controllers/dashboardController.js
const Cliente = require('../models/Clientes');
const Pacote = require('../models/Pacote'); // Importando Pacote para usar no populate
const Agendamento = require('../models/Agendamento');
const { get } = require('mongoose');




// Não precisamos de Cliente e Pacote aqui se o populate já resolve os nomes.
// Se precisarmos de mais campos ou lógica específica, podemos importá-los.

// Função para buscar agendamentos de hoje para o dashboard
const getAgendamentosDeHoje = async (req, res) => {
  try {
    const hoje = new Date();
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 0, 0, 0, 0);
    const fimDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

    console.log(`Buscando agendamentos entre ${inicioDoDia.toISOString()} e ${fimDoDia.toISOString()}`);

    const agendamentos = await Agendamento.find({
      dataHora: {
        $gte: inicioDoDia,
        $lte: fimDoDia // Usando $lte para incluir até o último milissegundo do dia
      }
    })
    .populate('cliente', 'nome') // Apenas o nome do cliente
    .populate('pacote', 'nome')   // Apenas o nome do pacote (se houver)
    .select('dataHora status cliente pacote servicoAvulsoNome observacoes') // Seleciona campos específicos
    .sort({ dataHora: 1 });     // Ordena pela hora do agendamento

    res.status(200).json(agendamentos);

  } catch (error) {
    console.error('Erro ao buscar agendamentos de hoje para o dashboard:', error);
    res.status(500).json({ message: 'Erro interno ao buscar agendamentos de hoje.', details: error.message });
  }
};

// Função para buscar a contagem de agendamentos de amanhã
const getContagemAgendamentosAmanha = async (req, res) => {
  try {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1); // Adiciona 1 dia à data atual

    const inicioDeAmanha = new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 0, 0, 0, 0);
    const fimDeAmanha = new Date(amanha.getFullYear(), amanha.getMonth(), amanha.getDate(), 23, 59, 59, 999);

    console.log(`Contando agendamentos entre ${inicioDeAmanha.toISOString()} e ${fimDeAmanha.toISOString()}`);

    const contagem = await Agendamento.countDocuments({
      dataHora: {
        $gte: inicioDeAmanha,
        $lte: fimDeAmanha
      }
    });

    res.status(200).json({ contagem: contagem });

  } catch (error) {
    console.error('Erro ao contar agendamentos de amanhã para o dashboard:', error);
    res.status(500).json({ message: 'Erro interno ao contar agendamentos de amanhã.', details: error.message });
  }
};

const getClientesAtendidosSemana = async (req, res) => {
  try {
    const hoje = new Date();
    const fimDoDiaDeHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);

    const seteDiasAtras = new Date(hoje);
    seteDiasAtras.setDate(hoje.getDate() - 7); // Subtrai 7 dias da data atual
    const inicioDosSeteDias = new Date(seteDiasAtras.getFullYear(), seteDiasAtras.getMonth(), seteDiasAtras.getDate(), 0, 0, 0, 0);

    console.log(`Contando agendamentos CONCLUIDOS entre ${inicioDosSeteDias.toISOString()} e ${fimDoDiaDeHoje.toISOString()}`);

    const contagem = await Agendamento.countDocuments({
      status: 'Realizado', // Contar apenas os que foram efetivamente realizados
      dataHora: {
        $gte: inicioDosSeteDias,
        $lte: fimDoDiaDeHoje
      }
    });

    res.status(200).json({ contagem: contagem });

  } catch (error) {
    console.error('Erro ao contar clientes atendidos na semana:', error);
    res.status(500).json({ message: 'Erro interno ao contar clientes atendidos na semana.', details: error.message });
  }
};
const getTotaisSistema= async (req, res) => {
  try {
    const totalClientes = await Cliente.countDocuments();
    const totalPacotes = await Pacote.countDocuments();
    const totalAgendamentos = await Agendamento.countDocuments();

    const agora = new Date();
    const totalAgendamentosFuturo = await Agendamento.countDocuments({
      dataHora: {
        $gte: agora // Contar apenas agendamentos futuros
      }
    });

    res.status(200).json({
      totalClientes,
      totalPacotes,
      totalAgendamentos
    });
  } catch (error) {
    console.error('Erro ao buscar totais do sistema:', error);
    res.status(500).json({ message: 'Erro interno ao buscar totais do sistema.', details: error.message });
  }
};

const getClientesComSessoesBaixas = async (req, res) => {
  try {
    // Permite personalizar o limite pelo front (ex: ?limite=2)
    const limite = parseInt(req.query.limite, 10) || 2;

    // Busca todos os clientes com sessoesRestantes <= limite
    const clientesBaixos = await Cliente.find({
      sessoesRestantes: { $lte: limite }
    }).select('nome telefone sessoesRestantes');

    res.status(200).json({
      total: clientesBaixos.length,
      clientes: clientesBaixos
    });
  } catch (error) {
    console.error('Erro ao buscar clientes com sessões baixas:', error);
    res.status(500).json({ message: 'Erro interno ao buscar clientes com sessões baixas.', details: error.message });
  }
};

const getProximosAgendamentos = async (req, res) => {
  try {
    // Permite personalizar o limite pelo front (?limit=5), padrão 5
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

    res.status(200).json({
      total: agendamentos.length,
      agendamentos
    });
  } catch (error) {
    console.error('Erro ao buscar próximos agendamentos:', error);
    res.status(500).json({ message: 'Erro interno ao buscar próximos agendamentos.', details: error.message });
  }
};


module.exports = {
  getAgendamentosDeHoje,
  getContagemAgendamentosAmanha,
  getClientesAtendidosSemana,
  getTotaisSistema,
  getClientesComSessoesBaixas, 
  getProximosAgendamentos,
  // Exportando a nova função
  // Adicionaremos mais funções exportadas aqui
};