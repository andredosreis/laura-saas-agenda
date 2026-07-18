/**
 * Canal interno de recados da equipa.
 *
 * Mensagens recebidas do número pessoal configurado do admin nunca entram no
 * agente comercial. São interpretadas como instruções, resolvidas contra
 * contactos do mesmo tenant e encaminhadas em texto.
 */

import * as iaServiceClient from '../../utils/iaServiceClient.js';
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';
import logger from '../../utils/logger.js';
import { telefoneHash } from '../../utils/telefoneHash.js';

const PENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function canonicalPhone(raw) {
  return String(raw || '').replace(/\D/g, '').replace(/^351/, '');
}

function phoneVariants(raw) {
  const base = canonicalPhone(raw);
  return [...new Set([base, `351${base}`])];
}

function normalizeName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-PT')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function nameScore(candidate, hint) {
  const name = normalizeName(candidate);
  const wanted = normalizeName(hint);
  if (!name || !wanted) return 0;
  if (name === wanted) return 3;
  if (` ${name} `.includes(` ${wanted} `)) return 2;
  return 0;
}

function escapeRegex(raw) {
  return String(raw || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accentTolerantToken(raw) {
  const accents = {
    a: '[aáàâãä]',
    c: '[cç]',
    e: '[eéèêë]',
    i: '[iíìîï]',
    n: '[nñ]',
    o: '[oóòôõö]',
    u: '[uúùûü]',
    y: '[yýÿ]',
  };
  return [...String(raw || '')]
    .map((char) => accents[char] || escapeRegex(char))
    .join('');
}

export function isTeamAdminPhone(tenant, telefone) {
  const configured = tenant?.whatsapp?.numeroWhatsapp;
  return Boolean(configured) && canonicalPhone(configured) === canonicalPhone(telefone);
}

async function loadPendingContact(models, tenantId, request) {
  const model = request.contactoTipo === 'cliente' ? models.Cliente : models.Lead;
  if (!model) return null;
  const contact = await model.findOne({ _id: request.contactoId, tenantId })
    .select('_id nome telefone')
    .lean();
  if (!contact?.telefone) return null;
  return {
    type: request.contactoTipo,
    id: contact._id,
    name: contact.nome || request.contactoNome,
    phone: contact.telefone,
    request,
  };
}

function uniquePendingTargets(requests) {
  const seen = new Set();
  return requests.filter((request) => {
    const key = `${request.contactoTipo}:${request.contactoId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function findDirectContacts(models, tenantId, hint) {
  const normalizedHint = normalizeName(hint);
  if (!normalizedHint) return [];
  const pattern = normalizedHint
    .split(/\s+/)
    .map(accentTolerantToken)
    .join("[\\s'’.,-]+");
  const nameRegex = new RegExp(
    `(?:^|[\\s'’.,-])${pattern}(?:$|[\\s'’.,-])`,
    'iu',
  );

  const [clients, leads] = await Promise.all([
    models.Cliente
      ? models.Cliente.find({ tenantId, nome: nameRegex })
          .select('_id nome telefone')
          .limit(6)
          .lean()
      : [],
    models.Lead
      ? models.Lead.find({ tenantId, nome: nameRegex })
          .select('_id nome telefone')
          .limit(6)
          .lean()
      : [],
  ]);

  // O mesmo telefone pode existir como Lead convertido + Cliente. Nesse caso
  // o Cliente é a fonte actual e o duplicado Lead é removido.
  const byPhone = new Map();
  for (const client of clients) {
    if (!client.telefone) continue;
    byPhone.set(canonicalPhone(client.telefone), {
      type: 'cliente',
      id: client._id,
      name: client.nome,
      phone: client.telefone,
      request: null,
    });
  }
  for (const lead of leads) {
    if (!lead.telefone) continue;
    const key = canonicalPhone(lead.telefone);
    if (!byPhone.has(key)) {
      byPhone.set(key, {
        type: 'lead',
        id: lead._id,
        name: lead.nome,
        phone: lead.telefone,
        request: null,
      });
    }
  }
  return [...byPhone.values()];
}

async function resolveRecipient({ models, tenantId, hint, pendingRequests }) {
  const pending = uniquePendingTargets(pendingRequests);

  if (!normalizeName(hint)) {
    if (pending.length !== 1) {
      return { status: pending.length > 1 ? 'ambiguous' : 'not_found' };
    }
    const contact = await loadPendingContact(models, tenantId, pending[0]);
    return contact ? { status: 'found', contact } : { status: 'not_found' };
  }

  const matchingPending = pending
    .filter((request) => nameScore(request.contactoNome, hint) > 0);
  const [pendingContacts, direct] = await Promise.all([
    Promise.all(
      matchingPending.map((request) => loadPendingContact(models, tenantId, request)),
    ),
    findDirectContacts(models, tenantId, hint),
  ]);

  // Compara todos os candidatos em conjunto. Assim um contacto chamado
  // exactamente "Ana" vence um pedido pendente de "Ana Maria"; nenhum pedido
  // recente ganha prioridade suficiente para provocar entrega errada.
  const byPhone = new Map();
  for (const contact of [...pendingContacts.filter(Boolean), ...direct]) {
    const key = canonicalPhone(contact.phone);
    const existing = byPhone.get(key);
    if (!existing || (!existing.request && contact.request)) {
      byPhone.set(key, contact);
    }
  }
  const scored = [...byPhone.values()]
    .map((contact) => ({ contact, score: nameScore(contact.name, hint) }))
    .filter(({ score }) => score > 0);
  if (scored.length === 0) return { status: 'not_found' };
  const bestScore = Math.max(...scored.map(({ score }) => score));
  const best = scored.filter(({ score }) => score === bestScore);
  if (best.length !== 1) return { status: 'ambiguous' };
  return { status: 'found', contact: best[0].contact };
}

async function persistRelayedMessage({ models, tenantId, contact, message }) {
  if (!models?.Conversa || !models?.Mensagem) {
    throw new Error('Modelos de conversa indisponíveis');
  }
  const variants = phoneVariants(contact.phone);
  let conversation = await models.Conversa.findOne({
    tenantId,
    telefone: { $in: variants },
  }).select('_id').lean();
  if (!conversation) {
    conversation = await models.Conversa.create({
      tenantId,
      telefone: contact.phone,
      estado: 'aguardando_agendamento',
    });
  }
  return models.Mensagem.create({
    tenantId,
    telefone: contact.phone,
    mensagem: message,
    origem: 'laura',
    direcao: 'saida',
    geradoPor: 'humano',
    conversa: conversation._id,
    data: new Date(),
  });
}

async function notifyAdmin(adminPhone, message, instanceName) {
  const result = await sendWhatsAppMessage(adminPhone, message, instanceName);
  if (!result?.success) {
    logger.warn(
      { telefone_hash: telefoneHash(adminPhone), instance: instanceName },
      '[team-relay] confirmação ao admin não entregue',
    );
  }
}

/**
 * Processa uma mensagem já convertida para texto (texto original ou áudio
 * transcrito). Este handler é chamado antes do router lead/client.
 */
export async function handleTeamReply({
  models,
  tenantId,
  telefoneNormalizado,
  mensagem,
  messageId,
  instanceName,
}) {
  const since = new Date(Date.now() - PENDING_WINDOW_MS);
  const pendingRequests = models?.PedidoEquipa
    ? await models.PedidoEquipa.find({
        tenantId,
        status: 'pendente',
        notificadoEm: { $gte: since },
        expiresAt: { $gt: new Date() },
      })
        .sort({ notificadoEm: -1 })
        .limit(10)
        .lean()
    : [];

  let interpretation;
  try {
    interpretation = await iaServiceClient.parseTeamReply({
      tenantId,
      message: mensagem,
      pendingRequests: pendingRequests.map((request) => ({
        name: request.contactoNome,
        reason: request.motivo,
      })),
    });
  } catch (err) {
    logger.warn({ err: err.message, tenantId }, '[team-relay] interpretação IA falhou');
    await notifyAdmin(
      telefoneNormalizado,
      'Não consegui interpretar esse recado. Escreve, por exemplo: “Diga à Anabela que vou ligar-lhe”.',
      instanceName,
    );
    return { delivered: false, reason: 'parse_failed' };
  }

  if (
    interpretation?.action !== 'relay'
    || !String(interpretation?.message_to_contact || '').trim()
  ) {
    await notifyAdmin(
      telefoneNormalizado,
      String(
        interpretation?.clarification
        || 'A quem devo enviar o recado e qual é a mensagem?',
      ).slice(0, 500),
      instanceName,
    );
    return { delivered: false, reason: 'clarification_needed' };
  }

  const resolution = await resolveRecipient({
    models,
    tenantId,
    hint: interpretation.recipient_hint,
    pendingRequests,
  });

  if (resolution.status !== 'found') {
    const hint = String(interpretation.recipient_hint || '').trim();
    const response = resolution.status === 'ambiguous'
      ? `Encontrei mais de um contacto para “${hint || 'esse pedido'}”. Indica o nome completo, por favor.`
      : `Não encontrei “${hint || 'o destinatário'}” nos clientes ou leads. Confirma o nome, por favor.`;
    await notifyAdmin(telefoneNormalizado, response, instanceName);
    return { delivered: false, reason: resolution.status };
  }

  const { contact } = resolution;
  if (canonicalPhone(contact.phone) === canonicalPhone(telefoneNormalizado)) {
    await notifyAdmin(
      telefoneNormalizado,
      'O destinatário resolve para o próprio número do admin. O recado não foi enviado.',
      instanceName,
    );
    return { delivered: false, reason: 'self_target' };
  }

  const outgoing = String(interpretation.message_to_contact).trim().slice(0, 1000);
  let persistedMessage;
  try {
    // Persiste ANTES do envio: o Evolution pode devolver o eco `fromMe`
    // enquanto a chamada sendText ainda está em curso. O dedup encontra esta
    // saída e nunca a confunde com uma resposta manual que pausaria a IA.
    persistedMessage = await persistRelayedMessage({
      models,
      tenantId,
      contact,
      message: outgoing,
    });
  } catch (err) {
    logger.error(
      { err: err.message, tenantId, contacto_id: String(contact.id) },
      '[team-relay] persistência preventiva falhou',
    );
    await notifyAdmin(
      telefoneNormalizado,
      `Não consegui preparar o envio para ${contact.name}. O recado não foi enviado; tenta novamente.`,
      instanceName,
    );
    return { delivered: false, reason: 'persist_failed' };
  }

  const sent = await sendWhatsAppMessage(contact.phone, outgoing, instanceName);
  if (!sent?.success) {
    await models.Mensagem.deleteOne({ _id: persistedMessage._id, tenantId }).catch((err) => {
      logger.error(
        { err: err.message, tenantId, message_id: String(persistedMessage._id) },
        '[team-relay] limpeza de saída não entregue falhou',
      );
    });
    // Mantém o pedido pendente: a confirmação ao admin pede para tentar mais
    // tarde, portanto uma nova resposta curta ainda precisa do mesmo contexto.
    await notifyAdmin(
      telefoneNormalizado,
      `Não consegui enviar o recado a ${contact.name}. Tenta novamente dentro de alguns minutos.`,
      instanceName,
    );
    return { delivered: false, reason: 'send_failed' };
  }

  const deliveredAt = new Date();
  if (contact.request && models?.PedidoEquipa) {
    await models.PedidoEquipa.updateOne(
      { _id: contact.request._id, tenantId, status: 'pendente' },
      {
        $set: {
          status: 'entregue',
          respondidoEm: deliveredAt,
          respostaTexto: outgoing,
          respostaMessageId: messageId,
        },
      },
    );
  }

  // Este recado não pausa a IA do contacto: a responsável respondeu ao pedido
  // e devolveu a condução da conversa ao assistente.
  await notifyAdmin(
    telefoneNormalizado,
    `✅ Recado enviado a ${contact.name}.`,
    instanceName,
  );
  logger.info(
    {
      tenant_id: tenantId,
      contacto_tipo: contact.type,
      contacto_id: String(contact.id),
      telefone_hash: telefoneHash(contact.phone),
    },
    'team_relay_delivered',
  );
  return { delivered: true, contactType: contact.type, contactId: String(contact.id) };
}
