// src/controllers/agendamentoController.js
console.log('CONTROLLER: Iniciando carregamento de agendamentoController.js');

let Agendamento; // Declarar fora para que seja acessível em todo o módulo
try {
  console.log('CONTROLLER: Tentando fazer require de ../models/Agendamento');
  Agendamento = require('../models/Agendamento'); // Atribui à variável do escopo superior
  console.log('CONTROLLER: Modelo Agendamento CARREGADO COM SUCESSO');
} catch (err) {
  console.error('CONTROLLER: FALHA AO FAZER REQUIRE DE AGENDAMENTO:', err);
  // Se não conseguir carregar o modelo Agendamento, não adianta continuar.
  // Lançar o erro impede que o controller seja carregado incorretamente.
  throw err;
}

// Os outros modelos podem ser importados normalmente
const Cliente = require('../models/Clientes');
const Pacote = require('../models/Pacote');

// 1. Criar novo agendamento
const createAgendamento = async (req, res) => {
  try {
    const { clienteId, pacoteId, dataHora, observacoes, status, servicoAvulsoNome, servicoAvulsoValor } = req.body;

    if (!clienteId || !dataHora || !status) {
        return res.status(400).json({ message: "Cliente, data/hora e status são obrigatórios." });
    }
    
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    if (pacoteId) {
      const pacote = await Pacote.findById(pacoteId);
      if (!pacote) {
        return res.status(404).json({ message: 'Pacote não encontrado.' });
      }
      // Lógica de sessões se um pacote for selecionado
      if ((!servicoAvulsoNome || servicoAvulsoNome.trim() === '') && (cliente.sessoesRestantes === undefined || cliente.sessoesRestantes <= 0)) {
        return res.status(400).json({ 
          message: 'Cliente não possui sessões disponíveis no pacote ou o campo sessoesRestantes não está definido no modelo Cliente.' 
        });
      }
    }
    
    const novoAgendamento = new Agendamento({
      cliente: clienteId,
      pacote: pacoteId || null,
      dataHora,
      observacoes,
      status: status || 'Agendado',
      servicoAvulsoNome: servicoAvulsoNome || null,
      servicoAvulsoValor: servicoAvulsoValor || null,
    });

    const agendamentoSalvo = await novoAgendamento.save();
    const agendamentoPopulado = await Agendamento.findById(agendamentoSalvo._id)
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome');

    res.status(201).json(agendamentoPopulado);

  } catch (error) {
    console.error('Erro ao criar agendamento:', error);
    if (error.name === 'ValidationError') {
      const mensagens = Object.values(error.errors).map(err => ({ field: err.path, message: err.message }));
      return res.status(400).json({ message: 'Dados inválidos ao criar agendamento.', details: mensagens });
    }
    res.status(500).json({ message: 'Erro interno ao criar agendamento.', details: error.message });
  }
};

// 2. Listar todos os agendamentos
const getAllAgendamentos = async (req, res) => {
  try {
    const agendamentos = await Agendamento.find()
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome')
      .sort({ dataHora: -1 });
    res.status(200).json(agendamentos);
  } catch (error) {
    console.error('Erro ao listar agendamentos:', error);
    res.status(500).json({ message: 'Erro interno ao listar agendamentos.', details: error.message });
  }
};

// 3. Buscar agendamento por ID
const getAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id)
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome');
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    console.error('Erro ao buscar agendamento por ID:', error);
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID do agendamento inválido.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao buscar agendamento.', details: error.message });
  }
};

