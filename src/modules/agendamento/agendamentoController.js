import { DateTime } from "luxon";
import { sendPushNotification } from "../../services/pushService.js";
import UserSubscription from "../../models/UserSubscription.js";
import { sendWhatsAppMessage } from "../../utils/evolutionClient.js";
import { scheduleNotifications } from "../../utils/scheduleNotifications.js";
import { formatarDataLembrete } from "../../utils/lembreteFormat.js";
import { scopeAgendamentoQuery } from "./agendamentoScope.js";
import Tenant from "../../models/Tenant.js";
// F05 (ADR-028 Fase 4) — regra ÚNICA de disponibilidade (F03): o mesmo cálculo
// que a IA lê e que o slot-picker (F04) mostra. Import cross-módulo aceite
// enquanto o subsistema Schedule não é migrado (D9).
import { resolveAvailableSlots } from "../../controllers/scheduleController.js";

const ZONA = 'Europe/Lisbon';
const STATUS_CANCELADO_CLIENTE = 'Cancelado Pelo Cliente';
const STATUS_CANCELADO_SALAO = 'Cancelado Pelo Salão';

const nowLisbonDate = () => DateTime.now().setZone(ZONA).toJSDate();

const formatServicoNomeLembrete = (servicoTipo, servicoNome) => {
  const nome = typeof servicoNome === 'string' ? servicoNome.trim() : servicoNome;
  if (!nome) return null;
  return servicoTipo === 'oferta' ? `${nome} (oferta sem cobrança)` : nome;
};

const getStatusForConfirmacao = (confirmacao, respondidoPor) => {
  if (confirmacao === 'confirmado') return 'Confirmado';
  return respondidoPor === 'cliente' ? STATUS_CANCELADO_CLIENTE : STATUS_CANCELADO_SALAO;
};

const getConfirmacaoPatchForStatus = (status, respondidoPor = 'laura') => {
  if (status === 'Confirmado') {
    return {
      'confirmacao.tipo': 'confirmado',
      'confirmacao.respondidoEm': nowLisbonDate(),
      'confirmacao.respondidoPor': respondidoPor,
    };
  }

  if (status === STATUS_CANCELADO_CLIENTE || status === STATUS_CANCELADO_SALAO) {
    return {
      'confirmacao.tipo': 'rejeitado',
      'confirmacao.respondidoEm': nowLisbonDate(),
      'confirmacao.respondidoPor': respondidoPor,
    };
  }

  if (status === 'Agendado') {
    return {
      'confirmacao.tipo': 'pendente',
      'confirmacao.respondidoEm': null,
      'confirmacao.respondidoPor': null,
    };
  }

  return {};
};

