import Agendamento from "../models/Agendamento.js";
import Schedule from "../models/Schedule.js"; // Importar o modelo Schedule
import { DateTime } from "luxon"; // Importar Luxon para manipulação de datas
import { sendPushNotification } from "../services/pushService.js";
import UserSubscription from "../models/UserSubscription.js";
import { sendWhatsAppMessage } from "../utils/zapi_client.js"; // ✨ ADICIONAR Z-API


// Função auxiliar para converter hora string (HH:mm) para minutos desde a meia-noite
const timeToMinutes = (timeString) => {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

// @desc    Criar novo agendamento
export const createAgendamento = async (req, res) => {
  try {
    const { cliente, dataHora, pacote, servicoAvulsoNome, servicoAvulsoValor } = req.body;

    // 1. Validar se a dataHora é um formato válido e não está no passado (já existe no middleware do modelo, mas reforçar aqui)
    const agendamentoDateTime = DateTime.fromISO(dataHora, { zone: "America/Sao_Paulo" }); // Usar fuso horário adequado
    if (!agendamentoDateTime.isValid) {
      return res.status(400).json({ message: "Data e hora do agendamento inválidas." });
    }
    if (agendamentoDateTime < DateTime.now().setZone("America/Sao_Paulo")) {
      return res.status(400).json({ message: "Não é possível criar agendamentos com data no passado." });
    }

    // 2. Obter o dia da semana e o horário do agendamento
    const dayOfWeek = agendamentoDateTime.weekday === 7 ? 0 : agendamentoDateTime.weekday; // Luxon: 1=Seg, ..., 7=Dom. Mongoose: 0=Dom, ..., 6=Sab
    const requestedTimeInMinutes = timeToMinutes(agendamentoDateTime.toFormat("HH:mm"));

    // 3. Buscar a disponibilidade para o dia da semana
    // 🆕 Filtrar pelo tenant
    const schedule = await Schedule.findOne({ dayOfWeek, tenantId: req.tenantId });

    if (!schedule || !schedule.isActive) {
      return res.status(400).json({ message: `O salão não está ativo para agendamentos na ${schedule?.label || "este dia da semana"}.` });
    }

    // 4. Verificar se o horário está dentro do período de trabalho
    const startWorkMinutes = timeToMinutes(schedule.startTime);
    const endWorkMinutes = timeToMinutes(schedule.endTime);

    if (requestedTimeInMinutes < startWorkMinutes || requestedTimeInMinutes >= endWorkMinutes) {
      return res.status(400).json({ message: "Horário de agendamento fora do expediente de trabalho." });
    }

    // 5. Verificar se o horário não está dentro do período de pausa
    const breakStartMinutes = timeToMinutes(schedule.breakStartTime);
    const breakEndMinutes = timeToMinutes(schedule.breakEndTime);

    if (breakStartMinutes !== null && breakEndMinutes !== null &&
      requestedTimeInMinutes >= breakStartMinutes && requestedTimeInMinutes < breakEndMinutes) {
      return res.status(400).json({ message: "Horário de agendamento coincide com o período de pausa." });
    }

    // 6. Verificar conflito com agendamentos existentes
    const agendamentoDurationMinutes = 60; // Assumindo duração padrão de 1 hora. Ajuste conforme a lógica de pacotes/serviços.
    const requestedEndTimeInMinutes = requestedTimeInMinutes + agendamentoDurationMinutes;

    const conflictingAgendamento = await Agendamento.findOne({
      tenantId: req.tenantId, // 🆕 Filtrar conflitos apenas deste tenant
      dataHora: {
        $gte: agendamentoDateTime.minus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(), // Início do slot anterior
        $lt: agendamentoDateTime.plus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(), // Fim do slot posterior
      },
      status: { $in: ["Agendado", "Confirmado"] },
    });

    if (conflictingAgendamento) {
      return res.status(400).json({ message: "Já existe um agendamento para este horário." });
    }

    // Se todas as validações passarem, criar o agendamento
    // 🆕 Injectar tenantId
    const novoAgendamento = new Agendamento({
      cliente,
      dataHora,
      pacote,
      servicoAvulsoNome,
      servicoAvulsoValor,
      tenantId: req.tenantId
    });
    await novoAgendamento.save();
    res.status(201).json(novoAgendamento);
  } catch (error) {
    console.error("Erro ao criar agendamento:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: "Dados inválidos.", details: messages });
    }
    res.status(500).json({ message: "Erro interno ao criar agendamento." });
  }
};

// @desc    Listar todos os agendamentos
export const getAllAgendamentos = async (req, res) => {
  try {
    // 🆕 Listar apenas do tenant
    const agendamentos = await Agendamento.find({ tenantId: req.tenantId }).populate("cliente pacote");
    res.status(200).json(agendamentos);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar agendamentos.", details: error.message });
  }
};

// @desc    Buscar um agendamento por ID
export const getAgendamento = async (req, res) => {
  try {
    // 🆕 Buscar apenas se pertencer ao tenant
    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate("cliente pacote");
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "ID do agendamento inválido." });
    }
    res.status(500).json({ message: "Erro ao buscar agendamento.", details: error.message });
  }
};

// @desc    Atualizar agendamento completo
export const updateAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: "Dados inválidos.", details: messages });
    }
    res.status(500).json({ message: "Erro ao atualizar agendamento.", details: error.message });
  }
};

// @desc    Atualizar status do agendamento
export const updateStatusAgendamento = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "O campo status é obrigatório." });
    }
    // 🆕 Update seguro com tenantId
    const agendamento = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { status },
      { new: true, runValidators: true }
    );
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    res.status(500).json({ message: "Erro ao atualizar status.", details: error.message });
  }
};

