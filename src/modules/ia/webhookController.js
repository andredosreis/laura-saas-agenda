import Tenant from '../../models/Tenant.js';
import { getTenantDB } from '../../config/tenantDB.js';
import { getModels } from '../../models/registry.js';
import { sendWhatsAppMessage } from '../../utils/evolutionClient.js';
import { markMessageSeen } from '../../utils/webhookDedupe.js';
import { DateTime } from 'luxon';
import * as iaServiceClient from '../../utils/iaServiceClient.js';

/**
 * Resolve tenant a partir do nome da instância Evolution (`req.body.instance`).
 * Lookup O(1) via índice unique sparse em `whatsapp.instanceName`.
 * Esta é a via preferida desde a Phase 0 do módulo de Leads (1 Evolution per tenant).
 *
 * Exportado para permitir testes unitários e reutilização noutros pontos do
 * fluxo (Phase 1: criação de leads; Phase 2: gateway para o `ia-service`).
 *
 * @param {string} instanceName  valor de `req.body.instance` do payload Evolution
 * @returns {{ tenant, models, tenantId } | null}
 */
export async function resolveTenantByInstance(instanceName) {
  if (!instanceName || typeof instanceName !== 'string') return null;

  const tenant = await Tenant.findOne({
    'whatsapp.instanceName': instanceName.trim().toLowerCase(),
    'plano.status': { $in: ['ativo', 'trial'] },
  }).lean();

  if (!tenant) return null;

  const db = getTenantDB(tenant._id.toString());
  const models = getModels(db);
  return { tenant, models, tenantId: tenant._id.toString() };
}

/**
 * Resolve tenant-specific models by searching across all tenant databases.
 * Tries to find a client matching the given phone variants in each tenant DB.
 *
 * Legacy fallback usado quando a instância partilhada `marcai` envia o webhook
 * sem `instance` resolvível por tenant. Será removido depois da migração total
 * para 1 Evolution per tenant (ADR-021).
 *
 * @returns {{ models, tenantId, cliente } | null}
 */
async function resolveClienteTenant(telefoneVariants) {
  const tenants = await Tenant.find({ 'plano.status': { $in: ['ativo', 'trial'] } }).lean();

  for (const tenant of tenants) {
    const db = getTenantDB(tenant._id.toString());
    const models = getModels(db);

    const cliente = await models.Cliente.findOne({ telefone: { $in: telefoneVariants } });
    if (cliente) {
      return { models, tenantId: tenant._id.toString(), cliente };
    }
  }

  return null;
}

/**
 * Resolve tenant-specific models by searching for a lead agendamento
 * across all tenant databases.
 *
 * @returns {{ models, tenantId, agendamento } | null}
 */
async function resolveLeadTenant(telefoneVariants, janelaQuery) {
  const tenants = await Tenant.find({ 'plano.status': { $in: ['ativo', 'trial'] } }).lean();

  for (const tenant of tenants) {
    const db = getTenantDB(tenant._id.toString());
    const models = getModels(db);

    const agendamento = await models.Agendamento.findOne({
      tipo: 'Avaliacao',
      'lead.telefone': { $in: telefoneVariants },
      'confirmacao.tipo': 'pendente',
      dataHora: janelaQuery,
    }).sort({ dataHora: 1 });

    if (agendamento) {
      return { models, tenantId: tenant._id.toString(), agendamento };
    }
  }

  return null;
}

/**
 * @description Webhook para processar confirmações de agendamento via WhatsApp
 * Responde a mensagens "SIM", "NÃO", "CONFIRMO", "CANCELAR", etc
 */
