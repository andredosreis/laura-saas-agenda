// src/controllers/agendamentoController.js

/*console.log('CONTROLLER: Iniciando carregamento de agendamentoController.js');
*/
let Agendamento; // Declarar fora para que seja acessível em todo o módulo
try {
  console.log('CONTROLLER (agendamentoCtrl): Tentando fazer require de ../models/Agendamento');
  Agendamento = require('../models/Agendamento'); // Atribui à variável do escopo superior
  console.log('CONTROLLER (agendamentoCtrl): Modelo Agendamento CARREGADO COM SUCESSO');
} catch (err) {
  console.error('CONTROLLER (agendamentoCtrl): FALHA AO FAZER REQUIRE DE AGENDAMENTO:', err);
  throw err; // Re-lança o erro para parar o processo
}

const Cliente = require('../models/Clientes'); // Verifique se o nome do arquivo é Clientes.js ou Cliente.js
const Pacote = require('../models/Pacote');
const { sendWhatsAppMessage } = require('../utils/sendWhatsAppMessage'); // Importa a função de envio de WhatsApp

// 1. Criar novo agendamento
const createAgendamento = async (req, res) => {
  try {
    const { clienteId, pacoteId, dataHora, observacoes, status, servicoAvulsoNome, servicoAvulsoValor } = req.body;

    // 1. Validações iniciais
    if (!clienteId || !dataHora || !status) {
        return res.status(400).json({ message: "Cliente, data/hora e status são obrigatórios." });
    }
    
    // 2. Buscar o cliente
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado.' });
    }

    // 3. Lógica para agendamento com pacote (verificação de sessões)
    // Se for agendamento com pacote E NÃO for serviço avulso, verifica sessões.
    if (pacoteId && (!servicoAvulsoNome || servicoAvulsoNome.trim() === '')) {
      const pacote = await Pacote.findById(pacoteId);
      if (!pacote) {
        return res.status(404).json({ message: 'Pacote não encontrado.' });
      }
      if (cliente.sessoesRestantes === undefined || cliente.sessoesRestantes <= 0) {
        return res.status(400).json({ 
          message: 'Cliente não possui sessões disponíveis no pacote.' 
        });
      }
      // NOTA: A lógica de decrementar a sessão deve ocorrer quando o agendamento é 'Realizado',
      // não na criação. Seu código já faz isso em atualizarAgendamento/atualizarStatusAgendamento.
    }
    
    // 4. Cria o novo agendamento
    const novoAgendamento = new Agendamento({
      cliente: clienteId,
      pacote: pacoteId || null,
      dataHora,
      observacoes,
      status: status || 'Agendado', 
      servicoAvulsoNome: servicoAvulsoNome || null,
      servicoAvulsoValor: servicoAvulsoValor || null,
    });

    // 5. Salva o agendamento no banco de dados
    const agendamentoSalvo = await novoAgendamento.save();

    // 6. ENVIAR MENSAGEM DE CONFIRMAÇÃO VIA WHATSAPP (AQUI É O LUGAR CERTO!)
    // Esta parte é executada uma única vez após o agendamento ser salvo.
    if (cliente && cliente.telefone) { // Garante que o cliente e o telefone existem
        const mensagem = `Olá ${cliente.nome}! Seu agendamento na La Estetica Avançada para ${new Date(agendamentoSalvo.dataHora).toLocaleDateString('pt-pt')} às ${new Date(agendamentoSalvo.dataHora).toLocaleTimeString('pt-pt', { hour: '2-digit', minute: '2-digit' })} foi confirmado! Qualquer dúvida, responda por aqui.`;
        
        // Chama a função de envio de WhatsApp. É uma operação assíncrona, mas não precisa bloquear a resposta da API.
        sendWhatsAppMessage(cliente.telefone, mensagem)
            .then(resWhatsapp => console.log('Mensagem de confirmação de agendamento enviada para o WhatsApp:', resWhatsapp))
            .catch(errWhatsapp => console.error('ERRO ao enviar WhatsApp na criação de agendamento:', errWhatsapp));
    }

    // 7. Popula o agendamento salvo para retornar dados completos na resposta da API
    const agendamentoPopulado = await Agendamento.findById(agendamentoSalvo._id)
      .populate('cliente', 'nome telefone')
      .populate('pacote', 'nome');

    // 8. Envia a resposta final da API
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
    
    // Buscar o agendamento atual para verificar mudança de status
    const agendamentoAtual = await Agendamento.findById(id);
    if (!agendamentoAtual) {
      return res.status(404).json({ message: 'Agendamento não encontrado para atualização.' });
    }
    
    const statusAnterior = agendamentoAtual.status;
    const novoStatus = dadosDoFormulario.status;
    
    // Verificar se o status mudou para "Realizado" e se é um agendamento de pacote
    if (novoStatus === 'Realizado' && statusAnterior !== 'Realizado' && 
        agendamentoAtual.pacote && 
        (!agendamentoAtual.servicoAvulsoNome || agendamentoAtual.servicoAvulsoNome.trim() === '')) {
      
      // Buscar o cliente para atualizar as sessões restantes
      const cliente = await Cliente.findById(agendamentoAtual.cliente);
      if (!cliente) {
        return res.status(404).json({ message: "Cliente associado ao agendamento não encontrado." });
      }
      
      // Verificar se o cliente tem sessões disponíveis
      if (cliente.sessoesRestantes === undefined || cliente.sessoesRestantes <= 0) {
        return res.status(400).json({ message: 'Cliente não possui sessões de pacote disponíveis para debitar.' });
      }
      
      // Diminuir uma sessão
      cliente.sessoesRestantes -= 1;
      await cliente.save();
      console.log(`Sessão debitada do cliente ${cliente.nome}. Sessões restantes: ${cliente.sessoesRestantes}`);
    }
    
    // Verificar se o status mudou de "Realizado" para outro status
    if (statusAnterior === 'Realizado' && novoStatus !== 'Realizado' && 
        agendamentoAtual.pacote && 
        (!agendamentoAtual.servicoAvulsoNome || agendamentoAtual.servicoAvulsoNome.trim() === '')) {
      
      // Buscar o cliente para restaurar a sessão
      const cliente = await Cliente.findById(agendamentoAtual.cliente);
      if (cliente) {
        cliente.sessoesRestantes = (cliente.sessoesRestantes || 0) + 1;
        await cliente.save();
        console.log(`Sessão restaurada para o cliente ${cliente.nome}. Sessões restantes: ${cliente.sessoesRestantes}`);
      }
    }

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
    
    // Lista de status válidos, incluindo 'Realizado' (equivalente a 'CONCLUIDO')
    const statusValidos = ['Agendado', 'Realizado', 'Cancelado', 'Confirmado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu']; 
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ message: 'Status fornecido é inválido.', statusRecebido: status, statusValidos });
    }

    const agendamento = await Agendamento.findById(id);
    if (!agendamento) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }

    const statusAnterior = agendamento.status;
    const novoStatus = status;

    // Verificar se o status mudou para "Realizado"
    if (novoStatus === 'Realizado' && statusAnterior !== 'Realizado') {
      if (agendamento.pacote && (!agendamento.servicoAvulsoNome || agendamento.servicoAvulsoNome.trim() === '')) {
        const cliente = await Cliente.findById(agendamento.cliente);
        if (!cliente) {
          return res.status(404).json({ message: "Cliente associado ao agendamento não encontrado." });
        }
        
        // Verificar se o cliente tem sessões disponíveis
        if (cliente.sessoesRestantes === undefined || cliente.sessoesRestantes <= 0) {
          return res.status(400).json({ message: 'Cliente não possui sessões de pacote disponíveis para debitar.' });
        }
        
        // Diminuir uma sessão
        cliente.sessoesRestantes -= 1;
        await cliente.save();
        console.log(`Sessão debitada do cliente ${cliente.nome}. Sessões restantes: ${cliente.sessoesRestantes}`);
      }
    }
    
    // Verificar se o status mudou de "Realizado" para outro status
    if (statusAnterior === 'Realizado' && novoStatus !== 'Realizado') {
      if (agendamento.pacote && (!agendamento.servicoAvulsoNome || agendamento.servicoAvulsoNome.trim() === '')) {
        const cliente = await Cliente.findById(agendamento.cliente);
        if (cliente) {
          cliente.sessoesRestantes = (cliente.sessoesRestantes || 0) + 1;
          await cliente.save();
          console.log(`Sessão restaurada para o cliente ${cliente.nome}. Sessões restantes: ${cliente.sessoesRestantes}`);
        }
      }
    }

    agendamento.status = novoStatus;
    await agendamento.save();
    
    const agendamentoPopulado = await Agendamento.findById(agendamento._id)
                                      .populate('cliente', 'nome telefone')
                                      .populate('pacote', 'nome');
    res.status(200).json(agendamentoPopulado);
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

    // Se o agendamento for de pacote e estiver marcado como Realizado, restaurar a sessão ao cliente
    if (agendamento.pacote && 
        (!agendamento.servicoAvulsoNome || agendamento.servicoAvulsoNome.trim() === '') && 
        agendamento.status === 'Realizado') {
      const cliente = await Cliente.findById(agendamento.cliente);
      if (cliente) {
        cliente.sessoesRestantes = (cliente.sessoesRestantes || 0) + 1;
        await cliente.save();
        console.log(`Sessão restaurada para o cliente ${cliente.nome} ao deletar agendamento. Sessões restantes: ${cliente.sessoesRestantes}`);
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