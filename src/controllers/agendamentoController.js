const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Clientes');

// Criar novo agendamento
const createAgendamento = async (req, res) => {
  try {
    const { cliente: clienteId, pacote: pacoteId, dataHora, observacoes, isAvulso } = req.body;

    const cliente = await Cliente.findById(clienteId).populate('pacote');
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    if (!isAvulso && cliente.sessoesRestantes <= 0) {
      return res.status(400).json({ 
        error: 'Cliente não possui sessões disponíveis no pacote' 
      });
    }

    const novoAgendamento = new Agendamento({
      cliente: clienteId,
      pacote: pacoteId,
      dataHora,
      observacoes,
      status: 'AGENDADO',
      isAvulso: isAvulso || false
    });

    const agendamentoSalvo = await novoAgendamento.save();
    const agendamentoPopulado = await Agendamento.findById(agendamentoSalvo._id)
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome categoria sessoes');

    res.status(201).json(agendamentoPopulado);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    res.status(400).json({ error: 'Erro ao criar agendamento', message: error.message });
  }
};

// Listar todos agendamentos
const getAllAgendamentos = async (req, res) => {
  try {
    const agendamentos = await Agendamento.find()
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome categoria sessoes')
      .sort({ dataHora: -1 });

    res.status(200).json(agendamentos);
  } catch (error) {
    console.error('Erro ao listar agendamentos:', error);
    res.status(500).json({ error: 'Erro ao listar agendamentos' });
  }
};

// Buscar um agendamento específico
const getAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id)
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome categoria sessoes');

    if (!agendamento) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    res.status(200).json(agendamento);
  } catch (error) {
    console.error('Erro ao buscar agendamento:', error);
    res.status(500).json({ error: 'Erro ao buscar agendamento' });
  }
};

// Atualizar status do agendamento
const atualizarStatusAgendamento = async (req, res) => {
  try {
    const { status } = req.body;
    const statusValidos = ['AGENDADO', 'CONCLUIDO', 'CANCELADO'];

    if (!statusValidos.includes(status)) {
      return res.status(400).json({ error: 'Status inválido', statusValidos });
    }

    const agendamento = await Agendamento.findById(req.params.id)
      .populate('cliente')
      .populate('pacote');

    if (!agendamento) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    const statusAnterior = agendamento.status;

    if (status === 'CONCLUIDO' && !agendamento.isAvulso && statusAnterior !== 'CONCLUIDO') {
      const cliente = await Cliente.findById(agendamento.cliente._id);
      if (cliente && cliente.sessoesRestantes > 0) {
        cliente.sessoesRestantes -= 1;
        await cliente.save();
      } else {
        return res.status(400).json({ error: 'Cliente não possui sessões disponíveis' });
      }
    }

    if (status === 'CANCELADO' && !agendamento.isAvulso && statusAnterior === 'CONCLUIDO') {
      const cliente = await Cliente.findById(agendamento.cliente._id);
      if (cliente) {
        cliente.sessoesRestantes += 1;
        await cliente.save();
      }
    }

    agendamento.status = status;
    await agendamento.save();

    res.status(200).json(agendamento);
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(400).json({ error: 'Erro ao atualizar status do agendamento' });
  }
};

// Deletar agendamento
const deleteAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id).populate('cliente');

    if (!agendamento) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }

    if (!agendamento.isAvulso && agendamento.status !== 'CONCLUIDO') {
      const cliente = await Cliente.findById(agendamento.cliente._id);
      if (cliente) {
        cliente.sessoesRestantes += 1;
        await cliente.save();
      }
    }

    await Agendamento.deleteOne({ _id: req.params.id });
    res.status(200).json({ message: 'Agendamento removido com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar agendamento:', error);
    res.status(500).json({ error: 'Erro ao deletar agendamento' });
  }
};

// Exportar todas as funções
module.exports = {
  createAgendamento,
  getAllAgendamentos,
  getAgendamento,
  atualizarStatusAgendamento,
  deleteAgendamento
};