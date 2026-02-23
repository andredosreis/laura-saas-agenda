import { DateTime } from "luxon";
import { sendPushNotification } from "../services/pushService.js";
import UserSubscription from "../models/UserSubscription.js";
import { sendWhatsAppMessage } from "../utils/zapi_client.js";

// Função auxiliar para converter hora string (HH:mm) para minutos desde a meia-noite
const timeToMinutes = (timeString) => {
  if (!timeString) return null;
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
};

// @desc    Criar novo agendamento
export const createAgendamento = async (req, res) => {
  try {
    const { Agendamento, Schedule } = req.models;
    const { cliente, dataHora, pacote, compraPacote, servicoAvulsoNome, servicoAvulsoValor } = req.body;

    const agendamentoDateTime = DateTime.fromISO(dataHora, { zone: "America/Sao_Paulo" });
    if (!agendamentoDateTime.isValid) {
      return res.status(400).json({ message: "Data e hora do agendamento inválidas." });
    }
    if (agendamentoDateTime < DateTime.now().setZone("America/Sao_Paulo")) {
      return res.status(400).json({ message: "Não é possível criar agendamentos com data no passado." });
    }

    const dayOfWeek = agendamentoDateTime.weekday === 7 ? 0 : agendamentoDateTime.weekday;
    const requestedTimeInMinutes = timeToMinutes(agendamentoDateTime.toFormat("HH:mm"));

    const schedule = await Schedule.findOne({ dayOfWeek, tenantId: req.tenantId });

    if (!schedule || !schedule.isActive) {
      return res.status(400).json({ message: `O salão não está ativo para agendamentos na ${schedule?.label || "este dia da semana"}.` });
    }

    const startWorkMinutes = timeToMinutes(schedule.startTime);
    const endWorkMinutes = timeToMinutes(schedule.endTime);

    if (requestedTimeInMinutes < startWorkMinutes || requestedTimeInMinutes >= endWorkMinutes) {
      return res.status(400).json({ message: "Horário de agendamento fora do expediente de trabalho." });
    }

    const breakStartMinutes = timeToMinutes(schedule.breakStartTime);
    const breakEndMinutes = timeToMinutes(schedule.breakEndTime);

    if (breakStartMinutes !== null && breakEndMinutes !== null &&
      requestedTimeInMinutes >= breakStartMinutes && requestedTimeInMinutes < breakEndMinutes) {
      return res.status(400).json({ message: "Horário de agendamento coincide com o período de pausa." });
    }

    const agendamentoDurationMinutes = 60;
    const conflictingAgendamento = await Agendamento.findOne({
      tenantId: req.tenantId,
      dataHora: {
        $gte: agendamentoDateTime.minus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(),
        $lt: agendamentoDateTime.plus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(),
      },
      status: { $in: ["Agendado", "Confirmado"] },
    });

    if (conflictingAgendamento) {
      return res.status(400).json({ message: "Já existe um agendamento para este horário." });
    }

    console.log('[createAgendamento] Dados recebidos:', { cliente, dataHora, pacote, compraPacote, tenantId: req.tenantId });

    const novoAgendamento = new Agendamento({
      cliente,
      dataHora,
      pacote,
      compraPacote,
      servicoAvulsoNome,
      servicoAvulsoValor,
      tenantId: req.tenantId
    });
    await novoAgendamento.save();

    console.log('[createAgendamento] ✅ Agendamento criado:', {
      _id: novoAgendamento._id,
      cliente: novoAgendamento.cliente,
      compraPacote: novoAgendamento.compraPacote,
      status: novoAgendamento.status
    });

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

// @desc    Listar todos os agendamentos (com filtros opcionais)
export const getAllAgendamentos = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const { dataInicio, dataFim, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };

    if (dataInicio && dataFim) {
      query.dataHora = { $gte: new Date(dataInicio), $lte: new Date(dataFim) };
    } else if (dataInicio) {
      query.dataHora = { $gte: new Date(dataInicio) };
    } else if (dataFim) {
      query.dataHora = { $lte: new Date(dataFim) };
    }

    if (status) {
      query.status = status;
    }

    const [agendamentos, total] = await Promise.all([
      Agendamento.find(query)
        .populate("cliente pacote")
        .sort({ dataHora: 1 })
        .skip(skip)
        .limit(limit),
      Agendamento.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: agendamentos,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar agendamentos.", details: error.message });
  }
};

// @desc    Buscar um agendamento por ID
export const getAgendamento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
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
    const { Agendamento } = req.models;
    const agendamento = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true, runValidators: true }
    ).populate("cliente pacote");

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
    const { Agendamento, CompraPacote, Transacao } = req.models;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "O campo status é obrigatório." });
    }

    console.log(`[updateStatusAgendamento] Alterando status para: ${status}`);

    const agendamentoAtual = await Agendamento.findOne(
      { _id: req.params.id, tenantId: req.tenantId }
    );

    if (!agendamentoAtual) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    console.log(`[updateStatusAgendamento] Agendamento encontrado. compraPacote: ${agendamentoAtual.compraPacote}`);

    if (status === 'Realizado' && agendamentoAtual.compraPacote) {
      const compraPacote = await CompraPacote.findOne({ _id: agendamentoAtual.compraPacote, tenantId: req.tenantId }).populate('pacote');

      if (!compraPacote) {
        console.error(`[updateStatusAgendamento] ⚠️ CompraPacote não encontrada: ${agendamentoAtual.compraPacote}`);
        return res.status(404).json({ message: "Pacote comprado não encontrado." });
      }

      console.log(`[updateStatusAgendamento] CompraPacote encontrada. Sessões restantes: ${compraPacote.sessoesRestantes}`);

      try {
        const valorPorSessao = compraPacote.pacote?.valor && compraPacote.pacote?.sessoes
          ? compraPacote.pacote.valor / compraPacote.pacote.sessoes
          : 0;
        await compraPacote.usarSessao(agendamentoAtual._id, valorPorSessao, req.user?._id);
        console.log(`✅ Sessão decrementada do pacote ${compraPacote._id}. Restantes: ${compraPacote.sessoesRestantes - 1}`);

        agendamentoAtual.valorCobrado = valorPorSessao;
        agendamentoAtual.statusPagamento = 'Pago';
        await agendamentoAtual.save();

        console.log(`✅ Sessão registrada sem criar transação (receita já contabilizada na venda do pacote)`);

      } catch (error) {
        console.error('⚠️ Erro ao decrementar sessão:', error.message);
        return res.status(400).json({
          message: "Erro ao decrementar sessão do pacote.",
          details: error.message
        });
      }
    } else if (status === 'Realizado' && !agendamentoAtual.compraPacote && agendamentoAtual.servicoAvulsoValor) {
      console.log(`[updateStatusAgendamento] ⏳ Serviço avulso realizado. Aguardando registro de pagamento pelo frontend.`);
      agendamentoAtual.statusPagamento = 'Pendente';
      await agendamentoAtual.save();
    } else if (status === 'Realizado' && !agendamentoAtual.compraPacote) {
      console.warn(`[updateStatusAgendamento] ⚠️ Agendamento marcado como Realizado mas não tem compraPacote vinculada nem valor avulso`);
    }

    const agendamento = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { status },
      { new: true, runValidators: true }
    ).populate('compraPacote cliente');

    res.status(200).json(agendamento);
  } catch (error) {
    console.error('[updateStatusAgendamento] Erro:', error);
    res.status(500).json({ message: "Erro ao atualizar status.", details: error.message });
  }
};

