import { DateTime } from "luxon";
import Agendamento from "../models/Agendamento.js";
import Cliente from "../models/Cliente.js";
import Conversa from "../models/Conversa.js";
import Pacote from "../models/Pacote.js";
import Mensagem from "../models/Mensagem.js";
import { chatWithLaura } from "../utils/openaiHelper.js";
import { dispatch } from "../services/functionDispatcher.js";
import { sendWhatsAppMessage } from "../utils/zapi_client.js";
import { detectarPalavraChave } from "../utils/notificacaoHelper.js";

console.log("CONTROLLER: agenteController.js carregado (v2)");

//---------------------------------------------------------------------
// 1. Lembretes 24 h
//---------------------------------------------------------------------
export const enviarLembretes24h = async (req, res) => {
  console.log("AGENTE: A enviar lembretes de 24 h…");
  try {
    const inicio = DateTime.now().setZone("Europe/Lisbon").plus({ days: 1 }).startOf("day").toJSDate();
    const fim = DateTime.now().setZone("Europe/Lisbon").plus({ days: 1 }).endOf("day").toJSDate();

    const ags = await Agendamento.find({
      dataHora: { $gte: inicio, $lte: fim },
      status: { $in: ["Agendado", "Confirmado"] },
    }).populate("cliente pacote");

    if (!ags.length) {
      const message = "AGENTE: Nada para lembrar amanhã.";
      console.log(message);
      if (res) return res.status(200).json({ message }); // Verifica se res existe (caso de CRON)
      return;
    }

    const resultados = [];
    for (const ag of ags) {
      if (!ag.cliente?.telefone) continue;
      const serv = ag.pacote?.nome || ag.servicoAvulsoNome || "o teu atendimento";
      const hora = DateTime.fromJSDate(ag.dataHora, { zone: "Europe/Lisbon" }).toFormat("HH:mm");
      const msg = `Olá ${ag.cliente.nome}! Só para lembrar que amanhã, às ${hora}, tens a sessão de "${serv}". Responde "Sim" para confirmares.`;
      await sendWhatsAppMessage(ag.cliente.telefone, msg);
      resultados.push({ cliente: ag.cliente.nome, status: "enviado" });
    }
    if (res) res.status(200).json({ success: true, enviados: resultados.length });
  } catch (e) {
    console.error("AGENTE: Erro nos lembretes →", e);
    if (res) res.status(500).json({ success: false, error: e.message });
  }
};

//---------------------------------------------------------------------
// 2. Webhook principal com LLM + Function-Calling
//---------------------------------------------------------------------
export const processarRespostaWhatsapp = async (req, res) => {
  try {
    const telefone = req.body.phone || req.body.telefoneCliente;
    const texto = (req.body.text && req.body.text.message) || req.body.mensagem;
    if (!telefone || !texto) return res.status(400).json({ error: "Dados incompletos" });

    let conversa = await Conversa.findOne({ telefone });
    if (!conversa) {
      conversa = await Conversa.create({ telefone, estado: "iniciando", dados: {} });
    }

    // Lógica de estado da conversa (simplificada para exemplo)
    switch (conversa.estado) {
      case "iniciando":
        await sendWhatsAppMessage(telefone, "Olá! Bem-vindo(a) à Clínica de Estética Laura. Como posso ajudar?");
        conversa.estado = "aguardando_agendamento"; // Mude para um estado mais genérico
        await conversa.save();
        break;
      default:
        // Todas as outras interações são delegadas ao LLM
        await handleLLM(texto, conversa);
        break;
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err);
    const telefone = req.body.phone || req.body.telefoneCliente;
    if (telefone) {
      await sendWhatsAppMessage(telefone, "Desculpa, algo correu mal do nosso lado. Tente novamente, por favor.");
    }
    return res.sendStatus(500);
  }
};

//---------------------------------------------------------------------
// 3. Gera horários disponíveis (substituir por lógica real)
//---------------------------------------------------------------------
export const gerarOpcoesHorarios = async () => {
  // Lembre-se: esta função deve ser substituída pela lógica que consulta
  // a disponibilidade real que criámos (a coleção 'schedules').
  console.warn("Aviso: gerarOpcoesHorarios está a usar dados mock.");
  const hoje = new Date();
  const op = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    ["09:00", "14:00", "16:00"].forEach((h) => {
      const [H, M] = h.split(":");
      const dt = new Date(d);
      dt.setHours(+H, +M, 0, 0);
      const dia = DateTime.fromJSDate(dt, { zone: "Europe/Lisbon" }).toFormat("cccc", { locale: "pt" });
      op.push({
        diaSemana: dia,
        data: dt.toISOString().split("T")[0],
        hora: h,
        dataCompleta: dt,
        descricao: `${dia} às ${h}`,
      });
    });
  }
  return op.slice(0, 5);
};


// --- FUNÇÕES INTERNAS (não precisam de "export") ---

/**
 * Delega ao LLM para continuar o fluxo, processando chamadas de ferramenta.
 * Esta função não é exportada, pois é usada apenas por processarRespostaWhatsapp.
 */
async function handleLLM(texto, conversa) {
  console.log("handleLLM: Iniciando processamento.");
  const cliente = await Cliente.findOne({ telefone: conversa.telefone });
  const ctx = { cliente: cliente || null, estado: conversa.estado, dados: conversa.dados };

  try {
    const resposta = await chatWithLaura({ userMsg: texto, ctx });
    console.log("handleLLM: Resposta da LLM:", JSON.stringify(resposta));

    const toolCalls = resposta.tool_calls || [];

    if (toolCalls.length > 0) {
      console.log(`handleLLM: ${toolCalls.length} tool_calls detectadas.`);
      const toolOutputs = [];

      for (const call of toolCalls) {
        const { name, arguments: argsStr } = call.function;
        console.log(`handleLLM: Executando ferramenta: ${name}`);
        const args = JSON.parse(argsStr);
        const toolResult = await dispatch(name, args);
        
        toolOutputs.push({
          tool_call_id: call.id,
          output: JSON.stringify(toolResult)
        });
      }

      // Envia os resultados das ferramentas de volta para a LLM
      const followUpResponse = await chatWithLaura({ toolOutputs, ctx });
      if (followUpResponse.content) {
        await sendWhatsAppMessage(conversa.telefone, followUpResponse.content);
      }
    } else if (resposta.content) {
      await sendWhatsAppMessage(conversa.telefone, resposta.content);
    } else {
      console.warn("handleLLM: Resposta da LLM sem tool_calls e sem conteúdo.");
      await sendWhatsAppMessage(conversa.telefone, "Não entendi bem, pode reformular?");
    }
  } catch (error) {
    console.error("handleLLM: Erro geral no processamento:", error);
    await sendWhatsAppMessage(conversa.telefone, "Desculpa, tive um problema interno. Por favor, tente novamente.");
  }
}