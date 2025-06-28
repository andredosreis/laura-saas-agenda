const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Cliente'); // ou Cliente, conforme seu arquivo
const { sendZapiWhatsAppMessage } = require('../utils/sendZapiWhatsAppMessage');

// Função para notificar cliente individual
async function notificarCliente(req, res) {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) {
    return res.status(400).json({ ok: false, error: 'Telefone e mensagem são obrigatórios.' });
  }
  const result = await sendZapiWhatsAppMessage(telefone, mensagem);
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

      const resultado = await sendZapiWhatsAppMessage(telefone, mensagem);
      resultados.push({ cliente: ag.cliente.nome, status: resultado.success });
    }

    return res.status(200).json({ ok: true, enviados: resultados.length, detalhes: resultados });

  } catch (error) {
    console.error('Erro ao enviar lembretes:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// Webhook Z-API para confirmação automática de agendamento
async function zapiWebhook(req, res) {
  try {
    const phone = req.body.body.phone;
    const texto = req.body.body.text?.message?.trim().toLowerCase();

    if (!phone || !texto) {
      return res.status(400).json({ error: 'Dados insuficientes' });
    }

    if (texto !== "confirmo") {
      console.log(`Mensagem ignorada de ${phone}: "${texto}"`);
      return res.json({ status: 'ignorada', motivo: 'mensagem não é confirmação' });
    }

    const cliente = await Cliente.findOne({ telefone: phone });
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    const agendamento = await Agendamento.findOne({
      cliente: cliente._id,
      status: { $ne: 'confirmado' }
    }).sort({ data: -1 });

    if (!agendamento) {
      return res.status(404).json({ error: 'Agendamento pendente não encontrado' });
    }

    agendamento.status = 'confirmado';
    agendamento.confirmadoEm = new Date();
    await agendamento.save();

    console.log(`Agendamento ${agendamento._id} confirmado pelo WhatsApp (Z-API)!`);
    res.json({ status: 'ok' });

  } catch (err) {
    console.error('Erro ao processar webhook Z-API:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// Exporte tudo no final:
module.exports = {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha,
  zapiWebhook
};