export const processarConfirmacaoWhatsapp = async (req, res) => {
  try {
    console.log('[Webhook] 📥 Recebido:', JSON.stringify(req.body, null, 2));

    // 🔍 VALIDAÇÃO 1: Só processa evento MESSAGES_UPSERT
    if (req.body.event !== 'messages.upsert') {
      return res.status(200).json({ message: 'Evento ignorado' });
    }

    const msgData = req.body.data;

    // 🔍 VALIDAÇÃO 2: Ignora mensagens de grupo (@g.us) e reações
    const remoteJidRaw = msgData?.key?.remoteJid || '';
    if (remoteJidRaw.endsWith('@g.us') || msgData?.messageType === 'reactionMessage') {
      return res.status(200).json({ message: 'Grupo ou reação ignorada' });
    }

    // 🔍 VALIDAÇÃO 3: Ignora mensagens enviadas pelo próprio salão (fromMe: true)
    if (msgData?.key?.fromMe === true) {
      console.log('[Webhook] ⏭️ Ignorando mensagem enviada pelo salão (fromMe: true)');
      return res.status(200).json({ message: 'Mensagem do salão ignorada' });
    }

    // 🔍 VALIDAÇÃO 3: Verifica timestamp (só processa mensagens dos últimos 5 minutos)
    const timestampMensagem = (msgData?.messageTimestamp || 0) * 1000 || Date.now();
    const idadeMensagem = Date.now() - timestampMensagem;
    const CINCO_MINUTOS = 5 * 60 * 1000;

    if (idadeMensagem > CINCO_MINUTOS) {
      console.log(`[Webhook] ⏭️ Mensagem antiga (${Math.round(idadeMensagem / 1000)}s) - ignorando`);
      return res.status(200).json({ message: 'Mensagem antiga ignorada' });
    }

    // 🔍 VALIDAÇÃO 4.5: Anti-replay (idempotência via messageId)
    // Evolution API pode reenviar mensagens em retry/reconexão.
    // Atomic check via ProcessedMessage unique index — duplicates são silently skip.
    const messageId = msgData?.key?.id;
    const isNew = await markMessageSeen(messageId);
    if (!isNew) {
      console.log(`[Webhook] ⏭️ Mensagem duplicada (replay) ignorada: ${messageId}`);
      return res.status(200).json({ message: 'Mensagem duplicada ignorada' });
    }

    // Extrai dados do payload Evolution API
    const remoteJid = msgData?.key?.remoteJid || '';

    // Fallback defensivo para @lid (versão 1.x da Evolution API ou erro temporário)
    if (remoteJid.endsWith('@lid')) {
      console.warn('[Webhook] ⚠️ Recebido @lid em vez do JID real. Ignorando mensagem.', { remoteJid });
      return res.status(200).json({ message: 'LID ignorado, aguardando resolução' });
    }

    const telefone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const mensagem = msgData?.message?.conversation
      || msgData?.message?.extendedTextMessage?.text
      || '';

    if (!telefone || !mensagem) {
      console.warn('[Webhook] ⚠️ Dados incompletos:', { telefone, mensagem });
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    // Normaliza telefone (remove caracteres especiais)
    const telefoneNormalizado = telefone.replace(/[^\d]/g, '');

    // Normaliza mensagem (lowercase, remove acentos e espaços)
    const mensagemNormalizada = mensagem
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    console.log(`[Webhook] 📱 Telefone: ${telefoneNormalizado}, Mensagem: "${mensagemNormalizada}"`);

    // 🔍 ROTEAMENTO INTELIGENTE: Detecta se é confirmação (SIM/NÃO) ou conversa normal
    // Nota: mensagemNormalizada já está em lowercase sem acentos (ex: "Não" → "nao")
    const PALAVRAS_SIM = [
      'sim', 's',
      'confirmo', 'confirmar', 'confirma', 'confirmado',
      'ok', 'okay',
      'certo', 'correto', 'exato', 'exatamente',
      'claro', 'com certeza', 'certeza',
      'perfeito', 'combinado',
      'pode', 'pode ser',
      'beleza', 'boa',
      'ta bom', 'ta bem', 'tudo bem', 'tudo certo',
      'yes', '1',
    ];
    const PALAVRAS_NAO = [
      'nao', 'n',
      'cancelar', 'cancela', 'cancel', 'cancelado',
      'desmarcar', 'desmarco', 'desmarque',
      'nao posso', 'nao consigo', 'nao vou',
      'nao quero',
      'desistir', 'desisto',
      'remover',
      'nope', 'no',
      '2',
    ];

    const ehSim = PALAVRAS_SIM.some(p =>
      mensagemNormalizada === p || mensagemNormalizada.startsWith(p + ' ')
    );
    const ehNao = PALAVRAS_NAO.some(p =>
      mensagemNormalizada === p || mensagemNormalizada.startsWith(p + ' ')
    );
    const ehRespostaConfirmacao = ehSim || ehNao;

    // Captura instanceName antes do routing (necessário para ia-service path — ADR-021)
    const instanceName = req.body?.instance ? String(req.body.instance) : null;

    if (!ehRespostaConfirmacao) {
      // ACK imediato — processamento async (ia-service ou fallback)
      res.status(200).json({ success: true, message: 'Mensagem aceite, a processar' });

      processarMensagemLeadAsync({
        telefoneNormalizado,
        mensagem,
        messageId,
        timestampMensagem,
        instanceName,
      }).catch(err => {
        console.error('[Webhook] ❌ Erro processarMensagemLeadAsync:', err);
      });

      return;
    }

    // ✅ É uma resposta de confirmação (SIM/NÃO) → ACK rápido + processa async
    console.log(`[Webhook] ✅ Detectado resposta de confirmação: "${mensagem}"`);

    // ACK FAST: Evolution recebe 200 em ~50ms, evita timeout/retry.
    // O processamento real (resolveCliente, sendWhatsAppMessage, etc.) corre em background.
    res.status(200).json({ success: true, message: 'Mensagem aceite, processando' });

    // Fire-and-forget. Erros são logged (Sentry captura automaticamente).
    processarConfirmacaoAsync({ telefoneNormalizado, mensagem, ehSim, ehNao, instanceName })
      .catch(err => {
        console.error('[Webhook] ❌ Erro async ao processar confirmação:', err);
      });

  } catch (error) {
    console.error('[Webhook] ❌ Erro síncrono ao processar webhook:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

/**
 * Processamento assíncrono da confirmação WhatsApp.
 * Chamado fire-and-forget após ack 200 ao Evolution.
 * Sem req/res — toda a comunicação ao cliente é via sendWhatsAppMessage.
 *
 * @param {object}  ctx
 * @param {string}  ctx.telefoneNormalizado
 * @param {string}  ctx.mensagem
 * @param {boolean} ctx.ehSim
 * @param {boolean} ctx.ehNao
 * @param {string|null} [ctx.instanceName]  nome da instância Evolution; quando presente,
 *                                          permite resolução O(1) do tenant via
 *                                          índice `whatsapp.instanceName` (ADR-021).
 *                                          Sem isto, cai no scan global legacy com warning.
 */
async function processarConfirmacaoAsync({ telefoneNormalizado, mensagem, ehSim, ehNao, instanceName = null }) {
  // Busca cliente pelo telefone (tenant-aware)
  const telefoneVariants = [
    telefoneNormalizado,
    `351${telefoneNormalizado}`,
    telefoneNormalizado.replace(/^351/, '')
  ];

  // Janela de tempo: próximas 48h ou últimas 2h (para respostas tardias)
  const agora = DateTime.now().setZone('Europe/Lisbon');
  const duasHorasAtras = agora.minus({ hours: 2 });
  const doisDias = agora.plus({ days: 2 });
  const janelaQuery = { $gte: duasHorasAtras.toJSDate(), $lte: doisDias.toJSDate() };

  let agendamento = null;
  let nomeRemetente = null;
  let instanceForResponse = instanceName; // usada ao enviar resposta

  // Caminho preferido (ADR-021): resolução directa via instance → 1 query indexada
  const tenantByInstance = await resolveTenantByInstance(instanceName);

  if (tenantByInstance) {
    const { models, tenant } = tenantByInstance;
    instanceForResponse = tenant?.whatsapp?.instanceName || instanceForResponse;

    const cliente = await models.Cliente.findOne({ telefone: { $in: telefoneVariants } });
    if (cliente) {
      console.log(`[Webhook] ✅ Cliente encontrado via instance "${instanceName}": ${cliente.nome}`);
      agendamento = await models.Agendamento.findOne({
        cliente: cliente._id,
        'confirmacao.tipo': 'pendente',
        dataHora: janelaQuery,
      }).sort({ dataHora: 1 });
      nomeRemetente = cliente.nome;
    }

    if (!agendamento) {
      agendamento = await models.Agendamento.findOne({
        tipo: 'Avaliacao',
        'lead.telefone': { $in: telefoneVariants },
        'confirmacao.tipo': 'pendente',
        dataHora: janelaQuery,
      }).sort({ dataHora: 1 });
      if (agendamento) {
        nomeRemetente = agendamento.lead?.nome || nomeRemetente;
        console.log(`[Webhook] ✅ Lead Avaliação encontrado via instance "${instanceName}": ${nomeRemetente}`);
      }
    }
  } else {
    // Fallback legacy: instance ausente, desconhecida ou tenant sem `whatsapp.instanceName`
    // configurado. Avisa e cai no scan global enquanto a migração não está completa.
    console.warn(`[Webhook] ⚠️ legacy_evolution_routing: instance="${instanceName ?? '(none)'}" sem tenant correspondente — fallback scan`);

    const clienteResult = await resolveClienteTenant(telefoneVariants);

    if (clienteResult) {
      const { models, cliente } = clienteResult;
      console.log(`[Webhook] ✅ Cliente encontrado (scan legacy): ${cliente.nome} (${cliente._id})`);
      agendamento = await models.Agendamento.findOne({
        cliente: cliente._id,
        'confirmacao.tipo': 'pendente',
        dataHora: janelaQuery,
      }).sort({ dataHora: 1 });
      nomeRemetente = cliente.nome;
    }

    if (!agendamento) {
      const leadResult = await resolveLeadTenant(telefoneVariants, janelaQuery);
      if (leadResult) {
        agendamento = leadResult.agendamento;
        nomeRemetente = agendamento.lead.nome;
        console.log(`[Webhook] ✅ Lead encontrado (scan legacy): ${nomeRemetente}`);
      }
    }
  }

  if (!agendamento) {
    console.warn(`[Webhook] ⚠️ Nenhum agendamento pendente para ${telefoneNormalizado} - delegando para IA`);
    return await delegarParaIAAsync(telefoneNormalizado, instanceForResponse);
  }

  // Processa resposta
  let resposta = '';
  let novoStatus = '';

  // Respostas positivas
  if (ehSim) {
    agendamento.confirmacao.tipo = 'confirmado';
    agendamento.confirmacao.respondidoEm = new Date();
    agendamento.confirmacao.respondidoPor = 'cliente';
    agendamento.status = 'Confirmado';
    agendamento.markModified('confirmacao');
    novoStatus = 'confirmado';

    const dataFormatada = DateTime.fromJSDate(agendamento.dataHora)
      .setZone('Europe/Lisbon')
      .toFormat("dd/MM/yyyy 'às' HH:mm");

    resposta = `✅ Obrigada pela confirmação, ${nomeRemetente}! A sua sessão está marcada para ${dataFormatada}. Até breve! 💆‍♀️✨`;
  }
  // Respostas negativas
  else if (ehNao) {
    agendamento.confirmacao.tipo = 'rejeitado';
    agendamento.confirmacao.respondidoEm = new Date();
    agendamento.confirmacao.respondidoPor = 'cliente';
    agendamento.status = 'Cancelado Pelo Cliente';
    agendamento.markModified('confirmacao');
    novoStatus = 'rejeitado';

    resposta = `Entendido, ${nomeRemetente}. 📅\n\nPara reagendarmos, indique por favor o dia e hora que prefere e iremos analisar a nossa agenda para lhe propor a melhor opção.\n\nObrigada! 💆‍♀️✨`;
  }
  // Resposta não reconhecida
  else {
    console.warn(`[Webhook] ⚠️ Resposta não reconhecida: "${mensagem}"`);

    const dataFormatada = DateTime.fromJSDate(agendamento.dataHora)
      .setZone('Europe/Lisbon')
      .toFormat("dd/MM/yyyy 'às' HH:mm");

    resposta = `Olá ${nomeRemetente}! 👋\n\nNão consegui entender sua resposta. Você tem um agendamento marcado para ${dataFormatada}.\n\nPor favor, responda:\n✅ *SIM* - para confirmar\n❌ *NÃO* - para cancelar`;

    // Tenta resolver instance do tenant proprietário do agendamento (caminho legacy → preferido)
    const outboundInstance = await resolveOutboundInstance(agendamento.tenantId, instanceForResponse);
    await sendWhatsAppMessage(telefoneNormalizado, resposta, outboundInstance);
    return;
  }

  // Salva agendamento
  await agendamento.save();
  console.log(`[Webhook] ✅ Agendamento ${novoStatus}: ${agendamento._id}`);

  // Resolve a instância correcta para o envio de saída (prefere a do tenant proprietário)
  const outboundInstance = await resolveOutboundInstance(agendamento.tenantId, instanceForResponse);

  // Envia resposta ao cliente/lead
  await sendWhatsAppMessage(telefoneNormalizado, resposta, outboundInstance);

  // Notifica admin sobre a resposta do cliente
  const tenant = await Tenant.findById(agendamento.tenantId).lean();
  const numeroAdmin = tenant?.whatsapp?.numeroWhatsapp || tenant?.contato?.telefone;
  if (numeroAdmin) {
    const dataFormatadaAdmin = DateTime.fromJSDate(agendamento.dataHora)
      .setZone('Europe/Lisbon')
      .toFormat('HH:mm');

    const msgAdmin = novoStatus === 'confirmado'
      ? `✅ *Agendamento Confirmado*\n\nOlá, Administrador!\n\n*${nomeRemetente}* confirmou a sessão das *${dataFormatadaAdmin}* de hoje.`
      : `❌ *Agendamento Cancelado*\n\nOlá, Administrador!\n\n*${nomeRemetente}* cancelou a sessão das *${dataFormatadaAdmin}* de hoje.`;

    await sendWhatsAppMessage(numeroAdmin, msgAdmin, outboundInstance);
  }
}

/**
 * Resolve a instância Evolution correcta para envio de mensagem outbound.
 * Prefere `currentInstance` (já resolvida no fluxo); senão tenta o `instanceName`
 * configurado no tenant proprietário; senão devolve `null` (cai no env default).
 *
 * @param {import('mongoose').ObjectId|string} tenantId
 * @param {string|null} currentInstance
 * @returns {Promise<string|null>}
 */
async function resolveOutboundInstance(tenantId, currentInstance) {
  if (currentInstance) return currentInstance;
  if (!tenantId) return null;
  try {
    const t = await Tenant.findById(tenantId).select('whatsapp.instanceName').lean();
    return t?.whatsapp?.instanceName || null;
  } catch {
    return null;
  }
}

/**
 * Processamento assíncrono de mensagens de lead (não-confirmação).
 * Se ia-service disponível + leadsAtivo → delega para Python.
 * Fallback: delegarParaIAAsync (saudação genérica local).
 */
async function processarMensagemLeadAsync({ telefoneNormalizado, mensagem, messageId, timestampMensagem, instanceName }) {
  const IA_SERVICE_ENABLED = process.env.IA_SERVICE_ENABLED !== 'false' && Boolean(process.env.IA_SERVICE_URL);

  // Resolve tenant (O(1) via instance, ou null se legacy)
  const tenantCtx = await resolveTenantByInstance(instanceName);
  const leadsAtivo = tenantCtx?.tenant?.limites?.leadsAtivo !== false;

  if (!IA_SERVICE_ENABLED || !leadsAtivo) {
    console.log(`[Webhook] ℹ️ ia-service desabilitado ou leadsAtivo=false — delegarParaIAAsync`);
    return delegarParaIAAsync(telefoneNormalizado, instanceName);
  }

  // Verifica se já existe lead para este telefone neste tenant
  let leadId = null;
  let clienteId = null;
  if (tenantCtx) {
    const telefoneVariants = [
      telefoneNormalizado,
      `351${telefoneNormalizado}`,
      telefoneNormalizado.replace(/^351/, ''),
    ];
    const lead = await tenantCtx.models.Lead?.findOne({
      tenantId: tenantCtx.tenantId,
      telefone: { $in: telefoneVariants },
    }).select('_id').lean();
    if (lead) leadId = lead._id.toString();

    const cliente = await tenantCtx.models.Cliente?.findOne({
      tenantId: tenantCtx.tenantId,
      telefone: { $in: telefoneVariants },
    }).select('_id').lean();
    if (cliente) clienteId = cliente._id.toString();
  }

  try {
    await iaServiceClient.processLead({
      tenantId: tenantCtx?.tenantId ?? null,
      instanceName,
      telefone: telefoneNormalizado,
      mensagem,
      messageId,
      timestamp: new Date(timestampMensagem).toISOString(),
      clienteId,
      leadId,
    });
    console.log(`[Webhook] ✅ Mensagem delegada ao ia-service — lead ${leadId ?? 'novo'}`);
  } catch (err) {
    console.error('[Webhook] ❌ ia_service_unreachable — fallback delegarParaIAAsync:', err.message);
    // Sentry captura automaticamente via integração global
    return delegarParaIAAsync(telefoneNormalizado, instanceName);
  }
}

/**
 * 🤖 Resposta automática simples (SEM IA) — versão assíncrona
 * Envia mensagem de saudação e notifica Laura
 * IMPORTANTE: Responde APENAS UMA VEZ, nunca mais interage.
 * Sem req/res — chamada por processarConfirmacaoAsync após ack 200 ao Evolution.
 *
 * @param {string} telefoneNormalizado
 * @param {string|null} [instanceName]  instância Evolution preferida; null cai no env default
 */
async function delegarParaIAAsync(telefoneNormalizado, instanceName = null) {
  try {
    console.log('[Webhook] 📝 Processando mensagem não-confirmação (resposta automática simples)');

    if (!telefoneNormalizado) {
      console.warn('[Webhook] ⚠️ delegarParaIAAsync chamado sem telefone — abortando');
      return;
    }

    const telefoneVariants = [
      telefoneNormalizado,
      `351${telefoneNormalizado}`,
      telefoneNormalizado.replace(/^351/, '')
    ];

    // Caminho preferido: instance → tenant directo. Senão, scan legacy.
    let cliente = null;
    const tenantByInstance = await resolveTenantByInstance(instanceName);
    if (tenantByInstance) {
      cliente = await tenantByInstance.models.Cliente.findOne({ telefone: { $in: telefoneVariants } });
    } else {
      const clienteResult = await resolveClienteTenant(telefoneVariants);
      cliente = clienteResult?.cliente || null;
    }

    // Se cliente já existe E já tem etapaConversa definida, significa que já respondemos antes
    // Neste caso, NÃO respondemos novamente (Laura vai tratar manualmente)
    if (cliente && cliente.etapaConversa) {
      console.log(`[Webhook] ⏭️ Cliente ${cliente.nome} já recebeu mensagem automática - ignorando`);
      return;
    }

    // Determina saudação baseada no horário (timezone Europe/Lisbon)
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const hora = agora.hour;

    let saudacao;
    if (hora >= 6 && hora < 12) {
      saudacao = 'Bom dia';
    } else if (hora >= 12 && hora < 19) {
      saudacao = 'Boa tarde';
    } else {
      saudacao = 'Boa noite';
    }

    // Mensagem automática ÚNICA
    const mensagemAutomatica = `${saudacao}! 👋

Tudo bem? Sou um assistente virtual da *Laura*.

Em breve ela entrará em contato para mais informações. 💆‍♀️✨

_La Estética Avançada_`;

    // Envia mensagem (usa instance preferida do tenant, se disponível)
    await sendWhatsAppMessage(telefoneNormalizado, mensagemAutomatica, instanceName);
    console.log(`[Webhook] ✅ Mensagem automática enviada (${saudacao})`);

    // Marca que já respondemos (para não responder novamente)
    if (cliente) {
      cliente.etapaConversa = 'aguardando_laura';
      await cliente.save();
      console.log(`[Webhook] 📝 Cliente ${cliente.nome} marcado como aguardando_laura`);
    } else {
      console.log(`[Webhook] 📝 Número desconhecido ${telefoneNormalizado} — mensagem automática enviada, sem criação de registo`);
    }

  } catch (error) {
    console.error('[Webhook] ❌ Erro ao processar resposta automática:', error);
    // Fallback silencioso: apenas loga (Sentry capta automaticamente)
  }
}