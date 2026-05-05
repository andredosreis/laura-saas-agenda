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
// Body: { tenantId, score?, motivoInteresse?, objetivos?, urgencia?, interesse? }
// =====================================================================
router.patch('/:id/qualificacao', async (req, res) => {
  try {
    const { tenantId, score, motivoInteresse, objetivos, urgencia, interesse } = req.body || {};
    const { models } = await resolveTenantContext(tenantId);

    const update = { ultimaInteracao: new Date() };
    if (Number.isFinite(score)) update['qualificacao.score'] = Math.max(0, Math.min(100, score));
    if (motivoInteresse) update['qualificacao.motivoInteresse'] = motivoInteresse;
    if (Array.isArray(objetivos)) update['qualificacao.objetivos'] = objetivos;
    if (urgencia) update.urgencia = urgencia;
    if (interesse) update.interesse = interesse;

    const lead = await models.Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
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

export default router;
