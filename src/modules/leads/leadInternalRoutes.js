/**
 * Rotas internas — usadas pelo `ia-service` Python (Phase 2+).
 *
 * Diferenças face às rotas públicas /api/leads:
 *   - autenticadas por X-Service-Token (não JWT)
 *   - tenantId vem no body, não em req.user
 *   - resolução de DB do tenant é feita por handler (não middleware authenticate)
 *
 * Estes endpoints podem mover stage automaticamente a partir de IA. Validações
 * de transição respeitam ALLOWED_TRANSITIONS estritamente (sem privilégios admin).
 */

import express from 'express';
import mongoose from 'mongoose';
import { requireServiceToken } from '../../middlewares/requireServiceToken.js';
import { getTenantDB } from '../../config/tenantDB.js';
import { getModels } from '../../models/registry.js';
import Tenant from '../../models/Tenant.js';
import { transitionStage, LeadError } from './leadService.js';
import { LEAD_STAGES, ORIGEM_VALUES } from './pipelineConstants.js';
import { scheduleNotifications } from '../../utils/scheduleNotifications.js';
import { DateTime } from 'luxon';
// F05 — mesma regra única de disponibilidade que a IA lê (F03) e o painel aplica.
import { resolveAvailableSlots } from '../../controllers/scheduleController.js';
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';
import { sendPushNotification } from '../../services/pushService.js';
import { registerTeamRequest } from '../../services/teamRequestService.js';
import User from '../../models/User.js';
import UserSubscription from '../../models/UserSubscription.js';

const router = express.Router();

router.use(requireServiceToken);

// Helper: resolve modelos do tenant + valida limite leadsAtivo + plano.
async function resolveTenantContext(tenantId) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    throw new LeadError('tenantId inválido', 400, 'tenant_invalid');
  }
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) throw new LeadError('Tenant não encontrado', 404, 'tenant_not_found');
  if (!['ativo', 'trial'].includes(tenant.plano?.status)) {
    throw new LeadError('Plano inactivo', 403, 'plan_inactive');
  }
  if (tenant.limites?.leadsAtivo === false) {
    throw new LeadError('Leads desactivados neste plano', 403, 'leads_inactive');
  }
  const db = getTenantDB(String(tenant._id));
  return { tenant, models: getModels(db) };
}

