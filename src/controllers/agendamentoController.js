const Agendamento = require('../models/Agendamento');

// Criar novo agendamento
async function createAgendamento(req, res) {
  try {
    const novoAgendamento = new Agendamento(req.body);
    await novoAgendamento.save();
    return res.status(201).json(novoAgendamento);
  } catch (error) {
    return res.status(400).json({ error: 'Erro ao criar agendamento', detalhes: error.message });
  }
}

// Listar todos os agendamentos
async function getAllAgendamentos(req, res) {
  try {
    const agendamentos = await Agendamento.find().populate('cliente pacote');
    return res.status(200).json(agendamentos);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar agendamentos', detalhes: error.message });
  }
}

// Buscar um agendamento por ID
async function getAgendamento(req, res) {
  try {
    const agendamento = await Agendamento.findById(req.params.id).populate('cliente pacote');
    if (!agendamento) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    return res.status(200).json(agendamento);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar agendamento', detalhes: error.message });
  }
}

// Atualizar agendamento completo
async function atualizarAgendamento(req, res) {
  try {
    const agendamentoAtualizado = await Agendamento.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!agendamentoAtualizado) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    return res.status(200).json(agendamentoAtualizado);
  } catch (error) {
    return res.status(400).json({ error: 'Erro ao atualizar agendamento', detalhes: error.message });
  }
}

// Atualizar status do agendamento (opcional, se tiver campo status)
async function atualizarStatusAgendamento(req, res) {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Campo status é obrigatório.' });
    }
    const agendamentoAtualizado = await Agendamento.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!agendamentoAtualizado) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    return res.status(200).json(agendamentoAtualizado);
  } catch (error) {
    return res.status(400).json({ error: 'Erro ao atualizar status', detalhes: error.message });
  }
}

// Deletar agendamento
async function deleteAgendamento(req, res) {
  try {
    const agendamentoDeletado = await Agendamento.findByIdAndDelete(req.params.id);
    if (!agendamentoDeletado) {
      return res.status(404).json({ error: 'Agendamento não encontrado' });
    }
    return res.status(200).json({ message: 'Agendamento deletado com sucesso.' });
  } catch (error) {
    return res.status(400).json({ error: 'Erro ao deletar agendamento', detalhes: error.message });
  }
}

// Exportação padrão
module.exports = {
  createAgendamento,
  getAllAgendamentos,
  getAgendamento,
  atualizarAgendamento,
  atualizarStatusAgendamento,
  deleteAgendamento,
};
