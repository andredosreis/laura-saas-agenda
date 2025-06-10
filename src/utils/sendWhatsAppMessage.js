require('dotenv').config();
const axios = require('axios');
const qs = require('qs');

async function sendWhatsAppMessage(to, body) {
  const token = process.env.ULTRAMSG_TOKEN;
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;

  const data = qs.stringify({
    token,
    to,
    body
  });

  const config = {
    method: 'post',
    url: `https://api.ultramsg.com/${instanceId}/messages/chat`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data
  };

  try {
    const response = await axios(config);
    return { success: true, result: response.data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

module.exports = { sendWhatsAppMessage };
