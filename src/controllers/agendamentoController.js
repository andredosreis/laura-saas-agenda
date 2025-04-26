const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Clientes');

// Criar novo agendamento
exports.createAgendamento = async (req, res) => {
  try {
    const novoAgendamento = new Agendamento(req.body);
    const salvo = await novoAgendamento.save();
    res.status(201).json(salvo);
  } catch (error) {
    console.error('Erro ao criar agendamento:', error.message);
    res.status(400).json({ error: 'Erro ao criar agendamento' });
  }
};

// Listar todos agendamentos
exports.getAllAgendamentos = async (req, res) => {
    try {
      const agendamentos = await Agendamento.find()
        .populate('cliente', 'nome telefone') // Pega nome e telefone do cliente
        .populate('pacote', 'nome categoria sessoes'); // Pega nome, categoria e sessoes do pacote
  
      res.status(200).json(agendamentos);
    } catch (error) {
      console.error('Erro ao listar agendamentos:', error.message);
      res.status(500).json({ error: 'Erro ao listar agendamentos' });
    }
  };
  
 
  
  // Atualizar status do agendamento
  exports.atualizarStatusAgendamento = async (req, res) => {
    try {
      const { status } = req.body;
  
      // Verificar se o status enviado é válido
      if (!['agendado', 'concluído', 'cancelado'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
  
      // Primeiro, encontramos o agendamento atual
      const agendamento = await Agendamento.findById(req.params.id);
  
      if (!agendamento) {
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }
  
      // Se for "concluído", vamos descontar 1 sessão do cliente
      if (status === 'concluído') {
        const cliente = await Cliente.findById(agendamento.cliente);
  
        if (cliente && cliente.sessoesRestantes > 0) {
          cliente.sessoesRestantes -= 1;
          console.log('🔍 Cliente antes de salvar:', cliente); // 👈 Linha para debug
          await cliente.save();
        }
      }
  
      // Agora atualiza o status do agendamento
      agendamento.status = status;
      await agendamento.save();
  
      res.status(200).json(agendamento);
    } catch (error) {
      console.error('Erro ao atualizar status do agendamento:', error.message);
      res.status(400).json({ error: 'Erro ao atualizar status do agendamento' });
    }
  };
  
  
 