// src/controllers/agenteController.js

const { DateTime } = require('luxon');
const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Cliente');


// Futuramente, podemos adicionar a integração com a OpenAI aqui.

console.log('CONTROLLER: Carregando agenteController.js');

/**
 * LÓGICA PRINCIPAL - Passo 3 do Plano de Ação
 * Procura agendamentos para o dia seguinte e envia lembretes personalizados.
 */
const enviarLembretes24h = async (req, res) => {
  console.log('AGENTE: Iniciando tarefa de enviar lembretes de 24h...');
  try {
    // 1. Calcular o intervalo de tempo para "amanhã"
    const inicioDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fimDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    // 2. Buscar agendamentos que precisam de lembrete
    const agendamentosParaLembrar = await Agendamento.find({
      dataHora: { $gte: inicioDeAmanha, $lte: fimDeAmanha },
      status: { $in: ['Agendado', 'Confirmado'] }, // Envia lembrete se estiver agendado ou já confirmado
      // Futuramente, podemos adicionar: lembreteEnviado: false
    }).populate('cliente pacote');

    if (agendamentosParaLembrar.length === 0) {
      console.log('AGENTE: Nenhum agendamento para lembrar amanhã.');
      return res.status(200).json({ message: 'Nenhum agendamento para lembrar amanhã.' });
    }

    // 3. Enviar as mensagens
    const resultados = [];
    for (const ag of agendamentosParaLembrar) {
      if (ag.cliente && ag.cliente.telefone) {
        const nomeDoServico = ag.pacote?.nome || ag.servicoAvulsoNome || 'o seu atendimento';
        const horaFormatada = DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
        
        const mensagem = `Olá ${ag.cliente.nome}! Este é um lembrete da sua sessão de "${nomeDoServico}" agendada para amanhã às ${horaFormatada}. Por favor, responda com "Sim" para confirmar.`;
        
        await sendZapiWhatsAppMessage(ag.cliente.telefone, mensagem);
        resultados.push({ cliente: ag.cliente.nome, status: 'Lembrete enviado' });
      }
    }

    console.log(`AGENTE: Lembretes de 24h enviados para ${resultados.length} clientes.`);
    res.status(200).json({
      success: true,
      message: `Lembretes enviados para ${resultados.length} agendamentos.`,
      detalhes: resultados,
    });

  } catch (error) {
    console.error('AGENTE: Erro ao enviar lembretes de 24h:', error);
    res.status(500).json({ success: false, message: 'Ocorreu um erro no servidor do agente.' });
  }
};

/**
 * LÓGICA FUTURA - Passo 6 do Plano de Ação
 * Recebe uma resposta do cliente via webhook e inicia o processamento.
 */
const processarRespostaWhatsapp = async (req, res) => {
    const { telefoneCliente, mensagem } = req.body;
    console.log(`AGENTE: Mensagem recebida de ${telefoneCliente}: "${mensagem}"`);

    // --- LÓGICA FUTURA COM IA SERÁ ADICIONADA AQUI ---
    // 1. Encontrar cliente e agendamento.
    // 2. Enviar mensagem para a OpenAI para obter a intenção.
    // 3. Tomar ação (confirmar/cancelar agendamento).
    // 4. Notificar Laura.
    // ------------------------------------------------

    // Por agora, apenas confirmamos o recebimento.
    res.status(200).json({ 
        status: 'Mensagem recebida pelo agente.',
        dados: { telefoneCliente, mensagem }
    });
};

module.exports = {
  enviarLembretes24h,
  processarRespostaWhatsapp,
};
