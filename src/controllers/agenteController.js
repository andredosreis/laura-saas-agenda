// src/controllers/agenteController.js – versão ajustada (v2) com melhor detecção de nome+data

const { DateTime } = require('luxon');
const Agendamento = require('../models/Agendamento');
const { chatWithLaura }       = require('../utils/openaiHelper');
const { dispatch }            = require('../services/functionDispatcher');
const Cliente     = require('../models/Cliente');
const Conversa    = require('../models/Conversa');
const Pacote      = require('../models/Pacote');
const { sendWhatsAppMessage } = require('../utils/zapi_client');

const Mensagem   = require('../models/Mensagem');
const { detectarPalavraChave } = require('../utils/notificacaoHelper');

console.log('CONTROLLER: agenteController.js carregado (v2)');

//---------------------------------------------------------------------
// 1. Lembretes 24 h
//---------------------------------------------------------------------
const enviarLembretes24h = async (req, res) => {
  console.log('AGENTE: A enviar lembretes de 24 h…');
  try {
    const inicio = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fim    = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    const ags = await Agendamento.find({ dataHora: { $gte: inicio, $lte: fim }, status: { $in: ['Agendado', 'Confirmado'] } })
      .populate('cliente pacote');

    if (!ags.length) {
      console.log('AGENTE: Nada para lembrar amanhã.');
      return res.status(200).json({ message: 'Sem lembretes.' });
    }

    const resultados = [];
    for (const ag of ags) {
      if (!ag.cliente?.telefone) continue;
      const serv  = ag.pacote?.nome || ag.servicoAvulsoNome || 'o teu atendimento';
      const hora  = DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
      const msg   = `Olá ${ag.cliente.nome}! Só para lembrar que amanhã, às ${hora}, tens a sessão de "${serv}". Responde "Sim" para confirmares.`;
      await sendWhatsAppMessage(ag.cliente.telefone, msg);
      resultados.push({ cliente: ag.cliente.nome, status: 'enviado' });
    }

    res.status(200).json({ success: true, enviados: resultados.length });
  } catch (e) {
    console.error('AGENTE: Erro nos lembretes →', e);
    res.status(500).json({ success: false });
  }
};

//---------------------------------------------------------------------
// 2. Reagendamento (primeiro passo)
//---------------------------------------------------------------------
async function processarReagendamento(telefone, cliente, conversa) {
  if (!cliente) {
    return 'Ainda não encontrei o teu registo. Já és cliente da Laura ou é a tua primeira visita?';
  }

  const futuros = await Agendamento.find({ cliente: cliente._id, dataHora: { $gte: new Date() }, status: { $in: ['Agendado', 'Confirmado'] } })
    .populate('pacote').sort({ dataHora: 1 });

  if (!futuros.length) {
    return 'Não encontrei marcações futuras para reagendar. Queres marcar uma nova?';
  }

  const opcoes = futuros.map((ag, i) => {
    const dt    = DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' });
    const dia   = dt.toFormat('cccc', { locale: 'pt' });
    const hora  = dt.toFormat("dd/MM 'às' HH:mm");
    return { indice: i, agendamentoId: ag._id, servico: ag.pacote?.nome || ag.servicoAvulsoNome, diaSemana: dia, dataHora: hora, descricao: `${dia}, ${hora}` };
  });

  await Conversa.findOneAndUpdate({ telefone }, { estado: 'aguardando_escolha_reagendamento', opcoesReagendamento: opcoes }, { upsert: true });

  if (opcoes.length === 1) {
    const o = opcoes[0];
    return `Encontrei o teu agendamento de "${o.servico}" para ${o.descricao}. É este que queres remarcar?`;
  }

  let msg = 'Encontrei estas marcações:\n\n';
  opcoes.forEach(o => { msg += `• ${o.servico} – ${o.descricao}\n`; });
  msg += '\nQual queres remarcar?';
  return msg;
}

//---------------------------------------------------------------------
// 3. Gera horários disponíveis (mock)
//---------------------------------------------------------------------
async function gerarOpcoesHorarios() {
  const hoje = new Date();
  const op   = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(hoje); d.setDate(hoje.getDate() + i);
    ['09:00', '14:00', '16:00'].forEach(h => {
      const [H, M] = h.split(':');
      const dt = new Date(d); dt.setHours(+H, +M, 0, 0);
      const dia = DateTime.fromJSDate(dt, { zone: 'Europe/Lisbon' }).toFormat('cccc', { locale: 'pt' });
      op.push({ diaSemana: dia, data: dt.toISOString().split('T')[0], hora: h, dataCompleta: dt, descricao: `${dia} às ${h}` });
    });
  }
  return op.slice(0, 5);
}

