import Cliente from '../models/Cliente.js';

/**
 * @desc    Busca clientes com um número baixo de sessões restantes num pacote.
 * @route   GET /api/analytics/sessoes-baixas
 * @access  Private
 */
export const getAlertaSessoesBaixas = async (req, res) => {
  try {
    // Define o limite para "sessões baixas". Pode vir do req.query se quiser flexibilidade.
    const limiteSessoes = parseInt(req.query.limite, 10) || 1; // Padrão é 1 ou menos sessões

    const clientesComSessoesBaixas = await Cliente.find({
      pacote: { $ne: null }, // Apenas clientes que TÊM um pacote associado
      sessoesRestantes: { $lte: limiteSessoes, $gte: 0 }
    })
    .populate('pacote', 'nome sessoes') // Popula o nome e o total de sessões do pacote
    .select('nome telefone sessoesRestantes pacote email'); // Seleciona campos úteis

    res.status(200).json(clientesComSessoesBaixas);

  } catch (error) {
    console.error('Erro ao buscar alerta de sessões baixas:', error);
    res.status(500).json({ message: 'Erro interno ao buscar alerta de sessões baixas.', details: error.message });
  }
};