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
    const { tenantId, score, motivoInteresse, objetivos, urgencia, interesse, observacoes } = req.body || {};
    const { models } = await resolveTenantContext(tenantId);

    const update = { ultimaInteracao: new Date() };
    if (Number.isFinite(score)) update['qualificacao.score'] = Math.max(0, Math.min(100, score));
    if (motivoInteresse) update['qualificacao.motivoInteresse'] = motivoInteresse;
    if (Array.isArray(objetivos)) update['qualificacao.objetivos'] = objetivos;
    if (urgencia) update.urgencia = urgencia;
    if (interesse) update.interesse = interesse;
    if (observacoes) update.observacoes = observacoes;

    const lead = await models.Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    // Auto-promote to 'qualificado' when score >= 60 and lead is still
    // in 'em_conversa' (or 'novo'). Defense-in-depth — the agent doesn't
    // always remember to call /stage explicitly.
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
    const { Lead, Mensagem } = getModels(db);

    const lead = await Lead.findOne({ _id: id, tenantId }).select('conversa').lean();
    if (!lead || !lead.conversa) {
      return res.json({ success: true, data: [] });
    }

    // newest-first then reverse to chronological
    const recent = await Mensagem.find({ conversa: lead.conversa, tenantId })
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
