exports.createAgendamento = async (req, res) => {
  try {
    const { cliente: clienteId, pacote: pacoteId, dataHora, observacoes, isAvulso } = req.body;

    // Buscar cliente para verificar pacote
    const cliente = await Cliente.findById(clienteId).populate('pacote');
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    // Se não for avulso, verificar se tem sessões disponíveis
    if (!isAvulso) {
      if (cliente.sessoesRestantes <= 0) {
        return res.status(400).json({ 
          error: 'Cliente não possui sessões disponíveis no pacote' 
        });
      }
    }

    // Criar o agendamento
    const novoAgendamento = new Agendamento({
      cliente: clienteId,
      pacote: pacoteId,
      dataHora,
      observacoes,
      status: 'AGENDADO',
      isAvulso: isAvulso || false
    });

    const agendamentoSalvo = await novoAgendamento.save();

    // REMOVER ESTA PARTE - não decrementar sessões na criação
    // if (!isAvulso) {
    //   cliente.sessoesRestantes -= 1;
    //   await cliente.save();
    // }

    // Retornar agendamento populado
    const agendamentoPopulado = await Agendamento.findById(agendamentoSalvo._id)
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome categoria sessoes');

    res.status(201).json(agendamentoPopulado);

  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(400).json({ 
      error: 'Erro ao criar agendamento',
      message: error.message 
    });
  }
};
