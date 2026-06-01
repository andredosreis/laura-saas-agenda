/**
 * conversasController — Inbox de Conversas (FDD fdd-conversas-inbox.md).
 *
 * Endpoint consolidado que dá superfície ao que o motor de messaging (ADR-022)
 * já faz: uma vista única de TODAS as conversas WhatsApp (leads + clientes),
 * com handoff humano da IA (pausar/retomar + resposta manual).
 *
 * Princípio nuclear (FDD §2): **um número de telemóvel = uma conversa
 * contínua.** O contacto começa 🌱 Lead e, ao converter, passa 👤 Cliente —
 * a thread é a mesma. Por isso o identificador da conversa é o **telefone
 * canónico** (dígitos, sem o indicativo 351), não um _id de Conversa.
 *
 * Vive em `messaging/` porque lê Lead + Cliente + Conversa + Mensagem em
 * simultâneo — coordenação cross-domain que a ADR-022 reserva ao orquestrador.
 * Os módulos de domínio nunca importam daqui (a dependência é só messaging→domínios).
 *
 * Flag de pausa: mantém-se em `Lead.iaAtiva` / `Cliente.iaAtiva` (já testados
 * e em produção). `Conversa.iaAtiva` fica como consolidação futura — ver FDD §10.
 */

import mongoose from 'mongoose';
import Tenant from '../../../models/Tenant.js';
import { sendWhatsAppMessage } from '../../../utils/evolutionClient.js';
import logger from '../../../utils/logger.js';

// Janela máxima de conversas distintas examinadas por pedido. A "inbox" real
// (telefones que trocaram mensagens) é naturalmente modesta; este tecto evita
// degradação em tenants anómalos. Se for excedido, é registado (sem corte
// silencioso — ver `.claude/rules` / regra "no silent caps").
const SCAN_CAP = 500;

/**
 * Forma canónica de um telefone: só dígitos, sem o indicativo 351 à cabeça
 * (PT). Usado como chave de agrupamento — "um número = uma conversa".
 */
function canonicalPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.replace(/^351/, '');
}

/** Variantes de um telefone canónico, para casar entradas guardadas em formatos diferentes. */
function phoneVariants(canon) {
  const base = canonicalPhone(canon);
  return [...new Set([base, `351${base}`])];
}

/**
 * Resolve o contacto (Cliente tem prioridade sobre Lead — "Client wins",
 * igual ao router F12 §6.2) por variantes de telefone.
 * @returns {Promise<{ tipo: 'cliente'|'lead', doc: object } | null>}
 */
async function resolveContact(models, tenantId, variants) {
  const [cliente, lead] = await Promise.all([
    models.Cliente
      ? models.Cliente.findOne({ tenantId, telefone: { $in: variants } })
          .select('_id nome telefone iaAtiva')
          .lean()
      : null,
    models.Lead
      ? models.Lead.findOne({ tenantId, telefone: { $in: variants } })
          .select('_id nome telefone iaAtiva status')
          .lean()
      : null,
  ]);
  if (cliente) return { tipo: 'cliente', doc: cliente };
  if (lead) return { tipo: 'lead', doc: lead };
  return null;
}

/**
 * GET /conversas
 *
 * Lista consolidada de conversas (leads + clientes) ordenada por última
 * interacção desc. Filtro opcional `?tipo=todas|leads|clientes`. Paginação ≤100.
 *
 * Resposta (contrato fixo):
 *   { success, data: [ { telefone, tipo, contactoId, nome, iaAtiva, estado,
 *     ultimaMensagem, ultimaData, ultimaDirecao, naoLidas } ], pagination }
 */
