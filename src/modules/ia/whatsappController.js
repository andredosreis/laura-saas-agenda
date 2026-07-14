import Agendamento from '../../models/Agendamento.js';
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';

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
  const result = await sendWhatsAppMessage(to, body);
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

    const elegiveis = agendamentos.filter((ag) => ag.cliente?.telefone);
    const resultados = await Promise.all(elegiveis.map(async (ag) => {
      const hora = new Date(ag.dataHora).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      const mensagem = `Olá ${ag.cliente.nome}, este é um lembrete do seu atendimento para amanhã às ${hora}.`;
      const resultado = await sendWhatsAppMessage(ag.cliente.telefone, mensagem);
      return { cliente: ag.cliente.nome, status: resultado.success };
    }));
    return res.status(200).json({ ok: true, enviados: resultados.length, detalhes: resultados });
  } catch (error) {
    console.error('Erro ao enviar lembretes:', error);
    return res.status(500).json({ ok: false, error: 'Erro interno ao enviar lembretes' });
  }
};