// @desc    Deletar agendamento
export const deleteAgendamento = async (req, res) => {
  try {
    // 🆕 Delete seguro com tenantId
    const agendamento = await Agendamento.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }
    res.status(200).json({ message: "Agendamento deletado com sucesso." });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ message: "ID do agendamento inválido." });
    }
    res.status(500).json({ message: "Erro ao deletar agendamento.", details: error.message });
  }
};




// @desc    Confirmar ou rejeitar agendamento (NOVO)
export const confirmarAgendamento = async (req, res) => {
  try {
    const { confirmacao, respondidoPor } = req.body;

    // Validar input
    if (!confirmacao || !['confirmado', 'rejeitado'].includes(confirmacao)) {
      return res.status(400).json({
        message: "Campo 'confirmacao' deve ser 'confirmado' ou 'rejeitado'."
      });
    }

    if (!respondidoPor || !['laura', 'cliente'].includes(respondidoPor)) {
      return res.status(400).json({
        message: "Campo 'respondidoPor' deve ser 'laura' ou 'cliente'."
      });
    }


    // Buscar agendamento (seguro)
    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate('cliente');
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    // Atualizar confirmação
    agendamento.confirmacao = {
      tipo: confirmacao,
      respondidoEm: new Date(),
      respondidoPor: respondidoPor
    };

    await agendamento.save();

    // 🔔 Notificar o outro lado (se Laura confirmou, notificar cliente e vice-versa)
    try {
      if (respondidoPor === 'laura') {
        // Laura confirmou/rejeitou, notificar CLIENTE
        const subscriptionCliente = await UserSubscription.findOne({
          userId: agendamento.cliente._id.toString(), // Converte ObjectId para String
          active: true,
        });

        if (subscriptionCliente) {
          const payloadCliente = {
            title: confirmacao === 'confirmado' ? '✅ Agendamento Confirmado' : '❌ Agendamento Rejeitado',
            body: confirmacao === 'confirmado'
              ? `Seu agendamento foi confirmado!`
              : `Seu agendamento foi rejeitado. Agende um novo horário.`,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            tag: `confirmacao-${agendamento._id}`,
            requireInteraction: true,
            data: {
              agendamentoId: agendamento._id.toString(),
              confirmacao: confirmacao,
              respondidoEm: agendamento.confirmacao.respondidoEm,
              tipo: 'confirmacao-resposta',
            },
          };

          await sendPushNotification(subscriptionCliente, payloadCliente);
        }
      }
    } catch (notifError) {
      console.error('[AgenteController] ⚠️ Erro ao enviar notificação:', notifError);
      // Não falhar a requisição se notificação falhar
    }

    res.status(200).json({
      success: true,
      message: `Agendamento ${confirmacao} com sucesso.`,
      agendamento
    });

  } catch (error) {
    console.error('Erro ao confirmar agendamento:', error);
    res.status(500).json({
      message: "Erro ao confirmar agendamento.",
      details: error.message
    });
  }
};


// @desc    Enviar lembrete manual via WhatsApp (MODIFICADO)
export const enviarLembreteManual = async (req, res) => {
  try {
    console.log('[Agendamento] 📱 Enviando lembrete manual via WhatsApp...');


    // Buscar agendamento com populate de cliente (seguro)
    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate('cliente');

    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    if (!agendamento.cliente) {
      return res.status(400).json({ message: "Agendamento sem cliente associado." });
    }

    const telefone = agendamento.cliente.telefone;
    if (!telefone) {
      return res.status(400).json({
        message: "Cliente não possui telefone cadastrado.",
        hint: "Cadastre o telefone do cliente para enviar lembretes."
      });
    }

    // Formatar data do agendamento
    const dataAgendamento = DateTime.fromJSDate(new Date(agendamento.dataHora));
    const dataFormatada = dataAgendamento.toFormat('dd/MM/yyyy');
    const horaFormatada = dataAgendamento.toFormat('HH:mm');

    // Preparar mensagem WhatsApp
    const mensagem = `🔔 *Lembrete de Agendamento*

Olá ${agendamento.cliente.nome}!

Você tem um agendamento marcado:
📅 Data: ${dataFormatada}
🕐 Horário: ${horaFormatada}

Por favor, confirme sua presença respondendo:
✅ *SIM* - para confirmar
❌ *NÃO* - para cancelar

Aguardamos por ti! 💆‍♀️✨

_La Estética Avançada_`;

    // Enviar via WhatsApp (Z-API)
    const resultado = await sendWhatsAppMessage(telefone, mensagem);

    if (resultado.success) {
      console.log(`[Agendamento] ✅ Lembrete WhatsApp enviado para ${agendamento.cliente.nome} (${telefone})`);
      return res.status(200).json({
        success: true,
        message: `Lembrete enviado via WhatsApp para ${agendamento.cliente.nome}`,
        cliente: {
          nome: agendamento.cliente.nome,
          telefone: agendamento.cliente.telefone,
        },
        agendamento: {
          id: agendamento._id,
          dataHora: agendamento.dataHora,
        },
      });
    } else {
      console.warn(`[Agendamento] ⚠️ Falha ao enviar WhatsApp para ${agendamento.cliente.nome}`);
      return res.status(500).json({
        success: false,
        message: "Falha ao enviar mensagem WhatsApp.",
        details: resultado.error,
      });
    }

  } catch (error) {
    console.error('[Agendamento] ❌ Erro ao enviar lembrete manual:', error);
    res.status(500).json({
      message: "Erro ao enviar lembrete.",
      details: error.message
    });
  }
};