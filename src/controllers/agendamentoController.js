import Agendamento from "../models/Agendamento.js";
import Schedule from "../models/Schedule.js"; // Importar o modelo Schedule
import { DateTime } from "luxon"; // Importar Luxon para manipulação de datas
import { sendPushNotification } from "../services/pushService.js";
import UserSubscription from "../models/UserSubscription.js";


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
    const schedule = await Schedule.findOne({ dayOfWeek });

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
    const novoAgendamento = new Agendamento({ cliente, dataHora, pacote, servicoAvulsoNome, servicoAvulsoValor });
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
    const agendamentos = await Agendamento.find().populate("cliente pacote");
    res.status(200).json(agendamentos);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar agendamentos.", details: error.message });
  }
};

// @desc    Buscar um agendamento por ID
export const getAgendamento = async (req, res) => {
  try {
    const agendamento = await Agendamento.findById(req.params.id).populate("cliente pacote");
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
    const agendamento = await Agendamento.findByIdAndUpdate(
      req.params.id,
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
    const agendamento = await Agendamento.findByIdAndDelete(req.params.id);
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

    // Buscar agendamento
    const agendamento = await Agendamento.findById(req.params.id).populate('cliente');
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


// @desc    Enviar lembrete manual para cliente (NOVO)
export const enviarLembreteManual = async (req, res) => {
  try {
    console.log('[Agendamento] 📱 Enviando lembrete manual...');

    // Buscar agendamento com populate de cliente
    const agendamento = await Agendamento.findById(req.params.id).populate('cliente');

    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    const clienteId = agendamento.cliente?._id;
    if (!clienteId) {
      return res.status(400).json({ message: "Agendamento sem cliente associado." });
    }

    // 🔄 MODIFICAÇÃO TEMPORÁRIA PARA TESTES:
    // Tenta buscar subscription do cliente, se não encontrar, usa qualquer subscription ativa (Laura)
    let subscriptionCliente = await UserSubscription.findOne({
      userId: clienteId.toString(), // Converte ObjectId para String
      active: true,
    });

    // Se cliente não tem subscription, busca Laura ou qualquer subscription ativa
    if (!subscriptionCliente) {
      console.log('[Agendamento] ⚠️ Cliente sem subscription, buscando Laura...');
      subscriptionCliente = await UserSubscription.findOne({
        userId: 'LAURA',
        active: true,
      });

      // Se Laura também não tem, busca qualquer subscription ativa (para testes)
      if (!subscriptionCliente) {
        console.log('[Agendamento] ⚠️ Laura sem subscription, buscando qualquer subscription ativa...');
        subscriptionCliente = await UserSubscription.findOne({ active: true });
      }
    }

    if (!subscriptionCliente) {
      return res.status(404).json({
        message: "Nenhuma notificação ativa encontrada.",
        hint: "Ative notificações no app para receber lembretes."
      });
    }

    // Formatar data do agendamento
    const dataAgendamento = DateTime.fromJSDate(new Date(agendamento.dataHora));
    const dataFormatada = dataAgendamento.toFormat('dd/MM/yyyy');
    const horaFormatada = dataAgendamento.toFormat('HH:mm');

    // Preparar payload da notificação
    const payload = {
      title: '🔔 Lembrete de Agendamento',
      body: `Olá ${agendamento.cliente.nome}! Lembrete do seu agendamento em ${dataFormatada} às ${horaFormatada}.`,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: `lembrete-manual-${agendamento._id}-${Date.now()}`,
      requireInteraction: true,
      data: {
        agendamentoId: agendamento._id.toString(),
        clienteNome: agendamento.cliente.nome,
        dataHora: agendamento.dataHora,
        tipo: 'lembrete-manual',
      },
    };

    // Enviar notificação
    const enviado = await sendPushNotification(subscriptionCliente, payload);

    if (enviado) {
      console.log(`[Agendamento] ✅ Lembrete manual enviado para ${agendamento.cliente.nome}`);
      return res.status(200).json({
        success: true,
        message: `Lembrete enviado para ${agendamento.cliente.nome}`,
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
      console.warn(`[Agendamento] ⚠️ Falha ao enviar lembrete para ${agendamento.cliente.nome}`);
      return res.status(500).json({
        success: false,
        message: "Falha ao enviar notificação. A subscription pode estar expirada.",
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