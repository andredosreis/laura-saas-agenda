// src/controllers/financeiroController.js
const Agendamento = require('../models/Agendamento');
const Pacote = require('../models/Pacote'); // Precisaremos para calcular o valor da sessão do pacote
const Cliente = require('../models/Cliente'); // Pode ser útil se precisarmos de dados do cliente

// Função para calcular a receita total do mês atual
const getReceitaMensalAtual = async (req, res) => {
  try {
    const hoje = new Date();
    const primeiroDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDiaDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999); // Pega o último milissegundo do último dia do mês

    console.log(`Calculando receita entre ${primeiroDiaDoMes.toISOString()} e ${ultimoDiaDoMes.toISOString()}`);

    const agendamentosDoMesRealizados = await Agendamento.find({
      status: 'Realizado', // Certifique-se que este é o status exato que você usa
      dataHora: {
        $gte: primeiroDiaDoMes,
        $lte: ultimoDiaDoMes,
      },
    }).populate('pacote'); // Populamos o pacote para aceder ao seu valor e número de sessões

    let totalReceitaMes = 0;

    for (const agendamento of agendamentosDoMesRealizados) {
      if (agendamento.servicoAvulsoNome && typeof agendamento.servicoAvulsoValor === 'number') {
        // Se for serviço avulso com valor definido, soma o valor do serviço avulso
        totalReceitaMes += agendamento.servicoAvulsoValor;
        console.log(`Somando serviço avulso: ${agendamento.servicoAvulsoValor} para agendamento ${agendamento._id}`);
      } else if (agendamento.pacote) {
        // Se for um agendamento de pacote, calcula o valor da sessão
        const pacoteDoAgendamento = agendamento.pacote;
        if (pacoteDoAgendamento.valor && pacoteDoAgendamento.sessoes && pacoteDoAgendamento.sessoes > 0) {
          const valorPorSessao = pacoteDoAgendamento.valor / pacoteDoAgendamento.sessoes;
          totalReceitaMes += valorPorSessao;
          console.log(`Somando sessão de pacote: ${valorPorSessao} (Pacote: ${pacoteDoAgendamento.nome}, Valor: ${pacoteDoAgendamento.valor}, Sessões: ${pacoteDoAgendamento.sessoes}) para agendamento ${agendamento._id}`);
        } else {
          console.warn(`Agendamento <span class="math-inline">\{agendamento\.\_id\} é de pacote \(</span>{pacoteDoAgendamento.nome}), mas o pacote não tem valor ou sessões válidas para cálculo.`);
        }
      } else {
        console.warn(`Agendamento ${agendamento._id} não é serviço avulso com valor nem tem pacote válido para cálculo de receita.`);
      }
    }

    // Arredonda para 2 casas decimais
    totalReceitaMes = Math.round(totalReceitaMes * 100) / 100;

    res.status(200).json({
      mensagem: "Receita mensal calculada com sucesso.",
      ano: hoje.getFullYear(),
      mes: hoje.getMonth() + 1, // getMonth() é 0-11, então adicionamos 1
      totalReceitaMes: totalReceitaMes,
    });

  } catch (error) {
    console.error('Erro ao calcular receita mensal:', error);
    res.status(500).json({ message: 'Erro interno ao calcular receita mensal.', details: error.message });
  }
};

module.exports = {
  getReceitaMensalAtual,
  // Adicione outras funções financeiras aqui no futuro
};