//---------------------------------------------------------------------
// 2. Webhook principal com LLM + Function‑Calling
//---------------------------------------------------------------------
async function processarRespostaWhatsapp(req, res) {
  try {
    const telefone = req.body.phone || req.body.telefoneCliente;
    const texto    = (req.body.text && req.body.text.message) || req.body.mensagem;
    if (!telefone || !texto) return res.status(400).json({ error: 'Dados incompletos' });

    const cliente  = await Cliente.findOne({ telefone });
    const contexto = { cliente };

    let resposta = await chatWithLaura({ userMsg: texto, ctx: contexto });

    if (resposta.function_call) {
      const { name, arguments: args } = resposta.function_call;
      const result = await dispatch(name, JSON.parse(args));

      resposta = await chatWithLaura({
        userMsg: texto,
        ctx: contexto,
        functionResponse: { name, result },
      });
    }

    await sendWhatsAppMessage(telefone, resposta.content);
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook erro →', err);
    try {
      await sendWhatsAppMessage(req.body.phone, 'Desculpa, houve um problema, estaremos a resolver  😊');
    } catch (_) {}
    res.status(500).json({ success: false });
  }
}

//---------------------------------------------------------------------
// 5. Montar contexto dinâmico para a IA
//---------------------------------------------------------------------
async function montarContexto(cliente, conversa) {
  let ctx = '';
  const pacotes = await Pacote.find({ ativo: true });
  const lista   = pacotes.map(p => `• ${p.nome} — €${p.preco}`).join('\n');

  if (cliente) {
    ctx = `CLIENTE: ${cliente.nome} (${cliente.telefone})\nAniversário: ${cliente.dataNascimento ? cliente.dataNascimento.toLocaleDateString('pt-PT') : '—'}\n\nPacotes:\n${lista}`;
    const prox = await buscarAgendamentosProximos(cliente._id);
    if (prox.length) {
      const ag = prox[0];
      const dt = DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' }).toFormat("dd/MM/yyyy 'às' HH:mm");
      ctx += `\nPróxima sessão: ${ag.pacote?.nome || ag.servicoAvulsoNome} em ${dt}`;
    }
  } else {
    ctx = `NOVO CONTACTO – estado: ${conversa?.estado || 'aguardando_nome'}\nUsa tom informal (PT‑PT). Só pedes preços depois de concluir registo.\nPacotes disponíveis:\n${pacotes.map(p => `• ${p.nome}`).join('\n')}`;
  }
  return ctx;
}

//---------------------------------------------------------------------
// 6. Gestão de estado da conversa / criação de cliente
//---------------------------------------------------------------------
async function atualizarEstadoConversa(telefone, mensagem, cliente, conversa) {
  if (cliente) return cliente; // já existe

  // garante ter conversa
  if (!conversa) {
    conversa = await Conversa.create({ telefone, estado: 'aguardando_nome' });
  }

  const dateRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/;
  const dateMatch = mensagem.match(dateRegex);
  const temData   = Boolean(dateMatch);
  let dataNasc    = null;

  if (temData) {
    const dStr = dateMatch[0].replace(/-/g, '/');
    const [dd, mm, aaaa] = dStr.split('/');
    dataNasc = new Date(`${aaaa}-${mm}-${dd}`);
    if (isNaN(dataNasc)) dataNasc = null;
  }

  // Se ainda falta nome
  if (conversa.estado === 'aguardando_nome') {
    if (temData) {
      // mensagem traz nome + data
      const nomeParte = mensagem.replace(dateRegex, '').replace(/\s+/g, ' ').trim();
      if (nomeParte.length >= 3 && dataNasc) {
        return await criarClienteEFecharConversa(conversa, telefone, nomeParte, dataNasc);
      }
    } else {
      // apenas nome
      if (!conversa.nomeTemporario) {
        const partes = mensagem.trim().split(' ');
        if (partes[0].length > 2) {
          conversa.nomeTemporario = mensagem.trim();
          conversa.estado = 'aguardando_data_nascimento';
          await conversa.save();
        }
      }
      return null;
    }
  }

  // se estamos à espera de data
  if (conversa.estado === 'aguardando_data_nascimento') {
    if (temData && dataNasc) {
      conversa.dataNascimentoTemporaria = dataNasc;
      await conversa.save();

      if (conversa.nomeTemporario) {
        return await criarClienteEFecharConversa(conversa, telefone, conversa.nomeTemporario, dataNasc);
      }
    }
  }

  return null;
}

async function criarClienteEFecharConversa(conversa, telefone, nome, dataNascimento) {
  const cli = await Cliente.create({ nome, telefone, dataNascimento, observacoes: 'Criado via WhatsApp' });
  await Conversa.deleteOne({ _id: conversa._id });
  console.log(`AGENTE: Cliente criado – ${nome}`);
  return cli;
}

//---------------------------------------------------------------------
// 7. Agendamentos próximos (7 dias)
//---------------------------------------------------------------------
async function buscarAgendamentosProximos(clienteId) {
  const hoje = new Date();
  const fim  = new Date(); fim.setDate(hoje.getDate() + 7);
  return Agendamento.find({ cliente: clienteId, dataHora: { $gte: hoje, $lte: fim }, status: { $in: ['Agendado', 'Confirmado'] } }).populate('pacote');
}

//---------------------------------------------------------------------
module.exports = { enviarLembretes24h, processarRespostaWhatsapp };