// @desc    Criar novo agendamento
export const createAgendamento = async (req, res) => {
  try {
    const { Agendamento, Schedule, ScheduleException } = req.models;
    const {
      tipo = 'Sessao',
      cliente,
      lead,
      dataHora,
      pacote,
      compraPacote,
      servicoTipo,
      servicoAvulsoNome,
      servicoAvulsoValor,
      profissional,
      observacoes,
      forcarEncaixe = false,
      motivoEncaixe,
    } = req.body;

    // Validação contextual que não dá para expressar no Zod sem discriminated union mais complexa
    if (tipo === 'Avaliacao') {
      if (!lead?.nome || !lead?.telefone) {
        return res.status(400).json({ success: false, error: 'Avaliação requer lead.nome e lead.telefone' });
      }
    } else if (!cliente) {
      return res.status(400).json({ success: false, error: 'cliente é obrigatório para agendamentos do tipo Sessao ou Retorno' });
    }

    const agendamentoDateTime = DateTime.fromISO(dataHora, { zone: ZONA });
    if (!agendamentoDateTime.isValid) {
      return res.status(400).json({ message: "Data e hora do agendamento inválidas." });
    }
    if (agendamentoDateTime < DateTime.now().setZone(ZONA)) {
      return res.status(400).json({ message: "Não é possível criar agendamentos com data no passado." });
    }

    const tenantDoc = await Tenant.findById(req.tenantId)
      .select('configuracoes.intervaloEntreSessoes configuracoes.duracaoSessaoPadrao')
      .lean();
    const intervaloEntreSessoes = tenantDoc?.configuracoes?.intervaloEntreSessoes || 0;
    const duracaoSessaoPadrao = tenantDoc?.configuracoes?.duracaoSessaoPadrao || 60;
    const agendamentoDurationMinutes = 60 + intervaloEntreSessoes;
    const conflictWindow = {
      $gte: agendamentoDateTime.minus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(),
      $lt: agendamentoDateTime.plus({ minutes: agendamentoDurationMinutes - 1 }).toJSDate(),
    };

    // Auto-heal de slots antigos: se um documento foi cancelado/rejeitado antes
    // de `ocupaSlot` ser sincronizado, liberta a reserva antes de validar conflito.
    await Agendamento.updateMany(
      {
        tenantId: req.tenantId,
        dataHora: conflictWindow,
        ocupaSlot: true,
        $or: [
          { status: { $in: [STATUS_CANCELADO_CLIENTE, STATUS_CANCELADO_SALAO] } },
          { 'confirmacao.tipo': 'rejeitado' },
        ],
      },
      { $set: { ocupaSlot: false } }
    );

    const conflictingAgendamento = await Agendamento.findOne({
      tenantId: req.tenantId,
      dataHora: conflictWindow,
      $or: [
        { ocupaSlot: true },
        {
          status: { $nin: [STATUS_CANCELADO_CLIENTE, STATUS_CANCELADO_SALAO] },
          'confirmacao.tipo': { $ne: 'rejeitado' },
        },
      ],
    });

    if (conflictingAgendamento) {
      return res.status(400).json({ message: "Já existe um agendamento para este horário." });
    }

    // F05 (ADR-028 Fase 4) — enforcement de disponibilidade, reactivado.
    // A regra é a MESMA fonte única que a IA lê (F03) e o slot-picker mostra
    // (F04): resolveAvailableSlots = horário base + precedência de excepções
    // (F02) + pausa − reservas. Corre DEPOIS do check de conflito para
    // preservar a mensagem legada "Já existe um agendamento..." em slots
    // ocupados (e o 409 slot_taken na corrida). Permissivo quando o tenant
    // ainda não tem NENHUM dia activo (D4 — rollout não-destrutivo; os docs
    // inactivos default do initializeSchedules não contam como configuração).
    // Um admin pode forçar um encaixe fora de horas com `forcarEncaixe: true`
    // — registado no sub-doc `encaixe`.
    let encaixeRecord = null; // preenchido apenas num override válido de admin
    const tenantHasSchedule = await Schedule.exists({ tenantId: req.tenantId, isActive: true });
    if (tenantHasSchedule) {
      const { slots, isException, exceptionType } = await resolveAvailableSlots({
        Schedule,
        ScheduleException,
        Agendamento,
        tenantId: req.tenantId,
        date: agendamentoDateTime.toFormat('yyyy-MM-dd'),
        // Fase A — sessão e arrumação passam SEPARADOS: duration é só a sessão
        // (o slot cabe se a sessão couber na janela; a arrumação pode morrer no
        // fecho) e interval é a arrumação. Passar a soma como duration rejeitaria
        // o último slot do dia que o picker mostra.
        duration: 60,
        interval: intervaloEntreSessoes,
      });

      if (!slots.includes(agendamentoDateTime.toFormat('HH:mm'))) {
        const motivoIndisponivel = isException && exceptionType === 'fechado'
          ? 'O salão está fechado nesta data.'
          : 'Horário fora da disponibilidade configurada.';

        if (forcarEncaixe !== true) {
          return res.status(400).json({ message: motivoIndisponivel });
        }
        const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';
        if (!isAdmin) {
          return res.status(403).json({ message: 'Apenas um admin pode forçar um encaixe fora de horas.' });
        }
        encaixeRecord = {
          forcado: true,
          motivo: motivoEncaixe ?? null,
          autorizadoPor: req.user.userId ?? null, // do JWT, nunca do body
          autorizadoEm: nowLisbonDate(),
        };
      }
    }

    const servicoTipoFinal = servicoTipo || (servicoAvulsoNome ? 'avulso' : 'pacote');
    const servicoAvulsoNomeFinal = typeof servicoAvulsoNome === 'string'
      ? servicoAvulsoNome.trim()
      : servicoAvulsoNome;
    let pacoteFinal = pacote;
    let compraPacoteFinal = compraPacote;
    let servicoAvulsoValorFinal = servicoAvulsoValor;
    let statusPagamentoInicial;
    let valorCobradoInicial;

    if (servicoTipoFinal === 'oferta') {
      if (!servicoAvulsoNomeFinal) {
        return res.status(400).json({ message: 'Informe o serviço ofertado.' });
      }
      pacoteFinal = undefined;
      compraPacoteFinal = undefined;
      servicoAvulsoValorFinal = 0;
      statusPagamentoInicial = 'Isento';
      valorCobradoInicial = 0;
    } else if (servicoTipoFinal === 'avulso') {
      if (!servicoAvulsoNomeFinal) {
        return res.status(400).json({ message: 'Informe o nome do serviço avulso.' });
      }
      pacoteFinal = undefined;
      compraPacoteFinal = undefined;
      servicoAvulsoValorFinal = servicoAvulsoValorFinal ?? 0;
    }

    const novoAgendamento = new Agendamento({
      tipo,
      cliente: tipo === 'Avaliacao' ? undefined : cliente,
      lead: tipo === 'Avaliacao' ? { nome: lead.nome, telefone: lead.telefone, email: lead.email } : undefined,
      dataHora: agendamentoDateTime.toJSDate(),
      pacote: pacoteFinal,
      compraPacote: compraPacoteFinal,
      servicoTipo: servicoTipoFinal,
      servicoAvulsoNome: servicoAvulsoNomeFinal,
      servicoAvulsoValor: servicoAvulsoValorFinal,
      statusPagamento: statusPagamentoInicial,
      valorCobrado: valorCobradoInicial,
      profissional,
      observacoes,
      encaixe: encaixeRecord ?? undefined, // F05 — auditoria do override (defaults quando normal)
      tenantId: req.tenantId
    });
    await novoAgendamento.save();

    // Agendar notificações (confirmação + lembretes)
    let clienteNome = novoAgendamento.lead?.nome;
    let clienteTelefone = novoAgendamento.lead?.telefone;

    const { Cliente, Pacote, CompraPacote } = req.models;

    const clientePromise =
      tipo !== 'Avaliacao' && cliente
        ? Cliente.findOne({ _id: cliente, tenantId: req.tenantId }).select('nome telefone')
        : Promise.resolve(null);

    // Avulso/oferta já têm o nome em servicoAvulsoNome; pacote precisa de lookup
    // para que as notificações agendadas mostrem o nome real em vez do genérico.
    let pacotePromise = Promise.resolve(null);
    if (servicoTipoFinal === 'pacote' && compraPacoteFinal) {
      pacotePromise = CompraPacote.findOne({ _id: compraPacoteFinal, tenantId: req.tenantId }).populate('pacote', 'nome');
    } else if (servicoTipoFinal === 'pacote' && pacoteFinal) {
      pacotePromise = Pacote.findOne({ _id: pacoteFinal, tenantId: req.tenantId }).select('nome');
    }

    const [clienteDoc, pacoteDoc] = await Promise.all([clientePromise, pacotePromise]);

    if (clienteDoc) {
      clienteNome = clienteDoc.nome;
      clienteTelefone = clienteDoc.telefone;
    }

    let servicoNomeNotif = servicoAvulsoNomeFinal;
    if (servicoTipoFinal === 'pacote' && pacoteDoc) {
      servicoNomeNotif = pacoteDoc.pacote?.nome || pacoteDoc.nome || null;
    }

    scheduleNotifications({
      agendamentoId: novoAgendamento._id,
      tenantId: req.tenantId,
      dataHora: novoAgendamento.dataHora,
      clienteNome,
      clienteTelefone,
      servicoNome: formatServicoNomeLembrete(servicoTipoFinal, servicoNomeNotif),
      duracaoSessaoMin: duracaoSessaoPadrao,
    }).catch((err) => console.error('[createAgendamento] Falha ao agendar notificações:', err));

    res.status(201).json(novoAgendamento);
  } catch (error) {
    // GAP-01: corrida simultânea para a mesma (tenantId, dataHora) é detectada
    // atomicamente pelo índice composto único parcial em Agendamento. Devolvemos
    // 409 com o mesmo formato semântico que a verificação best-effort acima.
    if (error && error.code === 11000) {
      return res.status(409).json({
        message: "Já existe um agendamento para este horário.",
        code: "slot_taken",
      });
    }
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
    // Ordenação por dataHora: ascendente por defeito (cronológico, p/ calendário e
    // listas de "próximos"). `?sort=desc` para listas que querem os mais recentes
    // primeiro (ex: "Todos") e não esconder os recentes atrás do limite de 100.
    const sortDir = req.query.sort === 'desc' ? -1 : 1;

    const query = scopeAgendamentoQuery(req);

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
        // Serviço contratado: a maioria das sessões liga-se ao pacote via
        // compraPacote (não via `pacote` directo). Popular o pacote da compra
        // permite à UI mostrar o nome do serviço em vez de "Serviço" genérico.
        .populate({ path: "compraPacote", populate: { path: "pacote", select: "nome" } })
        .sort({ dataHora: sortDir })
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
    res.status(500).json({ message: "Erro ao buscar agendamentos." });
  }
};

