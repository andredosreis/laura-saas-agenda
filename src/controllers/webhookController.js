import Tenant from '../models/Tenant.js';
import { getTenantDB } from '../config/tenantDB.js';
import { getModels } from '../models/registry.js';
import { sendWhatsAppMessage } from '../utils/evolutionClient.js';
import { DateTime } from 'luxon';

/**
 * Resolve tenant-specific models by searching across all tenant databases.
 * Tries to find a client matching the given phone variants in each tenant DB.
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

    // 🔍 VALIDAÇÃO 2: Ignora mensagens enviadas pelo próprio salão (fromMe: true)
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
    // Aceita resposta exacta OU mensagem que comece com palavra-chave (ex: "Sim, claro", "Não vou conseguir")
    const ehSim = /^(sim|confirmo|confirmar|ok|certo|confirma|yes)\b|^s$/.test(mensagemNormalizada);
    const ehNao = /^(nao|cancelar|cancel|desmarcar|nope)\b|^n$/.test(mensagemNormalizada);
    const ehRespostaConfirmacao = ehSim || ehNao;

    if (!ehRespostaConfirmacao) {
      console.log(`[Webhook] ⏭️ Mensagem ignorada (não é confirmação): "${mensagem}"`);
      return res.status(200).json({ message: 'Mensagem ignorada' });
    }

    // ✅ É uma resposta de confirmação (SIM/NÃO) → Continua processando
    console.log(`[Webhook] ✅ Detectado resposta de confirmação: "${mensagem}"`);

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
    let tenantModels = null;

    // Busca cliente em todos os tenants
    const clienteResult = await resolveClienteTenant(telefoneVariants);

    if (clienteResult) {
      const { models, cliente } = clienteResult;
      tenantModels = models;
      console.log(`[Webhook] ✅ Cliente encontrado: ${cliente.nome} (${cliente._id})`);
      agendamento = await models.Agendamento.findOne({
        cliente: cliente._id,
        'confirmacao.tipo': 'pendente',
        dataHora: janelaQuery,
      }).sort({ dataHora: 1 });
      nomeRemetente = cliente.nome;
    }

    // Se não encontrou agendamento via cliente, tenta via lead (tipo Avaliacao)
    if (!agendamento) {
      const leadResult = await resolveLeadTenant(telefoneVariants, janelaQuery);

      if (leadResult) {
        tenantModels = leadResult.models;
        agendamento = leadResult.agendamento;
        nomeRemetente = agendamento.lead.nome;
        console.log(`[Webhook] ✅ Lead encontrado: ${nomeRemetente}`);
      }
    }

    if (!agendamento) {
      console.warn(`[Webhook] ⚠️ Nenhum agendamento pendente para ${telefoneNormalizado} - delegando para IA`);
      return await delegarParaIA(req, res, telefoneNormalizado);
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

      await sendWhatsAppMessage(telefoneNormalizado, resposta);
      return res.status(200).json({ message: 'Resposta não reconhecida', aguardandoResposta: true });
    }

    // Salva agendamento
    await agendamento.save();
    console.log(`[Webhook] ✅ Agendamento ${novoStatus}: ${agendamento._id}`);

    // Envia resposta ao cliente/lead
    await sendWhatsAppMessage(telefoneNormalizado, resposta);

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

      await sendWhatsAppMessage(numeroAdmin, msgAdmin);
    }

    return res.status(200).json({
      success: true,
      nome: nomeRemetente,
      agendamento: agendamento._id,
      status: novoStatus
    });

  } catch (error) {
    console.error('[Webhook] ❌ Erro ao processar confirmação:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * 🤖 Resposta automática simples (SEM IA)
 * Envia mensagem de saudação e notifica Laura
 * IMPORTANTE: Responde APENAS UMA VEZ, nunca mais interage
 */
async function delegarParaIA(req, res, telefoneNormalizado) {
  try {
    console.log('[Webhook] 📝 Processando mensagem não-confirmação (resposta automática simples)');

    if (!telefoneNormalizado) {
      const remoteJid = req.body.data?.key?.remoteJid || '';
      const telefone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
      if (!telefone) {
        return res.status(400).json({ error: 'Telefone não fornecido' });
      }
      telefoneNormalizado = telefone.replace(/[^\d]/g, '');
    }

    const telefoneVariants = [
      telefoneNormalizado,
      `351${telefoneNormalizado}`,
      telefoneNormalizado.replace(/^351/, '')
    ];

    // Busca cliente em todos os tenants (tenant-aware)
    const clienteResult = await resolveClienteTenant(telefoneVariants);
    const cliente = clienteResult?.cliente || null;

    // Se cliente já existe E já tem etapaConversa definida, significa que já respondemos antes
    // Neste caso, NÃO respondemos novamente (Laura vai tratar manualmente)
    if (cliente && cliente.etapaConversa) {
      console.log(`[Webhook] ⏭️ Cliente ${cliente.nome} já recebeu mensagem automática - ignorando`);
      return res.status(200).json({
        success: true,
        tipo: 'ignorado',
        message: 'Cliente já recebeu resposta automática anteriormente'
      });
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

    // Envia mensagem
    await sendWhatsAppMessage(telefoneNormalizado, mensagemAutomatica);
    console.log(`[Webhook] ✅ Mensagem automática enviada (${saudacao})`);

    // Marca que já respondemos (para não responder novamente)
    if (cliente) {
      cliente.etapaConversa = 'aguardando_laura';
      await cliente.save();
      console.log(`[Webhook] 📝 Cliente ${cliente.nome} marcado como aguardando_laura`);
    } else {
      console.log(`[Webhook] 📝 Número desconhecido ${telefoneNormalizado} — mensagem automática enviada, sem criação de registo`);
    }

    return res.status(200).json({
      success: true,
      tipo: 'resposta_automatica',
      saudacao,
      message: 'Mensagem automática enviada - aguardando Laura'
    });

  } catch (error) {
    console.error('[Webhook] ❌ Erro ao processar resposta automática:', error);

    // Fallback silencioso: apenas loga, não envia nada
    return res.status(200).json({
      success: false,
      tipo: 'erro_silencioso',
      message: 'Erro processado silenciosamente'
    });
  }
}