// =====================================================================
// POST /api/internal/leads — cria lead a partir de WhatsApp inbound
// Body: { tenantId, telefone, nome?, email?, origem?, conversaId? }
// =====================================================================
router.post('/', async (req, res) => {
  try {
    const { tenantId, telefone, nome, email, origem, conversaId } = req.body || {};
    if (!telefone || typeof telefone !== 'string') {
      return res.status(400).json({ success: false, error: 'telefone é obrigatório' });
    }
    if (origem && !ORIGEM_VALUES.includes(origem)) {
      return res.status(400).json({ success: false, error: 'origem inválida' });
    }

    const { tenant, models } = await resolveTenantContext(tenantId);

    // Verifica limite maxLeads (defesa em profundidade — Python também valida).
    const maxLeads = tenant.limites?.maxLeads ?? -1;
    if (maxLeads !== -1) {
      const count = await models.Lead.countDocuments({
        tenantId: tenant._id,
        status: { $nin: ['perdido', 'convertido'] },
      });
      if (count >= maxLeads) {
        return res.status(403).json({
          success: false,
          error: 'Limite de leads atingido',
          code: 'lead_limit_reached',
        });
      }
    }

    // Idempotente: se já existe lead com esse telefone, devolve-o.
    const telefoneNorm = String(telefone).replace(/[^\d]/g, '');
    const existente = await models.Lead.findOne({
      tenantId: tenant._id,
      telefone: telefoneNorm,
    });
    if (existente) {
      return res.status(200).json({ success: true, data: existente, alreadyExisted: true });
    }

    const lead = await models.Lead.create({
      tenantId: tenant._id,
      telefone: telefoneNorm,
      nome,
      email,
      origem: origem ?? 'whatsapp',
      conversa: conversaId,
      status: 'novo',
    });

    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    if (err instanceof LeadError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Telefone já registado' });
    }
    console.error('Erro internal POST /leads:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// PATCH /api/internal/leads/:id/stage
// Body: { tenantId, stage, motivo? }
// =====================================================================
router.patch('/:id/stage', async (req, res) => {
  try {
    const { tenantId, stage, motivo } = req.body || {};
    if (!LEAD_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, error: 'stage inválido' });
    }
    const { models } = await resolveTenantContext(tenantId);

    const lead = await models.Lead.findOne({ _id: req.params.id, tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    transitionStage({
      lead,
      toStage: stage,
      motivo,
      actor: { role: 'service' },
      isInternalCall: true,
    });

    await lead.save();
    res.status(200).json({ success: true, data: lead });
  } catch (err) {
    if (err instanceof LeadError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    console.error('Erro internal PATCH /leads/:id/stage:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// PATCH /api/internal/leads/:id/qualificacao
// Body: { tenantId, score?, motivoInteresse?, objetivos?, urgencia?, interesse?, observacoes? }
//
// Used by the ia-service to capture lead intel during conversation:
// - score is bounded to [0,100]
// - urgencia must be one of URGENCIA_VALUES (validated by Mongoose)
// - observacoes is free-form notes the agent collected
// Stage transitions are NOT done here — agent calls /:id/stage explicitly
// when criteria are met (e.g., score >= 60 → 'qualificado').
// =====================================================================
router.patch('/:id/qualificacao', async (req, res) => {
  try {
    const {
      tenantId,
      score,
      scoreDelta,
      motivoInteresse,
      objetivos,
      urgencia,
      interesse,
      observacoes,
      nome,
    } = req.body || {};
    const { models } = await resolveTenantContext(tenantId);

    // GAP-02: dois modos mutuamente exclusivos
    //   • `score` absoluto — usado pelo agent `qualify_lead` tool (commitment
    //     deliberado do agente após reasoning). Set semantics.
    //   • `scoreDelta` — usado pelo F07 extractor (por turno). **Atómico**
    //     via aggregation pipeline update: read+compute+clamp+write num
    //     único comando MongoDB. Elimina a corrida read-then-write que
    //     perdia deltas entre turns paralelos do mesmo lead.
    if (Number.isFinite(score) && Number.isFinite(scoreDelta)) {
      return res.status(400).json({
        success: false,
        error: 'score e scoreDelta são mutuamente exclusivos',
        code: 'score_and_delta_conflict',
      });
    }

    // Validação do delta range — espelha LeadIntel.score_delta do extractor
    if (scoreDelta !== undefined) {
      if (!Number.isInteger(scoreDelta) || scoreDelta < -30 || scoreDelta > 30) {
        return res.status(400).json({
          success: false,
          error: 'scoreDelta deve ser inteiro entre -30 e +30',
          code: 'score_delta_invalid',
        });
      }
    }

    // Other-fields update (motivoInteresse, objetivos, urgencia, etc.) é
    // partilhado por ambos os modos.
    const otherSet = { ultimaInteracao: new Date() };
    if (motivoInteresse) otherSet['qualificacao.motivoInteresse'] = motivoInteresse;
    if (Array.isArray(objetivos)) otherSet['qualificacao.objetivos'] = objetivos;
    if (urgencia) otherSet.urgencia = urgencia;
    if (interesse) otherSet.interesse = interesse;
    if (observacoes) otherSet.observacoes = observacoes;
    if (nome) otherSet.nome = nome;

    let lead;

    if (Number.isFinite(scoreDelta)) {
      // ─── Modo delta: aggregation pipeline update atómico ─────────────
      // Single MongoDB command que (a) acumula delta + clamp, (b) actualiza
      // outros campos, (c) auto-promove a 'qualificado' se score >= 60 e
      // status ∈ {novo, em_conversa}. Tudo dentro da atomicidade
      // single-document do Mongo — concorrência entre turns é segura.
      const pipeline = [
        {
          $set: {
            ...otherSet,
            'qualificacao.score': {
              $max: [
                0,
                {
                  $min: [
                    100,
                    {
                      $add: [
                        { $ifNull: ['$qualificacao.score', 0] },
                        scoreDelta,
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $set: {
            status: {
              $cond: {
                if: {
                  $and: [
                    { $gte: ['$qualificacao.score', 60] },
                    { $in: ['$status', ['novo', 'em_conversa']] },
                  ],
                },
                then: 'qualificado',
                else: '$status',
              },
            },
          },
        },
      ];

      lead = await models.Lead.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        pipeline,
        { new: true, updatePipeline: true },
      );

      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead não encontrado' });
      }

      return res.status(200).json({ success: true, data: lead });
    }

    // ─── Modo score absoluto: set semantics (compatibilidade) ────────────
    const update = { ...otherSet };
    if (Number.isFinite(score)) update['qualificacao.score'] = Math.max(0, Math.min(100, score));

    lead = await models.Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    // Auto-promote no modo absoluto — defense-in-depth via transitionStage
    // (mantém validação ALLOWED_TRANSITIONS do leadService).
    const isStillEarly = lead.status === 'em_conversa' || lead.status === 'novo';
    if (isStillEarly && (lead.qualificacao?.score || 0) >= 60) {
      try {
        transitionStage({
          lead,
          toStage: 'qualificado',
          actor: { role: 'service' },
          isInternalCall: true,
        });
        await lead.save();
      } catch (err) {
        // Non-fatal: transition validation may refuse — log and move on
        console.warn('[qualificacao auto-promote refused]', err.message);
      }
    }

    res.status(200).json({ success: true, data: lead });
  } catch (err) {
    if (err instanceof LeadError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    console.error('Erro internal PATCH /leads/:id/qualificacao:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// POST /api/internal/mensagens — ia-service persiste mensagem (in ou out)
// Body: { tenantId, conversaId?, telefone, mensagem, origem, direcao? }
// =====================================================================
/**
 * GET /:id/messages?tenantId=...&limit=10
 *
 * Returns the most recent messages for a lead's conversation, oldest first.
 * Used by the ia-service to give the LangChain agent conversational memory.
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { tenantId } = req.query;
    const limit = Math.min(50, parseInt(req.query.limit) || 10);

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'leadId invalid' });
    }

    const db = getTenantDB(String(tenantId));
    const { Lead, Mensagem, Conversa } = getModels(db);

    const lead = await Lead.findOne({ _id: id, tenantId }).select('conversa telefone').lean();
    if (!lead) {
      return res.json({ success: true, data: [] });
    }

    // Resolve the conversation id. Lead.conversa is the canonical link, but
    // historically some paths created the Conversa without back-linking it on
    // the Lead (race between create_lead + create_message in the orchestrator).
    // Fallback: look the Conversa up by tenantId + telefone and self-heal the
    // Lead.conversa pointer so subsequent reads use the fast path.
    let conversaId = lead.conversa;
    if (!conversaId && lead.telefone) {
      const c = await Conversa.findOne({ tenantId, telefone: lead.telefone })
        .select('_id')
        .lean();
      if (c && c._id) {
        conversaId = c._id;
        Lead.updateOne({ _id: id, tenantId }, { $set: { conversa: c._id } }).catch(() => {});
      }
    }

    if (!conversaId) {
      return res.json({ success: true, data: [] });
    }

    // newest-first then reverse to chronological
    const recent = await Mensagem.find({ conversa: conversaId, tenantId })
      .sort({ data: -1, createdAt: -1 })
      .limit(limit)
      .select('mensagem origem direcao data createdAt')
      .lean();

    res.json({ success: true, data: recent.reverse() });
  } catch (err) {
    console.error('Erro ao listar mensagens do lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// POST /api/internal/leads/:id/agendamento
// Body: { tenantId, dataHoraISO, tipo? }
//
// Creates an Avaliacao appointment for the lead — used when the IA
// agent confirms a slot the lead picked. Atomic check: refuses if the
// slot is already taken by another non-cancelled appointment.
// =====================================================================
router.post('/:id/agendamento', async (req, res) => {
  try {
    const { tenantId, dataHoraISO, tipo } = req.body || {};
    if (!tenantId || !dataHoraISO) {
      return res.status(400).json({ success: false, error: 'tenantId e dataHoraISO são obrigatórios' });
    }
    const dataHora = new Date(dataHoraISO);
    if (Number.isNaN(dataHora.getTime())) {
      return res.status(400).json({ success: false, error: 'dataHoraISO inválido' });
    }
    if (dataHora < new Date()) {
      return res.status(400).json({ success: false, error: 'dataHora no passado' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'leadId inválido' });
    }

    const { tenant, models } = await resolveTenantContext(tenantId);
    const lead = await models.Lead.findOne({ _id: req.params.id, tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    // Atomic slot check: refuse if any non-cancelled appointment overlaps the
    // session+arrumação window centered on dataHora — same formula as the
    // cliente/painel booking paths (60min session + intervaloEntreSessoes).
    const gapMin = 60 + (tenant?.configuracoes?.intervaloEntreSessoes || 0);
    const halfMs = (gapMin * 60 * 1000) - 1; // [start, start+gapMin)
    const windowStart = new Date(dataHora.getTime() - halfMs);
    const windowEnd = new Date(dataHora.getTime() + halfMs);
    const cancelledStatus = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
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
    const leadTenantHasSchedule = await models.Schedule.exists({ tenantId, isActive: true });
    if (leadTenantHasSchedule) {
      const dataHoraDT = DateTime.fromJSDate(dataHora, { zone: 'Europe/Lisbon' });
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

    const agendamento = await models.Agendamento.create({
      tenantId,
      tipo: tipo === 'Sessao' || tipo === 'Retorno' ? tipo : 'Avaliacao',
      lead: {
        nome: lead.nome || null,
        telefone: lead.telefone,
        email: lead.email || null,
      },
      dataHora,
      status: 'Agendado',
      criadoPorIA: true,
      observacoes: 'Marcação criada automaticamente pelo agent IA — confirmar com cliente.',
    });

    // Dispara mesma automação de lembretes que createAgendamento público:
    // confirmação imediata + lembrete antecipado (1-2 dias) + 1h antes.
    // Degrada silenciosamente se Redis não estiver configurado.
    scheduleNotifications({
      agendamentoId: agendamento._id,
      tenantId,
      dataHora: agendamento.dataHora,
      clienteNome: lead.nome || 'Cliente',
      clienteTelefone: lead.telefone,
      servicoNome: 'Avaliação gratuita',
    }).catch((err) => console.warn('[ia-appointment] scheduleNotifications falhou:', err.message));

    res.status(201).json({ success: true, data: agendamento });
  } catch (err) {
    // GAP-01: o índice composto único parcial em Agendamento captura corridas
    // simultâneas para a mesma (tenantId, dataHora). Convertemos E11000 em
    // 409 slot_taken — mesmo código que o handler usa quando detecta o
    // conflito via best-effort findOne acima.
    if (err && err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Slot já ocupado por outro agendamento',
        code: 'slot_taken',
      });
    }
    console.error('Erro internal POST /leads/:id/agendamento:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// =====================================================================
// POST /api/internal/leads/:id/alerta-equipa
// Body: { tenantId, motivo }
// Torna real o handoff prometido pela IA: alerta a
// equipa (WhatsApp admin + push best-effort) — caso Hayzel 2026-07-06:
// lead quente com prazo prometida à espera de contacto que nunca saiu.
// =====================================================================

// Anti-spam: 1 alerta por lead a cada 10 min (mesmo racional da rota de
// clientes — o modelo pode repetir a promessa em turns seguidos).
const ALERTA_LEAD_DEDUP_MS = 10 * 60 * 1000;
const ultimoAlertaLead = new Map();

router.post('/:id/alerta-equipa', async (req, res) => {
  try {
    const leadId = req.params.id;
    const { tenantId, motivo } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId é obrigatório' });
    }
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ success: false, error: 'leadId inválido' });
    }

    const dedupKey = `${tenantId}:${leadId}`;
    const ultimo = ultimoAlertaLead.get(dedupKey);
    if (ultimo && Date.now() - ultimo < ALERTA_LEAD_DEDUP_MS) {
      return res.json({
        success: true,
        data: { whatsappEnviado: false, pushEnviado: false, deduplicado: true },
      });
    }

    const { tenant, models } = await resolveTenantContext(tenantId);

    const lead = await models.Lead.findOne({ _id: leadId, tenantId })
      .select('nome telefone urgencia observacoes')
      .lean();
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    ultimoAlertaLead.set(dedupKey, Date.now());

    const motivoTxt = String(motivo || 'O lead precisa de apoio da equipa.').slice(0, 300);
    const extras = [
      lead.urgencia ? `Urgência: ${lead.urgencia}` : null,
      lead.observacoes ? `Notas: ${String(lead.observacoes).slice(0, 200)}` : null,
    ].filter(Boolean).join('\n');
    const alerta =
      `📋 *Pedido de Verificação (IA)*\n\n` +
      `A IA precisa da tua ajuda com o lead, olhe no telefone da empresa ou no sistema *${lead.nome || 'sem nome'}*:\n\n` +
      `${motivoTxt}\n\n` +
      (extras ? `${extras}\n\n` : '') +
      `📱 Contacto: ${lead.telefone || 'sem telefone registado'}\n\n` +
      `↩️ Podes responder por texto ou áudio, por exemplo: ` +
      `"Diga à ${lead.nome || 'pessoa'} que..."`;

    let whatsappEnviado = false;
    const numeroAdmin = tenant?.whatsapp?.numeroWhatsapp;
    if (numeroAdmin) {
      const resultado = await sendWhatsAppMessage(numeroAdmin, alerta, tenant?.whatsapp?.instanceName);
      whatsappEnviado = Boolean(resultado?.success);
      if (whatsappEnviado) {
        try {
          await registerTeamRequest({
            models,
            tenantId,
            contactType: 'lead',
            contactId: lead._id,
            contactName: lead.nome,
            contactPhone: lead.telefone,
            reason: motivoTxt,
          });
        } catch (requestErr) {
          console.warn(
            `[alerta-equipa-lead] registo do pedido pendente falhou: ${requestErr.message}`,
          );
        }
      }
    } else {
      console.warn(
        `[alerta-equipa-lead] tenant ${tenantId} sem whatsapp.numeroWhatsapp — alerta NÃO entregue por WhatsApp (lead ${leadId})`
      );
    }

    // Push best-effort aos admins do tenant — nunca falha o pedido.
    let pushEnviado = false;
    try {
      const admins = await User.find({ tenantId, role: { $in: ['admin', 'gerente'] } })
        .select('_id')
        .lean();
      const subs = await UserSubscription.find({
        userId: { $in: admins.map((a) => String(a._id)) },
        active: true,
      }).lean();
      await Promise.all(
        subs.map((sub) =>
          sendPushNotification(sub, {
            title: '📋 IA pede verificação (lead)',
            body: `${lead.nome || 'Lead'}: ${motivoTxt}`.slice(0, 160),
            tag: `alerta-equipa-lead-${leadId}`,
            data: { tipo: 'alerta-equipa-lead', leadId },
          })
        )
      );
      pushEnviado = subs.length > 0;
    } catch (pushErr) {
      console.warn('[internal] push de alerta-equipa (lead) falhou:', pushErr.message);
    }

    res.json({ success: true, data: { whatsappEnviado, pushEnviado } });
  } catch (err) {
    if (err instanceof LeadError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    console.error('Erro internal POST /leads/:id/alerta-equipa:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/mensagens', requireServiceToken, async (req, res) => {
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
    console.error('Erro ao persistir mensagem:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao persistir mensagem.' });
  }
});

export default router;
