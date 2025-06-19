const { sendWhatsAppMessage } = require('../utils/sendWhatsAppMessage');
const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Clientes');

const axios = require('axios');
const qs = require('qs');

// Rota mais "formal", voltada para integração real
async function notificarCliente(req, res) {
  const { telefone, mensagem } = req.body;
  const result = await sendWhatsAppMessage(telefone, mensagem);

  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
}

// Rota mais "livre", útil para testes manuais
async function enviarMensagemDireta(req, res) {
  const { to, body } = req.body;
  const token = process.env.ULTRAMSG_TOKEN;
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;

  try {
    const data = qs.stringify({ token, to, body });

    const config = {
      method: 'post',
      url: `https://api.ultramsg.com/${instanceId}/messages/chat`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data
    };

    const response = await axios(config);
    return res.status(200).json({ ok: true, result: response.data });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.toString() });
  }
}

// Enviar mensagem de WhatsApp para clientes com agendamentos amanha

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

module.exports = {
  notificarCliente,
  enviarMensagemDireta,
  notificarAgendamentosAmanha
};