export const listConversas = async (req, res) => {
  try {
    const { Mensagem, Cliente, Lead } = req.models;
    const tenantOid = new mongoose.Types.ObjectId(req.tenantId);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
    const tipo = ['leads', 'clientes'].includes(req.query.tipo) ? req.query.tipo : 'todas';

    // ── 1) Spine: telefones distintos com actividade, do mais recente ────
    const agg = await Mensagem.aggregate([
      { $match: { tenantId: tenantOid } },
      { $sort: { data: 1 } },
      {
        $group: {
          _id: '$telefone',
          ultimaMensagem: { $last: '$mensagem' },
          ultimaData: { $last: '$data' },
          ultimaDirecao: { $last: '$direcao' },
          ultimaSaida: {
            $max: { $cond: [{ $eq: ['$direcao', 'saida'] }, '$data', null] },
          },
          entradas: {
            $push: { $cond: [{ $eq: ['$direcao', 'entrada'] }, '$data', '$$REMOVE'] },
          },
        },
      },
      { $sort: { ultimaData: -1 } },
      { $limit: SCAN_CAP },
    ]);

    if (agg.length >= SCAN_CAP) {
      logger.warn(
        { tenant_id: req.tenantId, scanned: agg.length, cap: SCAN_CAP },
        '[conversas] SCAN_CAP atingido — conversas mais antigas omitidas da listagem',
      );
    }

    // ── 2) Merge por telefone canónico ("um número = uma conversa") ──────
    const byCanon = new Map();
    for (const row of agg) {
      const canon = canonicalPhone(row._id);
      const cur = byCanon.get(canon);
      if (cur) cur.rows.push(row);
      else byCanon.set(canon, { canon, rows: [row] });
    }

    const merged = [...byCanon.values()].map(({ canon, rows }) => {
      // Linha mais recente decide a última mensagem/direcção.
      const latest = rows.reduce((a, b) =>
        new Date(b.ultimaData) > new Date(a.ultimaData) ? b : a,
      );
      const maxSaida = rows
        .map((r) => r.ultimaSaida)
        .filter(Boolean)
        .map((d) => new Date(d).getTime());
      const saidaCut = maxSaida.length ? Math.max(...maxSaida) : null;
      const naoLidas = rows
        .flatMap((r) => r.entradas || [])
        .filter((d) => saidaCut === null || new Date(d).getTime() > saidaCut)
        .length;
      return {
        telefone: canon,
        ultimaMensagem: latest.ultimaMensagem || '',
        ultimaData: latest.ultimaData,
        ultimaDirecao: latest.ultimaDirecao || 'entrada',
        naoLidas,
      };
    });

    // ── 3) Enriquecer com Cliente/Lead (batch, por variantes) ────────────
    const allVariants = [...new Set(merged.flatMap((m) => phoneVariants(m.telefone)))];
    const [clientes, leads] = await Promise.all([
      Cliente
        ? Cliente.find({ tenantId: tenantOid, telefone: { $in: allVariants } })
            .select('_id nome telefone iaAtiva')
            .lean()
        : [],
      Lead
        ? Lead.find({ tenantId: tenantOid, telefone: { $in: allVariants } })
            .select('_id nome telefone iaAtiva status')
            .lean()
        : [],
    ]);

    const clienteByCanon = new Map(clientes.map((c) => [canonicalPhone(c.telefone), c]));
    const leadByCanon = new Map(leads.map((l) => [canonicalPhone(l.telefone), l]));

    let items = merged.map((m) => {
      const cliente = clienteByCanon.get(m.telefone);
      const lead = leadByCanon.get(m.telefone);
      // Cliente vence (igual ao router F12).
      if (cliente) {
        return {
          ...m,
          tipo: 'cliente',
          contactoId: String(cliente._id),
          nome: cliente.nome || 'Cliente',
          iaAtiva: cliente.iaAtiva !== false,
          estado: null,
        };
      }
      if (lead) {
        return {
          ...m,
          tipo: 'lead',
          contactoId: String(lead._id),
          nome: lead.nome || 'Lead sem nome',
          iaAtiva: lead.iaAtiva !== false,
          estado: lead.status || null,
        };
      }
      // Conversa sem contacto associado (raro) — ainda assim mostrável.
      return { ...m, tipo: 'lead', contactoId: null, nome: 'Desconhecido', iaAtiva: true, estado: null };
    });

    // ── 4) Filtro por tipo + paginação ───────────────────────────────────
    if (tipo === 'leads') items = items.filter((i) => i.tipo === 'lead');
    else if (tipo === 'clientes') items = items.filter((i) => i.tipo === 'cliente');

    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    return res.json({
      success: true,
      data: pageItems,
      pagination: { total, page, pages, limit },
    });
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, '[conversas] listConversas falhou');
    return res.status(500).json({ success: false, error: 'Erro interno ao listar conversas' });
  }
};

/**
 * GET /conversas/:telefone/mensagens
 *
 * Thread paginada de uma conversa, ordem cronológica (mais antiga primeiro)
 * dentro da página. `page`/`limit` (≤100, default 50).
 */
export const getConversaMensagens = async (req, res) => {
  try {
    const { Mensagem } = req.models;
    const tenantOid = new mongoose.Types.ObjectId(req.tenantId);
    const variants = phoneVariants(req.params.telefone);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;

    const filtro = { tenantId: tenantOid, telefone: { $in: variants } };
    const [recent, total] = await Promise.all([
      Mensagem.find(filtro)
        .sort({ data: -1 })
        .skip(skip)
        .limit(limit)
        .select('mensagem origem direcao geradoPor data')
        .lean(),
      Mensagem.countDocuments(filtro),
    ]);

    // Oldest-first para a UI mostrar em ordem cronológica.
    const messages = recent.reverse();
    const pages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      success: true,
      data: messages,
      pagination: { total, page, pages, limit },
    });
  } catch (err) {
    logger.error({ err: err.message }, '[conversas] getConversaMensagens falhou');
    return res.status(500).json({ success: false, error: 'Erro interno ao carregar mensagens' });
  }
};

