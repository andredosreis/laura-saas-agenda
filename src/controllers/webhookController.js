import Agendamento from '../models/Agendamento.js';
import Cliente from '../models/Cliente.js';
import { sendWhatsAppMessage } from '../utils/zapi_client.js';
import { DateTime } from 'luxon';

/**
 * @description Webhook para processar confirmações de agendamento via WhatsApp
 * Responde a mensagens "SIM", "NÃO", "CONFIRMO", "CANCELAR", etc
 */
export const processarConfirmacaoWhatsapp = async (req, res) => {
  try {
    console.log('[Webhook] 📥 Recebido:', JSON.stringify(req.body, null, 2));

    // 🔍 VALIDAÇÃO 1: Ignora mensagens enviadas pelo próprio salão (fromMe: true)
    if (req.body.fromMe === true) {
      console.log('[Webhook] ⏭️ Ignorando mensagem enviada pelo salão (fromMe: true)');
      return res.status(200).json({ message: 'Mensagem do salão ignorada' });
    }

    // 🔍 VALIDAÇÃO 2: Verifica timestamp (só processa mensagens dos últimos 5 minutos)
    const timestampMensagem = req.body.momment || req.body.timestamp || Date.now();
    const idadeMensagem = Date.now() - timestampMensagem;
    const CINCO_MINUTOS = 5 * 60 * 1000;

    if (idadeMensagem > CINCO_MINUTOS) {
      console.log(`[Webhook] ⏭️ Mensagem antiga (${Math.round(idadeMensagem / 1000)}s) - ignorando`);
      return res.status(200).json({ message: 'Mensagem antiga ignorada' });
    }

    // Extrai dados do webhook Z-API
    const telefone = req.body.phone || req.body.data?.phone || req.body.data?.from;
    const mensagem = req.body.text?.message || req.body.data?.body || '';

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
    const padraoConfirmacao = /^(sim|confirmo|confirmar|ok|certo|confirma|yes|s|nao|não|cancelar|cancel|desmarcar|nope|n)$/;
    const ehRespostaConfirmacao = padraoConfirmacao.test(mensagemNormalizada);

    if (!ehRespostaConfirmacao) {
      // ✅ NÃO é confirmação → Delega para IA (chatbot)
      console.log(`[Webhook] 🤖 NÃO é confirmação - delegando para IA: "${mensagem}"`);
      return await delegarParaIA(req, res);
    }

    // ✅ É uma resposta de confirmação (SIM/NÃO) → Continua processando
    console.log(`[Webhook] ✅ Detectado resposta de confirmação: "${mensagem}"`);

    // Busca cliente pelo telefone
    const cliente = await Cliente.findOne({
      $or: [
        { telefone: telefoneNormalizado },
        { telefone: `351${telefoneNormalizado}` },
        { telefone: telefoneNormalizado.replace(/^351/, '') }
      ]
    });

    if (!cliente) {
      console.warn(`[Webhook] ⚠️ Cliente não encontrado - delegando para IA`);
      return await delegarParaIA(req, res);
    }

    console.log(`[Webhook] ✅ Cliente encontrado: ${cliente.nome} (${cliente._id})`);

    // Busca agendamento pendente nas próximas 48h
    const agora = DateTime.now().setZone('Europe/Lisbon');
    const doisDias = agora.plus({ days: 2 });

    const agendamento = await Agendamento.findOne({
      cliente: cliente._id,
      'confirmacao.tipo': 'pendente',
      dataHora: {
        $gte: agora.toJSDate(),
        $lte: doisDias.toJSDate()
      }
    }).sort({ dataHora: 1 });

    if (!agendamento) {
      console.warn(`[Webhook] ⚠️ Nenhum agendamento pendente para ${cliente.nome} - delegando para IA`);
      return await delegarParaIA(req, res);
    }

    // Processa resposta
    let resposta = '';
    let novoStatus = '';

    // Respostas positivas
    if (/^(sim|confirmo|confirmar|ok|certo|confirma|yes|s)$/.test(mensagemNormalizada)) {
      agendamento.confirmacao.tipo = 'confirmado';
      agendamento.confirmacao.respondidoEm = new Date();
      agendamento.confirmacao.respondidoPor = 'cliente';
      agendamento.status = 'Confirmado';
      novoStatus = 'confirmado';

      const dataFormatada = DateTime.fromJSDate(agendamento.dataHora)
        .setZone('Europe/Lisbon')
        .toFormat("dd/MM/yyyy 'às' HH:mm");

      resposta = `✅ Obrigada, ${cliente.nome}! Seu agendamento está confirmado para ${dataFormatada}. Aguardamos você! 💆‍♀️✨`;
    }
    // Respostas negativas
    else if (/^(nao|n[aã]o|cancelar|cancel|desmarcar|nope|n)$/.test(mensagemNormalizada)) {
      agendamento.confirmacao.tipo = 'rejeitado';
      agendamento.confirmacao.respondidoEm = new Date();
      agendamento.confirmacao.respondidoPor = 'cliente';
      agendamento.status = 'Cancelado Pelo Cliente';
      novoStatus = 'rejeitado';

      resposta = `❌ Entendido, ${cliente.nome}. Seu agendamento foi cancelado. Se precisar remarcar, é só entrar em contato! 📞`;
    }
    // Resposta não reconhecida
    else {
      console.warn(`[Webhook] ⚠️ Resposta não reconhecida: "${mensagem}"`);

      const dataFormatada = DateTime.fromJSDate(agendamento.dataHora)
        .setZone('Europe/Lisbon')
        .toFormat("dd/MM/yyyy 'às' HH:mm");

      resposta = `Olá ${cliente.nome}! 👋

Não consegui entender sua resposta. Você tem um agendamento marcado para ${dataFormatada}.

Por favor, responda:
✅ *SIM* - para confirmar
❌ *NÃO* - para cancelar`;

      await sendWhatsAppMessage(telefoneNormalizado, resposta);
      return res.status(200).json({ message: 'Resposta não reconhecida', aguardandoResposta: true });
    }

    // Salva agendamento
    await agendamento.save();
    console.log(`[Webhook] ✅ Agendamento ${novoStatus}: ${agendamento._id}`);

    // Envia resposta ao cliente
    await sendWhatsAppMessage(telefoneNormalizado, resposta);

    return res.status(200).json({
      success: true,
      cliente: cliente.nome,
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
async function delegarParaIA(req, res) {
  try {
    console.log('[Webhook] 📝 Processando mensagem não-confirmação (resposta automática simples)');

    const telefone = req.body.phone || req.body.data?.phone || req.body.data?.from;

    if (!telefone) {
      return res.status(400).json({ error: 'Telefone não fornecido' });
    }

    const telefoneNormalizado = telefone.replace(/[^\d]/g, '');

    // Verifica se já respondemos antes (evita spam)
    const cliente = await Cliente.findOne({
      $or: [
        { telefone: telefoneNormalizado },
        { telefone: `351${telefoneNormalizado}` },
        { telefone: telefoneNormalizado.replace(/^351/, '') }
      ]
    });

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
      // Se cliente não existe, cria registro temporário para evitar spam
      await Cliente.create({
        nome: 'Visitante (aguardando cadastro)',
        telefone: telefoneNormalizado,
        dataNascimento: new Date('2000-01-01'), // Placeholder (será atualizado pela Laura)
        etapaConversa: 'aguardando_laura'
      });
      console.log(`[Webhook] 📝 Registro temporário criado para ${telefoneNormalizado}`);
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