// @desc    Buscar um agendamento por ID
export const getAgendamento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const agendamento = await Agendamento.findOne(scopeAgendamentoQuery(req, { _id: req.params.id })).populate("cliente pacote");
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    res.status(500).json({ success: false, error: "Erro ao buscar agendamento." });
  }
};

// @desc    Atualizar agendamento completo
export const updateAgendamento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const {
      dataHora,
      status,
      observacoes,
      profissional,
      servicoAvulsoNome,
      servicoAvulsoValor,
      servicoTipo,
      cliente,
      pacote,
      compraPacote,
      lead,
      statusPagamento,
      transacao,
      valorCobrado
    } = req.body;

    const update = {};
    if (dataHora !== undefined) {
      // Mesma interpretação de fuso que a criação (linha ~88): o frontend
      // envia string naïve ("2026-07-30T10:00") que é hora de parede de
      // Lisboa. Sem isto o Mongoose castava como UTC — a edição deslocava
      // o agendamento 1h no verão (WEST).
      const dataHoraDT = DateTime.fromISO(dataHora, { zone: ZONA });
      if (!dataHoraDT.isValid) {
        return res.status(400).json({ success: false, error: 'dataHora inválida' });
      }
      update.dataHora = dataHoraDT.toJSDate();
    }
    if (status !== undefined) update.status = status;
    if (observacoes !== undefined) update.observacoes = observacoes;
    if (profissional !== undefined) update.profissional = profissional;
    if (servicoAvulsoNome !== undefined) update.servicoAvulsoNome = servicoAvulsoNome;
    if (servicoAvulsoValor !== undefined) update.servicoAvulsoValor = servicoAvulsoValor;
    if (servicoTipo !== undefined) update.servicoTipo = servicoTipo;
    if (cliente !== undefined) update.cliente = cliente || null;
    if (pacote !== undefined) update.pacote = pacote || null;
    if (compraPacote !== undefined) update.compraPacote = compraPacote || null;
    if (lead !== undefined) update.lead = lead || undefined;
    if (statusPagamento !== undefined) update.statusPagamento = statusPagamento;
    if (transacao !== undefined) update.transacao = transacao || null;
    if (valorCobrado !== undefined) update.valorCobrado = valorCobrado;

    if (servicoTipo === 'oferta') {
      const nomeOferta = servicoAvulsoNome !== undefined ? servicoAvulsoNome?.trim() : undefined;
      if (nomeOferta === '') {
        return res.status(400).json({ message: 'Informe o serviço ofertado.' });
      }
      update.pacote = null;
      update.compraPacote = null;
      update.servicoAvulsoValor = 0;
      update.valorCobrado = 0;
      update.statusPagamento = 'Isento';
      update.transacao = null;
    } else if (servicoTipo === 'avulso') {
      const nomeAvulso = servicoAvulsoNome !== undefined ? servicoAvulsoNome?.trim() : undefined;
      if (nomeAvulso === '') {
        return res.status(400).json({ message: 'Informe o nome do serviço avulso.' });
      }
      update.pacote = null;
      update.compraPacote = null;
    }

    if (status !== undefined) {
      const agendamentoAtual = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId })
        .select('status')
        .lean();
      if (!agendamentoAtual) {
        return res.status(404).json({ message: "Agendamento não encontrado." });
      }
      if (status !== agendamentoAtual.status) {
        Object.assign(update, getConfirmacaoPatchForStatus(status, 'laura'));
      }
    }

    const agendamento = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      update,
      { new: true, runValidators: true }
    ).populate("cliente pacote");

    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    // Data alterada → recriar lembretes para a nova hora. Os jobIds
    // determinísticos substituem os jobs antigos; sem isto a edição deixava
    // o agendamento sem lembretes (os velhos auto-invalidam ao disparar).
    const statusCancelados = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
    if (update.dataHora && agendamento.cliente?.telefone && !statusCancelados.includes(agendamento.status)) {
      Tenant.findById(req.tenantId)
        .select('configuracoes.duracaoSessaoPadrao')
        .lean()
        .then((tenantDoc) =>
          scheduleNotifications({
            agendamentoId: agendamento._id,
            tenantId: req.tenantId,
            dataHora: agendamento.dataHora,
            clienteNome: agendamento.cliente.nome || 'Cliente',
            clienteTelefone: agendamento.cliente.telefone,
            servicoNome: agendamento.servicoAvulsoNome || agendamento.pacote?.nome || 'Sessão',
            duracaoSessaoMin: tenantDoc?.configuracoes?.duracaoSessaoPadrao || 60,
          })
        )
        .catch((err) => console.error('[updateAgendamento] Falha ao reagendar notificações:', err));
    }
    res.status(200).json(agendamento);
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: "Dados inválidos.", details: messages });
    }
    res.status(500).json({ message: "Erro ao atualizar agendamento." });
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

    const agendamentoAtual = await Agendamento.findOne(
      scopeAgendamentoQuery(req, { _id: req.params.id })
    );

    if (!agendamentoAtual) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    if (status === 'Realizado' && agendamentoAtual.servicoTipo === 'oferta') {
      agendamentoAtual.valorCobrado = 0;
      agendamentoAtual.servicoAvulsoValor = 0;
      agendamentoAtual.statusPagamento = 'Isento';
      agendamentoAtual.transacao = null;
      await agendamentoAtual.save();
    } else if (status === 'Realizado' && agendamentoAtual.compraPacote) {
      const compraPacote = await CompraPacote.findOne({ _id: agendamentoAtual.compraPacote, tenantId: req.tenantId }).populate('pacote');

      if (!compraPacote) {
        console.error(`[updateStatusAgendamento] ⚠️ CompraPacote não encontrada: ${agendamentoAtual.compraPacote}`);
        return res.status(404).json({ message: "Pacote comprado não encontrado." });
      }

      try {
        const valorPorSessao = compraPacote.pacote?.valor && compraPacote.pacote?.sessoes
          ? compraPacote.pacote.valor / compraPacote.pacote.sessoes
          : 0;
        await compraPacote.usarSessao(agendamentoAtual._id, valorPorSessao, req.user?._id);

        agendamentoAtual.valorCobrado = valorPorSessao;
        agendamentoAtual.statusPagamento = 'Pago';
        await agendamentoAtual.save();
      } catch (error) {
        console.error('⚠️ Erro ao decrementar sessão:', error.message);
        return res.status(400).json({
          message: "Erro ao decrementar sessão do pacote.",
          details: error.message
        });
      }
    } else if (status === 'Realizado' && !agendamentoAtual.compraPacote && agendamentoAtual.servicoAvulsoValor) {
      agendamentoAtual.statusPagamento = 'Pendente';
      await agendamentoAtual.save();
    } else if (status === 'Realizado' && !agendamentoAtual.compraPacote) {
      console.warn(`[updateStatusAgendamento] ⚠️ Agendamento marcado como Realizado mas não tem compraPacote vinculada nem valor avulso`);
    }

    const agendamento = await Agendamento.findOneAndUpdate(
      scopeAgendamentoQuery(req, { _id: req.params.id }),
      {
        status,
        ...getConfirmacaoPatchForStatus(status, 'laura'),
      },
      { new: true, runValidators: true }
    ).populate('compraPacote cliente');

    res.status(200).json(agendamento);
  } catch (error) {
    console.error('[updateStatusAgendamento] Erro:', error);
    res.status(500).json({ message: "Erro ao atualizar status." });
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
    res.status(500).json({ success: false, error: "Erro ao deletar agendamento." });
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

    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('cliente pacote')
      .populate({ path: 'compraPacote', populate: { path: 'pacote', select: 'nome' } });
    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    const novoStatus = getStatusForConfirmacao(confirmacao, respondidoPor);

    agendamento.confirmacao = {
      tipo: confirmacao,
      respondidoEm: nowLisbonDate(),
      respondidoPor: respondidoPor
    };
    agendamento.status = novoStatus;

    await agendamento.save();

    try {
      if (respondidoPor === 'laura' && agendamento.cliente?._id) {
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
      message: "Erro ao confirmar agendamento."
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

    if (agendamento.servicoTipo === 'oferta' || agendamento.statusPagamento === 'Isento') {
      return res.status(400).json({
        message: 'Este agendamento é uma oferta e não gera pagamento.'
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
      message: 'Erro ao registrar pagamento'
    });
  }
};

// @desc    Enviar lembrete manual via WhatsApp
export const enviarLembreteManual = async (req, res) => {
  try {
    const { Agendamento } = req.models;

    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId })
      .populate('cliente pacote')
      .populate({ path: 'compraPacote', populate: { path: 'pacote', select: 'nome' } });

    if (!agendamento) {
      return res.status(404).json({ message: "Agendamento não encontrado." });
    }

    // Suporta agendamentos com cliente registado E avaliações com lead embutido
    const nome = agendamento.cliente?.nome || agendamento.lead?.nome;
    const telefone = agendamento.cliente?.telefone || agendamento.lead?.telefone;

    if (!nome || !telefone) {
      return res.status(400).json({
        message: "Agendamento sem contacto válido para envio.",
        hint: "Adicione cliente ou lead com telefone para enviar lembretes."
      });
    }

    const dataExtenso = formatarDataLembrete(agendamento.dataHora);
    const servicoNome = formatServicoNomeLembrete(
      agendamento.servicoTipo,
      agendamento.compraPacote?.pacote?.nome || agendamento.pacote?.nome || agendamento.servicoAvulsoNome
    );
    const servicoLinha = servicoNome ? `💆 Serviço: ${servicoNome}\n` : '';

    const mensagem = `🔔 *Lembrete de Agendamento*

Olá ${nome}! Tem uma sessão marcada para:
📅 *${dataExtenso}*
${servicoLinha}
Confirma a sua presença?
✅ *SIM* — confirmar
❌ *NÃO* — cancelar

_La Estética Avançada_`;

    const resultado = await sendWhatsAppMessage(telefone, mensagem);

    if (resultado.success) {
      return res.status(200).json({
        success: true,
        message: `Lembrete enviado via WhatsApp para ${nome}`,
        cliente: { nome, telefone },
        agendamento: {
          id: agendamento._id,
          dataHora: agendamento.dataHora,
        },
      });
    } else {
      console.warn(`[Agendamento] ⚠️ Falha ao enviar WhatsApp para ${nome}`);
      return res.status(500).json({
        success: false,
        message: "Falha ao enviar mensagem WhatsApp.",
        details: resultado.error,
      });
    }

  } catch (error) {
    console.error('[Agendamento] ❌ Erro ao enviar lembrete manual:', error);
    res.status(500).json({
      message: "Erro ao enviar lembrete."
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
      message: "Erro ao buscar histórico de atendimentos."
    });
  }
};