/**
 * POST /conversas/:telefone/reply
 *
 * Resposta manual (handoff humano). Envia via Evolution, persiste a Mensagem
 * outbound com `geradoPor='humano'`, garante a Conversa e, opcionalmente,
 * pausa a IA do contacto (`pausarIa`).
 */
export const replyConversa = async (req, res) => {
  try {
    const { Mensagem, Conversa } = req.models;
    const tenantOid = new mongoose.Types.ObjectId(req.tenantId);
    const variants = phoneVariants(req.params.telefone);

    const mensagem = String(req.body.mensagem || '').trim();
    if (!mensagem) {
      return res.status(400).json({ success: false, error: 'Mensagem é obrigatória' });
    }
    const pausarIa = req.body.pausarIa === true;

    // Resolve o contacto para escolher o telefone de envio + pausar a IA certa.
    const contact = await resolveContact(req.models, tenantOid, variants);
    const destino = contact?.doc?.telefone || `351${canonicalPhone(req.params.telefone)}`;

    // Instância Evolution do tenant.
    const tenant = await Tenant.findById(req.tenantId).select('whatsapp.instanceName').lean();
    const instanceName = tenant?.whatsapp?.instanceName || null;

    const sendResult = await sendWhatsAppMessage(destino, mensagem, instanceName);
    if (!sendResult.success) {
      return res.status(502).json({
        success: false,
        error: 'Falha ao enviar mensagem via Evolution API',
        details: sendResult.error,
      });
    }

    // Garante a Conversa (thread) por telefone.
    let conversa = await Conversa.findOne({ tenantId: tenantOid, telefone: { $in: variants } });
    if (!conversa) {
      conversa = await Conversa.create({
        tenantId: tenantOid,
        telefone: canonicalPhone(req.params.telefone),
        estado: 'aguardando_agendamento',
      });
    }

    await Mensagem.create({
      tenantId: tenantOid,
      telefone: canonicalPhone(req.params.telefone),
      mensagem,
      origem: 'laura',
      direcao: 'saida',
      geradoPor: 'humano',
      conversa: conversa._id,
    });

    // Pausa a IA, se pedido (no Cliente e/ou Lead que casarem o telefone).
    let iaAtiva = contact ? contact.doc.iaAtiva !== false : true;
    if (pausarIa) {
      await pauseContactsByPhone(req.models, tenantOid, variants, false);
      iaAtiva = false;
    }

    return res.status(200).json({
      success: true,
      data: { telefone: canonicalPhone(req.params.telefone), iaAtiva, enviado: true },
    });
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, '[conversas] replyConversa falhou');
    return res.status(500).json({ success: false, error: 'Erro interno ao enviar resposta' });
  }
};

/**
 * POST /conversas/:telefone/pause-ai
 *
 * Liga/desliga a IA para o contacto (handoff humano). Aplica a flag ao
 * Cliente e/ou Lead que casarem o telefone.
 */
export const pauseConversaIa = async (req, res) => {
  try {
    const tenantOid = new mongoose.Types.ObjectId(req.tenantId);
    const variants = phoneVariants(req.params.telefone);
    const ativa = req.body.ativa === true;

    const matched = await pauseContactsByPhone(req.models, tenantOid, variants, ativa);
    if (!matched) {
      return res.status(404).json({ success: false, error: 'Conversa não encontrada' });
    }

    return res.status(200).json({
      success: true,
      data: { telefone: canonicalPhone(req.params.telefone), iaAtiva: ativa },
    });
  } catch (err) {
    logger.error({ err: err.message }, '[conversas] pauseConversaIa falhou');
    return res.status(500).json({ success: false, error: 'Erro interno ao alternar IA' });
  }
};

/**
 * Define `iaAtiva` no Cliente e/ou Lead que casarem as variantes do telefone.
 * @returns {Promise<boolean>} true se algum documento foi actualizado.
 */
async function pauseContactsByPhone(models, tenantOid, variants, ativa) {
  const ops = [];
  if (models.Cliente) {
    ops.push(
      models.Cliente.updateMany(
        { tenantId: tenantOid, telefone: { $in: variants } },
        { $set: { iaAtiva: ativa } },
      ),
    );
  }
  if (models.Lead) {
    ops.push(
      models.Lead.updateMany(
        { tenantId: tenantOid, telefone: { $in: variants } },
        { $set: { iaAtiva: ativa, ultimaInteracao: new Date() } },
      ),
    );
  }
  const results = await Promise.all(ops);
  return results.some((r) => (r?.matchedCount ?? r?.n ?? 0) > 0);
}
