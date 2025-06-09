const express = require('express');
const router = express.Router();
const axios = require('axios');
const qs = require('qs');

// Envia mensagem WhatsApp
router.post('/send', async (req, res) => {
  const { to, body } = req.body;
  // Deixe o token e instanceId em variáveis de ambiente por segurança
  const token = process.env.ULTRAMSG_TOKEN;
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;

  try {
    const data = qs.stringify({
      token: token,
      to: to,
      body: body
    });

    const config = {
      method: 'post',
      url: `https://api.ultramsg.com/${instanceId}/messages/chat`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data
    };

    const response = await axios(config);
    res.json({ success: true, result: response.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.toString() });
  }
});

module.exports = router;
