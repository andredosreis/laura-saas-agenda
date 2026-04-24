const { sendWhatsAppMessage, ZAPIClient } = require('../utils/zapi_client');


// ...
async function notificarCliente(req, res) {
  const { telefone, mensagem } = req.body;
  // Formate o telefone para padrão ZAPI:
  const client = new ZAPIClient();
  const formattedPhone = client.formatPhoneNumber(telefone);
  if (!client.validatePhoneNumber(formattedPhone)) {
    return res.status(400).json({ ok: false, error: 'Número de telefone inválido para ZAPI.' });
  }
  const result = await sendWhatsAppMessage(formattedPhone, mensagem);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.data });
  } else {
    return res.status(500).json({ ok: false, error: result.error, data: result.data });
  }
}
