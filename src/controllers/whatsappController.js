import Agendamento from '../models/Agendamento.js';
import Cliente from '../models/Cliente.js';
import { sendWhatsAppMessage, sendZapiWhatsAppMessage } from '../utils/zapi_client.js';
import { classificarIntencaoCliente } from '../utils/openaiHelper.js';

export const notificarCliente = async (req, res) => {
  const { telefone, mensagem } = req.body;
  if (!telefone || !mensagem) {
    return res.status(400).json({ ok: false, error: 'Telefone e mensagem são obrigatórios.' });
  }
  const result = await sendWhatsAppMessage(telefone, mensagem);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
};

export const enviarMensagemDireta = async (req, res) => {
  const { to, body } = req.body;
  // Nota: Verifique se 'sendZapiWhatsAppMessage' é a função correta que você quer usar aqui.
  const result = await sendZapiWhatsAppMessage(to, body);
  if (result.success) {
    return res.status(200).json({ ok: true, result: result.result });
  } else {
    return res.status(500).json({ ok: false, error: result.error });
  }
};

export const notificarAgendamentosAmanha = async (req, res) => {
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
      if (!ag.cliente?.telefone) continue;
      const hora = new Date(ag.dataHora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      const mensagem = `Olá ${ag.cliente.nome}, este é um lembrete do seu atendimento para amanhã às ${hora}.`;
      const resultado = await sendWhatsAppMessage(ag.cliente.telefone, mensagem);
      resultados.push({ cliente: ag.cliente.nome, status: resultado.success });
    }
    return res.status(200).json({ ok: true, enviados: resultados.length, detalhes: resultados });
  } catch (error) {
    console.error('Erro ao enviar lembretes:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};

export const zapiWebhook = async (req, res) => {
  const phone = req.body?.phone || req.body?.body?.phone || req.body?.data?.phone;
  const texto = req.body?.text?.message || req.body?.body?.text?.message || req.body?.message;

  if (!phone || !texto) {
      return res.status(200).send('Ignorando evento sem telefone ou texto.');
  }
  
  let cliente = await Cliente.findOne({ telefone: phone });

  if (!cliente) {
    await sendWhatsAppMessage(phone, "Olá! Bem-vindo(a). Para começarmos, qual o seu nome completo?");
    await Cliente.create({ telefone: phone, etapaConversa: 'aguardando_nome' });
    return res.json({ status: 'novo_cliente_aguardando_nome' });
  }

  if (cliente.etapaConversa === 'aguardando_nome') {
    cliente.nome = texto;
    cliente.etapaConversa = 'livre'; // Estado padrão após registro
    await cliente.save();
    await sendWhatsAppMessage(phone, `Obrigado, ${cliente.nome}! O seu registo está completo. Como posso ajudar hoje?`);
    return res.json({ status: 'nome_registrado' });
  }

  // Lógica de estado da conversa (ex: reagendamento)
  // ...

  // Se não estiver num fluxo específico, usa a IA para classificar a intenção
  const intencao = await classificarIntencaoCliente(texto);

  if (intencao && intencao.toUpperCase().includes('REM')) {
    cliente.etapaConversa = 'aguardando_nova_data';
    await cliente.save();
    await sendWhatsAppMessage(phone, `Entendido, ${cliente.nome}. Para qual dia gostaria de remarcar?`);
    return res.json({ status: 'iniciando_reagendamento' });
  }

  // Resposta padrão
  const respostaIA = `Olá ${cliente.nome}! Recebi a sua mensagem. A nossa equipa irá responder assim que possível.`;
  await sendWhatsAppMessage(phone, respostaIA);
  return res.json({ status: 'resposta_padrao_enviada' });
};