// @desc    Marcar presença do cliente no agendamento
// @route   PATCH /api/agendamentos/:id/comparecimento
export const marcarComparecimento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const { compareceu } = req.body;

    if (typeof compareceu !== 'boolean') {
      return res.status(400).json({ success: false, error: 'compareceu deve ser true ou false' });
    }

    const agendamento = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      {
        compareceu,
        status: compareceu ? 'Compareceu' : 'Não Compareceu'
      },
      { new: true, runValidators: true }
    );

    if (!agendamento) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
    }

    res.json({ success: true, data: agendamento });
  } catch (error) {
    console.error('[marcarComparecimento] Erro:', error);
    res.status(500).json({ success: false, error: 'Erro ao marcar comparecimento' });
  }
};

// @desc    Registar encerramento de avaliação (fechou ou não pacote)
//          Se fechou + lead → converte lead em Cliente
// @route   POST /api/agendamentos/:id/fechar-pacote
export const fecharPacote = async (req, res) => {
  try {
    const { Agendamento, Cliente } = req.models;
    const { fechou } = req.body;

    if (typeof fechou !== 'boolean') {
      return res.status(400).json({ success: false, error: 'fechou deve ser true ou false' });
    }

    const agendamento = await Agendamento.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!agendamento) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
    }

    if (agendamento.compareceu !== true) {
      return res.status(400).json({ success: false, error: 'É necessário marcar presença antes de registar o encerramento' });
    }

    const update = {
      fechouPacote: fechou,
      status: fechou ? 'Fechado' : agendamento.status,
    };

    let clienteCriado = null;

    if (fechou && agendamento.tipo === 'Avaliacao' && !agendamento.cliente && agendamento.lead?.nome) {
      try {
        clienteCriado = await Cliente.create({
          tenantId: req.tenantId,
          nome: agendamento.lead.nome,
          telefone: agendamento.lead.telefone,
          ...(agendamento.lead.email && { email: agendamento.lead.email }),
        });
      } catch (err) {
        if (err.code === 11000) {
          clienteCriado = await Cliente.findOne({
            tenantId: req.tenantId,
            telefone: agendamento.lead.telefone.replace(/[^\d]/g, '')
          });
        } else {
          throw err;
        }
      }

      if (clienteCriado) {
        update.clienteConvertido = clienteCriado._id;
        update.cliente = clienteCriado._id;
      }
    }

    const agendamentoAtualizado = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      update,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: agendamentoAtualizado,
      ...(clienteCriado && { clienteCriado }),
    });
  } catch (error) {
    console.error('[fecharPacote] Erro:', error);
    res.status(500).json({ success: false, error: 'Erro ao registar encerramento' });
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
        if (a.servicoTipo === 'oferta' || a.statusPagamento === 'Isento') {
          return acc;
        }
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
      message: "Erro ao buscar estatísticas."
    });
  }
};


