require('dotenv').config();
var axios = require('axios');
var qs = require('qs');

async function sendWhatsAppMessage(to, body) {
  // Deixe o token e instanceId em variáveis de ambiente por segurança
  const token = process.env.ULTRAMSG_TOKEN;
  const instanceId = process.env.ULTRAMSG_INSTANCE_ID;

  var data = qs.stringify({
    "token": token,
    "to": to,
    "body": body
  });

  var config = {
    method: 'post',
    url: `https://api.ultramsg.com/${instanceId}/messages/chat`,
    headers: {  
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data : data
  };

  try {
    const response = await axios(config);
    return { success: true, result: response.data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}



module.exports = {
  sendWhatsAppMessage
};