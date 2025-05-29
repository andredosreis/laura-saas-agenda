// src/controllers/analyticsController.js
console.log('CONTROLLER: Iniciando carregamento de analyticsController.js');
const Cliente = require('../models/Clientes'); // Precisamos do modelo Cliente
// O modelo Pacote será acessado através do populate em Cliente

const getAlertaSessoesBaixas = async (req, res) => {
  try {
    // Define o limite para "sessões baixas". Pode vir do req.query se quiser flexibilidade.
    const limiteSessoes = parseInt(req.query.limite) || 1; // Padrão é 1 ou menos sessões

    console.log(`Buscando clientes com ${limiteSessoes} ou menos sessões restantes.`);

    const clientesComSessoesBaixas = await Cliente.find({
      pacote: { $ne: null }, // Apenas clientes que TÊM um pacote associado
      sessoesRestantes: { $lte: limiteSessoes, $gte: 0 } // Sessões restantes menores ou iguais ao limite e >= 0
    })
    .populate('pacote', 'nome sessoes') // Popula o nome e o total de sessões do pacote original
    .select('nome telefone sessoesRestantes pacote email'); // Seleciona campos úteis do cliente e seu pacote

    if (!clientesComSessoesBaixas) {
      // Isso não deveria acontecer com find(), ele retorna array vazio se nada for encontrado
      return res.status(404).json({ message: 'Nenhum cliente encontrado com os critérios.' });
    }

    res.status(200).json(clientesComSessoesBaixas);

  } catch (error) {
    console.error('Erro ao buscar alerta de sessões baixas:', error);
    res.status(500).json({ message: 'Erro interno ao buscar alerta de sessões baixas.', details: error.message });
  }
};

module.exports = {
  getAlertaSessoesBaixas
};