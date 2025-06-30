const { sendWhatsAppMessage } = require('./src/utils/zapi_client'); // Caminho ajustado

(async () => {
  const resultado = await sendWhatsAppMessage('351912462033', 'Teste WhatsApp pelo ZAPI!');
  console.log(resultado);
})();