// 4. Atualizar um agendamento completo
const atualizarAgendamento = async (req, res) => {
  try {
    const { id } = req.params;
    const dadosDoFormulario = req.body;

    if (dadosDoFormulario.pacoteId === '' || dadosDoFormulario.pacoteId === undefined) {
        dadosDoFormulario.pacoteId = null;
    }
    if (dadosDoFormulario.servicoAvulsoNome !== undefined && dadosDoFormulario.servicoAvulsoNome.trim() === '') {
        dadosDoFormulario.servicoAvulsoNome = null;
    }
    if (dadosDoFormulario.servicoAvulsoValor === '' || dadosDoFormulario.servicoAvulsoValor === undefined) {
        dadosDoFormulario.servicoAvulsoValor = null;
    }

    const agendamentoAtualizado = await Agendamento.findByIdAndUpdate(
      id,
      dadosDoFormulario,
      { new: true, runValidators: true }
    ).populate('cliente', 'nome telefone').populate('pacote', 'nome');

    if (!agendamentoAtualizado) {
      return res.status(404).json({ message: 'Agendamento não encontrado para atualização.' });
    }
    res.status(200).json(agendamentoAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar agendamento (completo):', error);
    if (error.name === 'ValidationError') {
      const mensagens = Object.values(error.errors).map(err => ({ field: err.path, message: err.message }));
      return res.status(400).json({ message: 'Dados inválidos na atualização.', details: mensagens });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID do agendamento inválido.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao atualizar o agendamento.', details: error.message });
  }
};

// 5. Atualizar APENAS o status do agendamento
const atualizarStatusAgendamento = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const statusValidos = ['Agendado', 'Confirmado', 'Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu']; 
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ message: 'Status fornecido é inválido.', statusValidos });
    }

    const agendamento = await Agendamento.findById(id);
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }

    const statusAnterior = agendamento.status;
    if (statusAnterior !== status) {
        if (agendamento.pacote && (agendamento.servicoAvulsoNome == null || agendamento.servicoAvulsoNome.trim() === '')) {
            const cliente = await Cliente.findById(agendamento.cliente);
            if (!cliente) {
                return res.status(404).json({ message: "Cliente associado ao agendamento não encontrado." });
            }
            if (status === 'Realizado' && statusAnterior !== 'Realizado') {
                if (cliente.sessoesRestantes === undefined || cliente.sessoesRestantes <= 0) {
                    return res.status(400).json({ message: 'Cliente não possui sessões de pacote disponíveis para debitar.' });
                }
                cliente.sessoesRestantes -= 1;
                await cliente.save();
            }
            else if ((status === 'Cancelado Pelo Cliente' || status === 'Cancelado Pelo Salão') && statusAnterior === 'Realizado') {
                cliente.sessoesRestantes = (cliente.sessoesRestantes || 0) + 1;
                await cliente.save();
            }
        }
    }

    agendamento.status = status;
    await agendamento.save();
    
    const agendamentoPopuladov2 = await Agendamento.findById(agendamento._id)
                                      .populate('cliente', 'nome telefone')
                                      .populate('pacote', 'nome');
    res.status(200).json(agendamentoPopuladov2);
  } catch (error) {
    console.error('Erro ao atualizar status do agendamento:', error);
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID do agendamento inválido.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao atualizar status.', details: error.message });
  }
};

// 6. Deletar agendamento
const deleteAgendamento = async (req, res) => {
  try {
    const { id } = req.params;
    const agendamento = await Agendamento.findById(id);

    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado para deleção.' });
    }

    if (agendamento.pacote && (agendamento.servicoAvulsoNome == null || agendamento.servicoAvulsoNome.trim() === '') && agendamento.status !== 'Realizado') {
      const cliente = await Cliente.findById(agendamento.cliente);
      if (cliente) {
        cliente.sessoesRestantes = (cliente.sessoesRestantes || 0) + 1;
        await cliente.save();
      }
    }

    await Agendamento.findByIdAndDelete(id);
    res.status(200).json({ message: 'Agendamento removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao deletar agendamento:', error);
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID do agendamento inválido.', details: error.message });
    }
    res.status(500).json({ message: 'Erro interno ao deletar agendamento.', details: error.message });
  }
};

module.exports = {
  createAgendamento,
  getAllAgendamentos,
  getAgendamento,
  atualizarAgendamento,
  atualizarStatusAgendamento,
  deleteAgendamento,
};