// =====================================================================
// 🤖 IA — Pendentes de visualização
// =====================================================================
// Lista (e conta) agendamentos criados pelo agent IA que a equipa
// ainda não viu (iaAckEm null). Usado para um badge na Sidebar.

export const getIaPendentes = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const filtro = {
      tenantId: req.tenantId,
      criadoPorIA: true,
      iaAckEm: null,
    };
    const [count, recentes] = await Promise.all([
      Agendamento.countDocuments(filtro),
      Agendamento.find(filtro)
        .sort({ createdAt: -1 })
        .limit(20)
        .select('dataHora tipo lead status createdAt')
        .lean(),
    ]);
    res.status(200).json({ success: true, data: { count, recentes } });
  } catch (err) {
    console.error('Erro ao listar IA pendentes:', err);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};

// =====================================================================
// 🤖 IA — Acknowledge (a equipa viu este agendamento criado pela IA)
// =====================================================================
export const ackIaAgendamento = async (req, res) => {
  try {
    const { Agendamento } = req.models;
    const ag = await Agendamento.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, criadoPorIA: true },
      { $set: { iaAckEm: new Date() } },
      { new: true },
    );
    if (!ag) {
      return res.status(404).json({ success: false, error: 'Agendamento IA não encontrado' });
    }
    res.status(200).json({ success: true, data: ag });
  } catch (err) {
    console.error('Erro ao ack IA agendamento:', err);
    res.status(500).json({ success: false, error: 'Erro interno.' });
  }
};
