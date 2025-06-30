const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Cliente'); // ou Cliente, conforme seu arquivo
const {  sendWhatsAppMessage } = require('../utils/zapi_client');
const { classificarIntencaoCliente, gerarRespostaLaura } = require('../utils/openaiHelper');



// Função para notificar cliente individual
async function notificarCliente(req, res) {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) {
    return res.status(400).json({ ok: false, error: 'Telefone e mensagem são obrigatórios.' });
  }
  const result = await  sendWhatsAppMessage(telefone, mensagem);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
}

// Função para enviar mensagem de teste
async function enviarMensagemDireta(req, res) {
  const { to, body } = req.body;
  const result = await sendZapiWhatsAppMessage(to, body);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
}

// Enviar mensagem para todos com agendamento amanhã
async function notificarAgendamentosAmanha(req, res) {
  try {
    const hoje = new Date();
    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);
    const fimAmanha = new Date(amanha);
    fimAmanha.setHours(23, 59, 59, 999);

    const agendamentos = await Agendamento.find({
      dataHora: { $gte: amanha, $lte: fimAmanha },
      status: { $ne: 'Cancelado' }
    }).populate('cliente');

    const resultados = [];

    for (const ag of agendamentos) {
      const telefone = ag.cliente?.telefone;
      if (!telefone) continue;

      const hora = new Date(ag.dataHora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      const mensagem = `Olá ${ag.cliente.nome}, tudo bem? Este é um lembrete do seu atendimento marcado para amanhã às ${hora}. Qualquer dúvida, estamos à disposição.`;

      const resultado = await sendWhatsAppMessage(telefone, mensagem);
      resultados.push({ cliente: ag.cliente.nome, status: resultado.success });
    }

    return res.status(200).json({ ok: true, enviados: resultados.length, detalhes: resultados });

  } catch (error) {
    console.error('Erro ao enviar lembretes:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

async function zapiWebhook(req, res) {
const phone = req.body?.phone || req.body?.body?.phone || req.body?.data?.phone;
const texto = req.body?.text?.message || req.body?.body?.text?.message || req.body?.message;

  let cliente = await Cliente.findOne({ telefone: phone });

  // Debug
  console.log('Telefone:', phone, 'Etapa:', cliente?.etapaConversa, 'Texto:', texto);

  if (!cliente) {
    await  sendWhatsAppMessage(phone, "Oi! Não encontrei seu cadastro. Qual o seu nome, por favor?");
    await Cliente.create({ telefone: phone, etapaConversa: 'aguardando_nome' });
    return res.json({ status: 'aguardando_nome' });
  }

  if (cliente.etapaConversa === 'aguardando_nome') {
    cliente.nome = texto;
    cliente.etapaConversa = 'livre';
    await cliente.save();
    await  sendWhatsAppMessage(phone, `Muito obrigado, ${cliente.nome}! Agora posso te ajudar. Em que posso ajudar hoje?`);
    return res.json({ status: 'nome_registrado' });
  }

  // >>> ETAPA CRÍTICA: sempre trate etapas específicas ANTES da intenção! <<<
  if (cliente.etapaConversa === 'aguardando_nova_data') {
    // Aqui você pode chamar outro helper da IA para extrair a data/hora da frase!
    // const dataDesejada = texto; // depois pode usar IA para estruturar melhor
    // const horariosLivres = await buscarHorariosDisponiveis(dataDesejada);
    await  sendWhatsAppMessage(phone, `Ótimo, ${cliente.nome}! Tenho os seguintes horários: 14h, 16h e 18h. Qual prefere?`);
    cliente.etapaConversa = 'aguardando_confirmacao_horario';
    await cliente.save();
    return res.json({ status: 'sugeriu_horarios' });
  }

  if (cliente.etapaConversa === 'aguardando_confirmacao_horario') {
    // Salva agendamento no banco!
    await sendWhatsAppMessage(phone, `Prontinho, ${cliente.nome}! Seu atendimento foi remarcado para o horário escolhido. Qualquer dúvida, é só chamar!`);
    cliente.etapaConversa = 'livre';
    await cliente.save();
    return res.json({ status: 'remarcado' });
  }

  // Só depois disso, classifica intenção!
  const intencao = await classificarIntencaoCliente(texto);
  console.log('Intenção IA:', intencao);

  if (intencao && intencao.toUpperCase().startsWith('REM')) {
    cliente.etapaConversa = 'aguardando_nova_data';
    await cliente.save();
    await sendWhatsAppMessage(phone, `Sem problemas, ${cliente.nome}! Para qual dia e horário gostaria de remarcar?`);
    return res.json({ status: 'remarcar_perguntou_data' });
  }

  // ... outros fluxos de intenção aqui (CONFIRMAR, CANCELAR, PERGUNTA, OUTRO) ...

  await sendWhatsAppMessage(phone, `Oi, ${cliente.nome}! Sua mensagem foi recebida. Em que posso te ajudar?`);
  return res.json({ status: 'livre' });
}


// Exporte tudo no final:
module.exports = {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
};
