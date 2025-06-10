const { sendWhatsAppMessage } = require('../utils/sendWhatsAppMessage');
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

module.exports = {
  notificarCliente,
  enviarMensagemDireta
};
