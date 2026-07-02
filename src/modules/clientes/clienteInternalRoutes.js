/**
 * Rotas internas de clientes — usadas pelo `ia-service` Python.
 *
 * Autenticadas por X-Service-Token (não JWT).
 * tenantId vem no body ou query, não em req.user.
 *
 * Endpoints:
 *   GET   /:id/agendamentos                        — próximos agendamentos do cliente
 *   POST  /:id/agendamentos                        — criar agendamento (max 1 pendente)
 *   PATCH /:id/agendamentos/:agendamentoId/reschedule — remarcar (24h mínimo)
 *   PATCH /:id/agendamentos/:agendamentoId/cancel     — cancelar (late cancel policy)
 *   GET   /:id/pacotes                             — pacotes activos com sessões restantes
 *   GET   /:id/messages                            — histórico de mensagens por telefone
 *   POST  /mensagens                               — persistir mensagem (in ou out)
 */

import express from 'express';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { requireServiceToken } from '../../middlewares/requireServiceToken.js';
import { getTenantDB } from '../../config/tenantDB.js';
import { getModels } from '../../models/registry.js';
import Tenant from '../../models/Tenant.js';
import { scheduleNotifications } from '../../utils/scheduleNotifications.js';
import logger from '../../utils/logger.js';
// F05 — mesma regra única de disponibilidade que a IA lê (F03) e o painel aplica.
import { resolveAvailableSlots } from '../../controllers/scheduleController.js';

const router = express.Router();

router.use(requireServiceToken);

async function resolveTenantContext(tenantId) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    const err = new Error('tenantId inválido');
    err.statusCode = 400;
    throw err;
  }
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    const err = new Error('Tenant não encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (!['ativo', 'trial'].includes(tenant.plano?.status)) {
    const err = new Error('Plano inactivo');
    err.statusCode = 403;
    throw err;
  }
  const db = getTenantDB(String(tenant._id));
  return { tenant, models: getModels(db) };
}

// =====================================================================
// GET /api/internal/clientes/:id/agendamentos?tenantId=...
// Returns upcoming non-cancelled appointments for this client.
// =====================================================================
router.get('/:id/agendamentos', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const clienteId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const cliente = await models.Cliente.findOne({ _id: clienteId, tenantId })
      .select('_id nome telefone')
      .lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const cancelledStatus = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
    const agendamentos = await models.Agendamento.find({
      tenantId,
      cliente: clienteId,
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
      dataHora: { $gte: DateTime.now().setZone('Europe/Lisbon').toJSDate() },
    })
      .sort({ dataHora: 1 })
      .limit(10)
      .select('dataHora status tipo confirmacao servicoAvulsoNome observacoes criadoPorIA')
      .lean();

    res.json({ success: true, data: agendamentos });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] GET /clientes/:id/agendamentos');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// POST /api/internal/clientes/:id/agendamentos
