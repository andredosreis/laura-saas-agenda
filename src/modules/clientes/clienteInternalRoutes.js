/**
 * Rotas internas de clientes — usadas pelo `ia-service` Python.
 *
 * Autenticadas por X-Service-Token (não JWT).
 * tenantId vem no body ou query, não em req.user.
 *
 * Endpoints:
 *   GET  /:id/agendamentos  — próximos agendamentos do cliente
 *   POST /:id/agendamentos  — criar agendamento para cliente existente
 *   GET  /:id/messages      — histórico de mensagens por telefone
 *   POST /mensagens          — persistir mensagem (in ou out)
 */

import express from 'express';
import mongoose from 'mongoose';
import { requireServiceToken } from '../../middlewares/requireServiceToken.js';
import { getTenantDB } from '../../config/tenantDB.js';
import { getModels } from '../../models/registry.js';
import Tenant from '../../models/Tenant.js';
import { scheduleNotifications } from '../../utils/scheduleNotifications.js';

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
      dataHora: { $gte: new Date() },
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
    console.error('Erro internal GET /clientes/:id/agendamentos:', err);
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

    const dataHora = new Date(dataHoraISO);
    if (Number.isNaN(dataHora.getTime())) {
      return res.status(400).json({ success: false, error: 'dataHoraISO inválido' });
    }
    if (dataHora < new Date()) {
      return res.status(400).json({ success: false, error: 'dataHora no passado' });
    }

    const { models } = await resolveTenantContext(tenantId);

    const cliente = await models.Cliente.findOne({ _id: clienteId, tenantId })
      .select('_id nome telefone')
      .lean();
    if (!cliente) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    const SLOT_MIN = 60;
    const halfMs = (SLOT_MIN * 60 * 1000) - 1;
    const windowStart = new Date(dataHora.getTime() - halfMs);
    const windowEnd = new Date(dataHora.getTime() + halfMs);
    const cancelledStatus = ['Cancelado Pelo Cliente', 'Cancelado Pelo Salão'];
    const conflict = await models.Agendamento.findOne({
      tenantId,
      dataHora: { $gte: windowStart, $lte: windowEnd },
      status: { $nin: cancelledStatus },
    });
    if (conflict) {
      return res.status(409).json({
        success: false,
        error: 'Slot já ocupado por outro agendamento',
        code: 'slot_taken',
      });
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
    }).catch((err) => console.warn('[ia-client-appointment] scheduleNotifications falhou:', err.message));

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
    console.error('Erro internal POST /clientes/:id/agendamentos:', err);
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
    console.error('Erro internal GET /clientes/:id/pacotes:', err);
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
    console.error('Erro ao listar mensagens do cliente:', err);
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
    console.error('Erro ao persistir mensagem (cliente):', err);
    res.status(500).json({ success: false, error: 'Erro interno ao persistir mensagem.' });
  }
});

export default router;
