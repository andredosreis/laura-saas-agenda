import UserSubscription from '../../models/UserSubscription.js';
import { sendPushNotification } from '../../services/pushService.js';
import { DateTime } from "luxon";
import Agendamento from "../../models/Agendamento.js";
import Cliente from "../../models/Cliente.js";
import Conversa from "../../models/Conversa.js";
import Pacote from "../../models/Pacote.js";
import Mensagem from "../../models/Mensagem.js";
import { chatWithLaura } from "./openaiHelper.js";
import { dispatch } from "./functionDispatcher.js";
import { sendWhatsAppMessage } from "../../utils/evolutionClient.js";
import { detectarPalavraChave } from "../../utils/notificacaoHelper.js";

console.log("CONTROLLER: agenteController.js carregado (v2)");


/**
 * 🔔 Função de Lembrete Híbrida: WhatsApp + Web Push
 * Chamada pelo CRON todos os dias às 19h
 * MODIFICADO: WhatsApp para CLIENTE + Web Push para LAURA
 */
export const sendReminderNotifications = async (req, res) => {
  try {
    console.log('[Agente] 🔔 Iniciando envio de lembretes (WhatsApp + Web Push)...');

    // 1️⃣ Obter data de amanhã
    const amanha = DateTime.now()
      .plus({ days: 1 })
      .startOf('day');

    console.log(`[Agente] 📅 Procurando agendamentos para: ${amanha.toISODate()}`);

    // 2️⃣ Buscar agendamentos para AMANHÃ
    const agendamentosDiarios = await Agendamento.find({
      dataHora: {
        $gte: amanha.toJSDate(),
        $lt: amanha.plus({ days: 1 }).toJSDate(),
      },
      status: { $in: ['Agendado', 'Confirmado'] },
    }).populate('cliente');

    console.log(`[Agente] 📋 Encontrados ${agendamentosDiarios.length} agendamentos`);

    if (agendamentosDiarios.length === 0) {
      console.log('[Agente] ℹ️ Nenhum agendamento para amanhã');
      return {
        success: true,
        message: 'Nenhum agendamento para amanhã',
        sent: 0,
        failed: 0,
      };
    }

    // 3️⃣ Para cada agendamento, enviar WhatsApp para CLIENTE + Web Push para LAURA
    let notificacoesEnviadas = 0;
    let notificacoesFalhadas = 0;

    for (const agendamento of agendamentosDiarios) {
      try {
        const clienteId = agendamento.cliente?._id;
        const telefone = agendamento.cliente?.telefone;

        if (!clienteId) {
          console.warn(`[Agente] ⚠️ Agendamento ${agendamento._id} sem cliente`);
          notificacoesFalhadas++;
          continue;
        }

        const dataAgendamento = DateTime.fromJSDate(new Date(agendamento.dataHora));
        const dataFormatada = dataAgendamento.toFormat('dd/MM/yyyy');
        const horaFormatada = dataAgendamento.toFormat('HH:mm');

        // 4️⃣ WHATSAPP PARA CLIENTE
        if (telefone) {
          const mensagemWhatsApp = `🔔 *Lembrete de Agendamento*

Olá ${agendamento.cliente.nome}!

Você tem um agendamento marcado para *AMANHÃ*:
📅 Data: ${dataFormatada}
🕐 Horário: ${horaFormatada}

Por favor, confirme sua presença respondendo:
✅ *SIM* - para confirmar
❌ *NÃO* - para cancelar

Aguardamos você! 💆‍♀️✨

_La Estética Avançada_`;

          const resultadoWhatsApp = await sendWhatsAppMessage(telefone, mensagemWhatsApp);

          if (resultadoWhatsApp.success) {
            notificacoesEnviadas++;
            console.log(`[Agente] ✅ WhatsApp enviado para ${agendamento.cliente.nome} (${telefone})`);
          } else {
            notificacoesFalhadas++;
            console.warn(`[Agente] ⚠️ Falha ao enviar WhatsApp para ${agendamento.cliente.nome}`);
          }
        } else {
          console.log(`[Agente] 📵 Cliente ${agendamento.cliente.nome} sem telefone cadastrado`);
          notificacoesFalhadas++;
        }

        // 5️⃣ WEB PUSH PARA LAURA
        const subscriptionLaura = await UserSubscription.findOne({
          userId: 'LAURA',
          active: true,
        });

        if (subscriptionLaura) {
          const payloadLaura = {
            title: '📋 Novo Agendamento Pendente',
            body: `${agendamento.cliente.nome} - Amanhã às ${horaFormatada}`,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            tag: `laura-reminder-${agendamento._id}`,
            requireInteraction: true,
            data: {
              agendamentoId: agendamento._id.toString(),
              clienteNome: agendamento.cliente.nome,
              clienteId: clienteId.toString(),
              servicoNome: agendamento.pacote?.nome || agendamento.servicoAvulsoNome,
              dataHora: agendamento.dataHora,
              tipo: 'novo-agendamento-pendente',
            },
          };

          const enviado = await sendPushNotification(subscriptionLaura, payloadLaura);
          if (enviado) {
            notificacoesEnviadas++;
            console.log(`[Agente] ✅ Web Push enviado para Laura sobre ${agendamento.cliente.nome}`);
          } else {
            console.warn(`[Agente] ⚠️ Falha ao enviar Web Push para Laura`);
            notificacoesFalhadas++;
          }
        } else {
          console.log('[Agente] 📵 Laura sem subscription ativa (Web Push)');
        }
      } catch (error) {
        console.error(`[Agente] ❌ Erro ao processar agendamento:`, error);
        notificacoesFalhadas += 2;
      }
    }

    const resultado = {
      success: true,
      message: 'Lembretes enviados',
      total: agendamentosDiarios.length,
      sent: notificacoesEnviadas,
      failed: notificacoesFalhadas,
    };

    console.log('[Agente] 📊 Resultado:', resultado);

    return resultado;
  } catch (error) {
    console.error('[Agente] ❌ Erro ao enviar lembretes:', error);
    return {
      success: false,
      message: 'Erro ao enviar lembretes',
      error: error.message,
    };
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