// Body: { tenantId, dataHoraISO, tipo? }
// Creates appointment for existing client.
// =====================================================================
router.post('/:id/agendamentos', async (req, res) => {
  try {
    const clienteId = req.params.id;
    const { tenantId, dataHoraISO, tipo } = req.body || {};

    if (!tenantId || !dataHoraISO) {
      return res.status(400).json({ success: false, error: 'tenantId e dataHoraISO são obrigatórios' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }

    const dataHoraDT = DateTime.fromISO(dataHoraISO, { zone: 'Europe/Lisbon' });
    if (!dataHoraDT.isValid) {
      return res.status(400).json({ success: false, error: 'dataHoraISO inválido' });
    }
    const dataHora = dataHoraDT.toJSDate();
    if (dataHoraDT < DateTime.now().setZone('Europe/Lisbon')) {
      return res.status(400).json({ success: false, error: 'dataHora no passado' });
    }

    const { tenant, models } = await resolveTenantContext(tenantId);

    const cliente = await models.Cliente.findOne({ _id: clienteId, tenantId })
      .select('_id nome telefone')
      .lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    // Rule 3: max 1 pending appointment per client
    const cancelledStatus = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
    const pendingCount = await models.Agendamento.countDocuments({
      tenantId,
      cliente: clienteId,
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
      dataHora: { $gte: DateTime.now().setZone('Europe/Lisbon').toJSDate() },
    });
    if (pendingCount >= 1) {
      return res.status(409).json({
        success: false,
        error: 'Cliente já tem um agendamento pendente. Aguarde a sessão actual antes de marcar outra.',
        code: 'max_pending_reached',
      });
    }

    const gapMin = 60 + (tenant?.configuracoes?.intervaloEntreSessoes || 0);
    const halfMs = (gapMin * 60 * 1000) - 1;
    const windowStart = new Date(dataHora.getTime() - halfMs);
    const windowEnd = new Date(dataHora.getTime() + halfMs);
    const conflict = await models.Agendamento.findOne({
      tenantId,
      dataHora: { $gte: windowStart, $lte: windowEnd },
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: 'Slot já ocupado por outro agendamento',
        code: 'slot_taken',
      });
    }

    // F05 — enforcement de disponibilidade (regra única resolveAvailableSlots,
    // a mesma que a IA leu ao propor o slot em F03). SEM override neste caminho:
    // a IA nunca força encaixes (qualquer `forcarEncaixe` no body é ignorado).
    // Corre DEPOIS do check de conflito (preserva o 409 slot_taken que a IA
    // trata). Permissivo se o tenant não tem nenhum dia activo (D4 — os docs
    // inactivos default do initializeSchedules não contam como configuração).
    const clienteTenantHasSchedule = await models.Schedule.exists({ tenantId, isActive: true });
    if (clienteTenantHasSchedule) {
      const { slots, isException, exceptionType } = await resolveAvailableSlots({
        Schedule: models.Schedule,
        ScheduleException: models.ScheduleException,
        Agendamento: models.Agendamento,
        tenantId,
        date: dataHoraDT.toFormat('yyyy-MM-dd'),
        duration: 60,
        // Fase A — mesma grelha ancorada (com arrumação) que o picker/IA mostram.
        interval: tenant?.configuracoes?.intervaloEntreSessoes || 0,
      });
      if (!slots.includes(dataHoraDT.toFormat('HH:mm'))) {
        return res.status(400).json({
          success: false,
          error: isException && exceptionType === 'fechado'
            ? 'O salão está fechado nesta data.'
            : 'Horário fora da disponibilidade configurada.',
          code: 'fora_disponibilidade',
        });
      }
    }

    const validTipos = ['Sessao', 'Retorno', 'Avaliacao'];
    const agendamento = await models.Agendamento.create({
      tenantId,
      tipo: validTipos.includes(tipo) ? tipo : 'Sessao',
      cliente: clienteId,
      dataHora,
      status: 'Agendado',
      criadoPorIA: true,
      observacoes: 'Marcação criada automaticamente pelo agent IA — confirmar com cliente.',
    });

    scheduleNotifications({
      agendamentoId: agendamento._id,
      tenantId,
      dataHora: agendamento.dataHora,
      clienteNome: cliente.nome || 'Cliente',
      clienteTelefone: cliente.telefone,
      servicoNome: tipo === 'Avaliacao' ? 'Avaliação' : 'Sessão',
    }).catch((e) => logger.warn({ err: e.message }, '[ia-client-appointment] scheduleNotifications falhou'));

    res.status(201).json({ success: true, data: agendamento });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Slot já ocupado por outro agendamento',
        code: 'slot_taken',
      });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] POST /clientes/:id/agendamentos');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/reschedule
// Body: { tenantId, novaDataHoraISO }
// Reschedule an existing appointment (24h minimum notice).
// =====================================================================
router.patch('/:id/agendamentos/:agendamentoId/reschedule', async (req, res) => {
  try {
    const clienteId = req.params.id;
    const agendamentoId = req.params.agendamentoId;
    const { tenantId, novaDataHoraISO } = req.body || {};

    if (!tenantId || !novaDataHoraISO) {
      return res.status(400).json({ success: false, error: 'tenantId e novaDataHoraISO são obrigatórios' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }
    if (!mongoose.Types.ObjectId.isValid(agendamentoId)) {
      return res.status(400).json({ success: false, error: 'agendamentoId inválido' });
    }

    const novaDataHoraDT = DateTime.fromISO(novaDataHoraISO, { zone: 'Europe/Lisbon' });
    if (!novaDataHoraDT.isValid) {
      return res.status(400).json({ success: false, error: 'novaDataHoraISO inválido' });
    }
    const agora = DateTime.now().setZone('Europe/Lisbon');
    if (novaDataHoraDT < agora) {
      return res.status(400).json({ success: false, error: 'novaDataHora no passado' });
    }

    const { tenant, models } = await resolveTenantContext(tenantId);

    const cancelledStatus = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
    const agendamento = await models.Agendamento.findOne({
      _id: agendamentoId,
      tenantId,
      cliente: clienteId,
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
    });
    if (!agendamento) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
    }

    // 24h minimum notice rule
    const dataHoraActualDT = DateTime.fromJSDate(agendamento.dataHora).setZone('Europe/Lisbon');
    const horasAteAgendamento = dataHoraActualDT.diff(agora, 'hours').hours;
    if (horasAteAgendamento < 24) {
      return res.status(400).json({
        success: false,
        error: 'Remarcação só é permitida com mais de 24h de antecedência. Contacte a Laura directamente.',
        code: 'reschedule_too_late',
      });
    }

    // Slot conflict check for the new time (same window logic as create, com arrumação)
    const novaDataHora = novaDataHoraDT.toJSDate();
    const gapMin = 60 + (tenant?.configuracoes?.intervaloEntreSessoes || 0);
    const halfMs = (gapMin * 60 * 1000) - 1;
    const windowStart = new Date(novaDataHora.getTime() - halfMs);
    const windowEnd = new Date(novaDataHora.getTime() + halfMs);
    const conflict = await models.Agendamento.findOne({
      tenantId,
      _id: { $ne: agendamentoId },
      dataHora: { $gte: windowStart, $lte: windowEnd },
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: 'Slot já ocupado por outro agendamento',
        code: 'slot_taken',
      });
    }

    // Update the appointment
    const observacoesAnterior = agendamento.observacoes || '';
    const notaRemarcacao = `Remarcado via IA em ${agora.toFormat('dd/MM/yyyy HH:mm')} (anterior: ${dataHoraActualDT.toFormat('dd/MM/yyyy HH:mm')})`;
    agendamento.dataHora = novaDataHora;
    agendamento.observacoes = observacoesAnterior
      ? `${observacoesAnterior}\n${notaRemarcacao}`
      : notaRemarcacao;
    await agendamento.save();

    // Re-schedule notifications
    const cliente = await models.Cliente.findOne({ _id: clienteId, tenantId })
      .select('nome telefone')
      .lean();
    scheduleNotifications({
      agendamentoId: agendamento._id,
      tenantId,
      dataHora: agendamento.dataHora,
      clienteNome: cliente?.nome || 'Cliente',
      clienteTelefone: cliente?.telefone,
      servicoNome: agendamento.tipo === 'Avaliacao' ? 'Avaliação' : 'Sessão',
    }).catch((e) => logger.warn({ err: e.message }, '[ia-client-reschedule] scheduleNotifications falhou'));

    res.json({ success: true, data: agendamento });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Slot já ocupado por outro agendamento',
        code: 'slot_taken',
      });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] PATCH /clientes/:id/agendamentos/:agendamentoId/reschedule');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// PATCH /api/internal/clientes/:id/agendamentos/:agendamentoId/cancel
// Body: { tenantId }
// Cancel an appointment. Late cancel (<24h) with active package counts
// as a used session (policy).
// =====================================================================
router.patch('/:id/agendamentos/:agendamentoId/cancel', async (req, res) => {
  try {
    const clienteId = req.params.id;
    const agendamentoId = req.params.agendamentoId;
    const { tenantId } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId é obrigatório' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }
    if (!mongoose.Types.ObjectId.isValid(agendamentoId)) {
      return res.status(400).json({ success: false, error: 'agendamentoId inválido' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const cancelledStatus = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
    const agendamento = await models.Agendamento.findOne({
      _id: agendamentoId,
      tenantId,
      cliente: clienteId,
      status: { $nin: cancelledStatus },
      'confirmacao.tipo': { $ne: 'rejeitado' },
    });
    if (!agendamento) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado' });
    }

    const agora = DateTime.now().setZone('Europe/Lisbon');
    const dataHoraDT = DateTime.fromJSDate(agendamento.dataHora).setZone('Europe/Lisbon');
    const horasAteAgendamento = dataHoraDT.diff(agora, 'hours').hours;

    let lateCancel = false;

    // Check if late cancel (<24h) AND client has active package
    if (horasAteAgendamento < 24) {
      const activePacote = await models.CompraPacote.findOne({
        tenantId,
        cliente: clienteId,
        status: 'Ativo',
      })
        .select('_id')
        .lean();

      if (activePacote) {
        lateCancel = true;
        const notaCancelamento = `Cancelamento tardio — conta como sessão usada (política 24h)`;
        agendamento.observacoes = agendamento.observacoes
          ? `${agendamento.observacoes}\n${notaCancelamento}`
          : notaCancelamento;
      }
    }

    agendamento.status = 'Cancelado Pelo Cliente';
    agendamento.confirmacao = {
      tipo: 'rejeitado',
      respondidoEm: agora.toJSDate(),
      respondidoPor: 'cliente',
    };
    agendamento.markModified('confirmacao');
    await agendamento.save();

    res.json({ success: true, data: { agendamento, lateCancel } });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] PATCH /clientes/:id/agendamentos/:agendamentoId/cancel');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// PATCH /api/internal/clientes/:id/pausar-ia
// Body: { tenantId, ativa? }  — pausa (ativa=false/omitido) ou reactiva
// (ativa=true) a IA para este cliente. Usado pela auto-pausa off-topic do
// agente e pelo handoff humano do inbox de Conversas.
// =====================================================================
router.patch('/:id/pausar-ia', async (req, res) => {
  try {
    const clienteId = req.params.id;
    const { tenantId, ativa } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId é obrigatório' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const cliente = await models.Cliente.findOneAndUpdate(
      { _id: clienteId, tenantId },
      { iaAtiva: ativa === true },
      { new: true }
    )
      .select('_id iaAtiva')
      .lean();

    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    res.json({ success: true, data: { iaAtiva: cliente.iaAtiva } });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] PATCH /clientes/:id/pausar-ia');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// GET /api/internal/clientes/:id/pacotes?tenantId=...
// Returns active packages with sessions remaining.
// =====================================================================
router.get('/:id/pacotes', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const clienteId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId inválido' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const cliente = await models.Cliente.findOne({ _id: clienteId, tenantId })
      .select('_id')
      .lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const pacotes = await models.CompraPacote.find({
      tenantId,
      cliente: clienteId,
      status: 'Ativo',
    })
      .populate('pacote', 'nome')
      .select('pacote sessoesContratadas sessoesUsadas sessoesRestantes dataExpiracao status')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = pacotes.map(p => ({
      _id: p._id,
      pacoteNome: p.pacote?.nome || 'Pacote',
      sessoesContratadas: p.sessoesContratadas,
      sessoesUsadas: p.sessoesUsadas,
      sessoesRestantes: p.sessoesRestantes,
      dataExpiracao: p.dataExpiracao,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    logger.error({ err: err.message, stack: err.stack }, '[internal] GET /clientes/:id/pacotes');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// GET /api/internal/clientes/:id/messages?tenantId=...&limit=10
// Returns recent messages for the client (by phone number).
// =====================================================================
router.get('/:id/messages', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const clienteId = req.params.id;
    const limit = Math.min(50, parseInt(req.query.limit) || 10);

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(clienteId)) {
      return res.status(400).json({ success: false, error: 'clienteId invalid' });
    }

    const db = getTenantDB(String(tenantId));
    const { Cliente, Mensagem, Conversa } = getModels(db);

    const cliente = await Cliente.findOne({ _id: clienteId, tenantId })
      .select('telefone')
      .lean();
    if (!cliente || !cliente.telefone) {
      return res.json({ success: true, data: [] });
    }

    const tel = cliente.telefone.replace(/[^\d]/g, '');
    const variants = [tel, `351${tel}`, tel.replace(/^351/, '')];

    const conversa = await Conversa.findOne({ tenantId, telefone: { $in: variants } })
      .select('_id')
      .lean();
    if (!conversa) {
      return res.json({ success: true, data: [] });
    }

    const recent = await Mensagem.find({ conversa: conversa._id, tenantId })
      .sort({ data: -1, createdAt: -1 })
      .limit(limit)
      .select('mensagem origem direcao data createdAt')
      .lean();

    res.json({ success: true, data: recent.reverse() });
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, '[internal] GET /clientes/:id/messages');
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// POST /api/internal/clientes/mensagens
// Body: { tenantId, telefone, mensagem, origem, direcao?, conversaId? }
// Reuses the same Conversa/Mensagem storage as leads.
// =====================================================================
router.post('/mensagens', async (req, res) => {
  try {
    const { tenantId, conversaId, telefone, mensagem, origem, direcao } = req.body;
    if (!tenantId || !telefone || !mensagem || !origem) {
      return res.status(400).json({ success: false, error: 'tenantId, telefone, mensagem e origem são obrigatórios' });
    }
    const db = getTenantDB(String(tenantId));
    const { Mensagem, Conversa } = getModels(db);

    let conversa = conversaId
      ? await Conversa.findOne({ _id: conversaId, tenantId })
      : await Conversa.findOne({ telefone, tenantId });

    if (!conversa) {
      conversa = await Conversa.create({ tenantId, telefone, estado: 'aguardando_agendamento' });
    }

    const msg = await Mensagem.create({
      tenantId,
      telefone,
      mensagem,
      origem,
      direcao: direcao ?? (origem === 'cliente' ? 'entrada' : 'saida'),
      conversa: conversa._id,
    });

    res.status(201).json({ success: true, data: { mensagem: msg, conversa } });
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, '[internal] POST /clientes/mensagens');
    res.status(500).json({ success: false, error: 'Erro interno ao persistir mensagem.' });
  }
});

export default router;
