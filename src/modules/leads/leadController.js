/**
 * leadController — endpoints públicos /api/leads/*
 *
 * Multi-tenant: todas as queries usam req.models (DB-per-tenant) + req.tenantId
 * (ADR-001/002). Acesso a recurso de outro tenant retorna 404 (não 403).
 */

import Tenant from '../../models/Tenant.js';
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';
import { transitionStage, convertToCliente, LeadError } from './leadService.js';

// =====================================================================
// Helpers internos
// =====================================================================

const buildSearchFilter = (q) => {
  if (!q) return null;
  // Busca insensível a acentos: usa expressão regex contra `nome`, `telefone` ou `email`.
  // (Para tenants com muitos leads, considerar text index num iteração futura.)
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: [
      { nome: { $regex: safe, $options: 'i' } },
      { telefone: { $regex: safe.replace(/[^\d]/g, '') || safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ],
  };
};

const isLeadsAtivoForTenant = async (tenantId) => {
  const t = await Tenant.findById(tenantId).select('limites.leadsAtivo').lean();
  // undefined (campo ainda não existe no doc) = activo; só false explícito bloqueia
  return t?.limites?.leadsAtivo !== false;
};

// =====================================================================
// Listagem
// =====================================================================

export const listLeads = async (req, res) => {
  try {
    const { Lead } = req.models;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = { tenantId: req.tenantId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.origem) filter.origem = req.query.origem;
    if (req.query.urgencia) filter.urgencia = req.query.urgencia;

    const search = buildSearchFilter(req.query.q);
    if (search) Object.assign(filter, search);

    const [data, total] = await Promise.all([
      Lead.find(filter).sort({ ultimaInteracao: -1, createdAt: -1 }).skip(skip).limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data,
      pagination: { total, page, pages: Math.ceil(total / limit), limit },
    });
  } catch (err) {
    console.error('Erro ao listar leads:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao listar leads.' });
  }
};

// =====================================================================
// Get por id
// =====================================================================

export const getLead = async (req, res) => {
  try {
    const { Lead, Conversa } = req.models;
    const lead = await Lead.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    // Devolve também a Conversa associada (para o detalhe na Phase 5).
    let conversa = null;
    if (lead.conversa) {
      conversa = await Conversa.findOne({ _id: lead.conversa, tenantId: req.tenantId });
    }

    res.status(200).json({ success: true, data: { lead, conversa } });
  } catch (err) {
    console.error('Erro ao buscar lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao buscar lead.' });
  }
};

// =====================================================================
// Criar (manual via UI)
// =====================================================================

export const createLead = async (req, res) => {
  try {
    if (!(await isLeadsAtivoForTenant(req.tenantId))) {
      return res.status(403).json({
        success: false,
        error: 'Funcionalidade de Leads não está activa neste plano.',
        code: 'leads_inactive',
      });
    }

    const { Lead } = req.models;
    const { nome, telefone, email, origem, interesse, urgencia, observacoes } = req.body;

    const existente = await Lead.findOne({ tenantId: req.tenantId, telefone });
    if (existente) {
      return res.status(409).json({
        success: false,
        error: 'Já existe um lead com este telefone neste tenant.',
      });
    }

    const lead = await Lead.create({
      tenantId: req.tenantId,
      nome,
      telefone,
      email,
      origem: origem ?? 'manual',
      interesse,
      urgencia,
      observacoes,
      status: 'novo',
    });

    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Telefone já registado.' });
    }
    console.error('Erro ao criar lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao criar lead.' });
  }
};

// =====================================================================
// Update (PUT — campos básicos)
// =====================================================================

export const updateLead = async (req, res) => {
  try {
    const { Lead } = req.models;
    const fields = {};
    for (const k of ['nome', 'telefone', 'email', 'interesse', 'urgencia', 'observacoes']) {
      if (req.body[k] !== undefined) fields[k] = req.body[k];
    }

    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: fields, ultimaInteracao: new Date() },
      { new: true, runValidators: true },
    );

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    res.status(200).json({ success: true, data: lead });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Telefone já registado.' });
    }
    console.error('Erro ao actualizar lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao actualizar lead.' });
  }
};

// =====================================================================
// Delete
// =====================================================================

export const deleteLead = async (req, res) => {
  try {
    const { Lead } = req.models;
    const lead = await Lead.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    res.status(200).json({ success: true, data: { id: lead._id } });
  } catch (err) {
    console.error('Erro ao eliminar lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao eliminar lead.' });
  }
};

// =====================================================================
// Mover stage (DnD do Kanban)
// =====================================================================

export const moveStage = async (req, res) => {
  try {
    const { Lead } = req.models;
    const lead = await Lead.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    transitionStage({
      lead,
      toStage: req.body.stage,
      motivo: req.body.motivo,
      actor: { role: req.user?.role },
      isInternalCall: false,
    });

    await lead.save();
    res.status(200).json({ success: true, data: lead });
  } catch (err) {
    if (err instanceof LeadError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    console.error('Erro ao mover stage:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao mover stage.' });
  }
};

// =====================================================================
// Reply manual (envia WhatsApp + persiste Mensagem)
// =====================================================================

export const manualReply = async (req, res) => {
  try {
    const { Lead, Conversa } = req.models;
    const lead = await Lead.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    // Resolve a instância do tenant para usar no envio
    const tenant = await Tenant.findById(req.tenantId).select('whatsapp.instanceName').lean();
    const instanceName = tenant?.whatsapp?.instanceName || null;

    const sendResult = await sendWhatsAppMessage(lead.telefone, req.body.mensagem, instanceName);
    if (!sendResult.success) {
      return res.status(502).json({
        success: false,
        error: 'Falha ao enviar mensagem via Evolution API',
        details: sendResult.error,
      });
    }

    // Garante uma Conversa associada (persistência completa de Mensagem
    // entra na Phase 2 via registry — nesta fase só registamos a conversa).
    let conversa = lead.conversa
      ? await Conversa.findOne({ _id: lead.conversa, tenantId: req.tenantId })
      : null;
    if (!conversa) {
      conversa = await Conversa.create({
        tenantId: req.tenantId,
        telefone: lead.telefone,
        estado: 'aguardando_agendamento',
      });
      lead.conversa = conversa._id;
    }

    if (req.body.pausarIa) {
      lead.iaAtiva = false;
    }
    lead.ultimaInteracao = new Date();
    await lead.save();

    res.status(200).json({ success: true, data: { lead, conversa } });
  } catch (err) {
    console.error('Erro ao enviar reply manual:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao enviar reply.' });
  }
};

// =====================================================================
// Convert (Lead → Cliente; passa por checkLimit('maxClientes') no router)
// =====================================================================

export const convertLead = async (req, res) => {
  try {
    const { Lead } = req.models;
    const lead = await Lead.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    const result = await convertToCliente({
      lead,
      models: req.models,
      tenantId: req.tenantId,
      overrides: req.body || {},
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof LeadError) {
      return res.status(err.statusCode).json({ success: false, error: err.message, code: err.code });
    }
    console.error('Erro ao converter lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao converter lead.' });
  }
};

// =====================================================================
// Toggle "pausar IA" no lead
// =====================================================================

export const toggleAi = async (req, res) => {
  try {
    const { Lead } = req.models;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: { iaAtiva: req.body.iaAtiva, ultimaInteracao: new Date() } },
      { new: true },
    );
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    res.status(200).json({ success: true, data: lead });
  } catch (err) {
    console.error('Erro ao alternar IA do lead:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao alternar IA.' });
  }
};