// @desc    Deletar agendamento
export const deleteAgendamento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
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

// @desc    Confirmar ou rejeitar agendamento
export const confirmarAgendamento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const { confirmacao, respondidoPor } = req.body;

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

    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId }).populate('cliente');
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    agendamento.confirmacao = {
      tipo: confirmacao,
      respondidoEm: new Date(),
      respondidoPor: respondidoPor
    };

    await agendamento.save();

    try {
      if (respondidoPor === 'laura') {
        const subscriptionCliente = await UserSubscription.findOne({
          userId: agendamento.cliente._id.toString(),
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

// @desc    Registrar pagamento de serviço avulso
// @route   POST /api/agendamentos/:id/pagamento
export const registrarPagamentoServico = async (req, res) => {
  try {
    const { Agendamento, Transacao, Pagamento } = req.models;
    const {
      valor,
      formaPagamento,
      dadosMBWay,
      dadosMultibanco,
      dadosCartao,
      dadosTransferencia,
      observacoes
    } = req.body;

    if (!valor || valor <= 0) {
      return res.status(400).json({ message: 'Valor do pagamento deve ser maior que zero' });
    }

    if (!formaPagamento) {
      return res.status(400).json({ message: 'Forma de pagamento é obrigatória' });
    }

    const agendamento = await Agendamento.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    if (agendamento.compraPacote) {
      return res.status(400).json({
        message: 'Este agendamento é de um pacote. Pagamento já foi registrado na compra do pacote.'
      });
    }

    if (!agendamento.servicoAvulsoValor) {
      return res.status(400).json({
        message: 'Este agendamento não possui valor de serviço avulso definido.'
      });
    }

    const transacao = await Transacao.create({
      tenantId: req.tenantId,
      tipo: 'Receita',
      categoria: 'Serviço Avulso',
      agendamento: agendamento._id,
      cliente: agendamento.cliente,
      profissional: req.user?._id,
      valor: agendamento.servicoAvulsoValor,
      desconto: 0,
      valorFinal: valor,
      statusPagamento: valor >= agendamento.servicoAvulsoValor ? 'Pago' : 'Parcial',
      formaPagamento: null,
      dataPagamento: new Date(),
      descricao: agendamento.servicoAvulsoNome || 'Serviço avulso',
      observacoes: observacoes || `Serviço realizado em ${new Date(agendamento.dataHora).toLocaleDateString('pt-PT')}`
    });

    const pagamento = await Pagamento.create({
      tenantId: req.tenantId,
      transacao: transacao._id,
      valor,
      formaPagamento,
      dataPagamento: new Date(),
      dadosMBWay: dadosMBWay || {},
      dadosMultibanco: dadosMultibanco || {},
      dadosCartao: dadosCartao || {},
      dadosTransferencia: dadosTransferencia || {},
      observacoes: observacoes || ''
    });

    transacao.formaPagamento = formaPagamento;
    await transacao.save();

    agendamento.transacao = transacao._id;
    agendamento.statusPagamento = transacao.statusPagamento;
    await agendamento.save();

    await transacao.populate([
      { path: 'cliente', select: 'nome telefone' },
      { path: 'profissional', select: 'nome' }
    ]);

    console.log(`✅ Pagamento de serviço avulso registrado: Transação ${transacao._id}, Pagamento ${pagamento._id}`);

    res.status(201).json({
      success: true,
      message: 'Pagamento registrado com sucesso',
      transacao,
      pagamento,
      agendamento
    });

  } catch (error) {
    console.error('Erro ao registrar pagamento de serviço:', error);
    res.status(500).json({
      message: 'Erro ao registrar pagamento',
      details: error.message
    });
  }
};

// @desc    Enviar lembrete manual via WhatsApp
export const enviarLembreteManual = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    console.log('[Agendamento] 📱 Enviando lembrete manual via WhatsApp...');

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

    const dataAgendamento = DateTime.fromJSDate(new Date(agendamento.dataHora));
    const dataFormatada = dataAgendamento.toFormat('dd/MM/yyyy');
    const horaFormatada = dataAgendamento.toFormat('HH:mm');

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

// @desc    Buscar histórico de atendimentos
// @route   GET /api/agendamentos/historico
export const getHistorico = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const { dataInicio, dataFim, status, cliente, page = 1, limit = 50 } = req.query;

    const filtro = {
      tenantId: req.tenantId,
      status: { $in: ['Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu'] }
    };

    if (dataInicio || dataFim) {
      filtro.dataHora = {};
      if (dataInicio) filtro.dataHora.$gte = new Date(dataInicio);
      if (dataFim) filtro.dataHora.$lte = new Date(dataFim);
    }

    if (status) filtro.status = status;
    if (cliente) filtro.cliente = cliente;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const agendamentos = await Agendamento.find(filtro)
      .populate('cliente', 'nome telefone email')
      .populate('compraPacote')
      .populate('transacao')
      .populate('profissional', 'nome')
      .sort({ dataHora: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Agendamento.countDocuments(filtro);

    res.status(200).json({
      success: true,
      data: agendamentos,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('[Agendamento] ❌ Erro ao buscar histórico:', error);
    res.status(500).json({
      message: "Erro ao buscar histórico de atendimentos.",
      details: error.message
    });
  }
};

// @desc    Buscar estatísticas do mês
// @route   GET /api/agendamentos/stats/mes
export const getStatsMes = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const { mes, ano } = req.query;

    const now = DateTime.now();
    const mesAtual = mes ? parseInt(mes) : now.month;
    const anoAtual = ano ? parseInt(ano) : now.year;

    const dataInicio = DateTime.fromObject({ year: anoAtual, month: mesAtual, day: 1 }).startOf('day').toJSDate();
    const dataFim = DateTime.fromObject({ year: anoAtual, month: mesAtual }).endOf('month').toJSDate();

    const agendamentos = await Agendamento.find({
      tenantId: req.tenantId,
      dataHora: { $gte: dataInicio, $lte: dataFim }
    }).populate('compraPacote');

    const totalAgendamentos = agendamentos.length;
    const totalRealizados = agendamentos.filter(a => a.status === 'Realizado').length;
    const totalCancelados = agendamentos.filter(a =>
      a.status === 'Cancelado Pelo Cliente' || a.status === 'Cancelado Pelo Salão'
    ).length;
    const totalNaoCompareceu = agendamentos.filter(a => a.status === 'Não Compareceu').length;
    const totalPendentes = agendamentos.filter(a =>
      a.status === 'Agendado' || a.status === 'Confirmado'
    ).length;

    const receitaTotal = agendamentos
      .filter(a => a.status === 'Realizado')
      .reduce((acc, a) => {
        if (a.valorCobrado) {
          return acc + a.valorCobrado;
        } else if (a.servicoAvulsoValor) {
          return acc + a.servicoAvulsoValor;
        } else if (a.compraPacote?.pacote?.valor && a.compraPacote?.pacote?.sessoes) {
          return acc + (a.compraPacote.pacote.valor / a.compraPacote.pacote.sessoes);
        }
        return acc;
      }, 0);

    const taxaSucesso = totalAgendamentos > 0
      ? ((totalRealizados / totalAgendamentos) * 100).toFixed(1)
      : 0;

    const taxaNaoComparecimento = totalAgendamentos > 0
      ? ((totalNaoCompareceu / totalAgendamentos) * 100).toFixed(1)
      : 0;

    res.status(200).json({
      success: true,
      periodo: { mes: mesAtual, ano: anoAtual, dataInicio, dataFim },
      estatisticas: {
        totalAgendamentos,
        totalRealizados,
        totalCancelados,
        totalNaoCompareceu,
        totalPendentes,
        receitaTotal: parseFloat(receitaTotal.toFixed(2)),
        taxaSucesso: parseFloat(taxaSucesso),
        taxaNaoComparecimento: parseFloat(taxaNaoComparecimento)
      }
    });

  } catch (error) {
    console.error('[Agendamento] ❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({
      message: "Erro ao buscar estatísticas.",
      details: error.message
    });
  }
};
