// src/controllers/agenteController.js

const { DateTime } = require('luxon');
const Agendamento = require('../models/Agendamento');
const Cliente = require('../models/Cliente');
const Conversa = require('../models/Conversa');
const Pacote = require('../models/Pacote');
const { sendWhatsAppMessage } = require('../utils/zapi_client');
const { classificarIntencaoCliente, gerarRespostaLaura } = require('../utils/openaiHelper');

console.log('CONTROLLER: Carregando agenteController.js');

/**
 * LÓGICA PRINCIPAL - Passo 3 do Plano de Ação
 * Procura agendamentos para o dia seguinte e envia lembretes personalizados.
 */
const enviarLembretes24h = async (req, res) => {
  console.log('AGENTE: Iniciando tarefa de enviar lembretes de 24h...');
  try {
    // 1. Calcular o intervalo de tempo para "amanhã"
    const inicioDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).startOf('day').toJSDate();
    const fimDeAmanha = DateTime.now().setZone('Europe/Lisbon').plus({ days: 1 }).endOf('day').toJSDate();

    // 2. Buscar agendamentos que precisam de lembrete
    const agendamentosParaLembrar = await Agendamento.find({
      dataHora: { $gte: inicioDeAmanha, $lte: fimDeAmanha },
      status: { $in: ['Agendado', 'Confirmado'] },
    }).populate('cliente pacote');

    if (agendamentosParaLembrar.length === 0) {
      console.log('AGENTE: Nenhum agendamento para lembrar amanhã.');
      return res.status(200).json({ message: 'Nenhum agendamento para lembrar amanhã.' });
    }

    // 3. Enviar as mensagens
    const resultados = [];
    for (const ag of agendamentosParaLembrar) {
      if (ag.cliente && ag.cliente.telefone) {
        const nomeDoServico = ag.pacote?.nome || ag.servicoAvulsoNome || 'o seu atendimento';
        const horaFormatada = DateTime.fromJSDate(ag.dataHora, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
        
        const mensagem = `Olá ${ag.cliente.nome}! Este é um lembrete da sua sessão de "${nomeDoServico}" agendada para amanhã às ${horaFormatada}. Por favor, responda com "Sim" para confirmar.`;
        
        await sendWhatsAppMessage(ag.cliente.telefone, mensagem);
        resultados.push({ cliente: ag.cliente.nome, status: 'Lembrete enviado' });
      }
    }

    console.log(`AGENTE: Lembretes de 24h enviados para ${resultados.length} clientes.`);
    res.status(200).json({
      success: true,
      message: `Lembretes enviados para ${resultados.length} agendamentos.`,
      detalhes: resultados,
    });

  } catch (error) {
    console.error('AGENTE: Erro ao enviar lembretes de 24h:', error);
    res.status(500).json({ success: false, message: 'Ocorreu um erro no servidor do agente.' });
  }
};

/**
 * MVP - Processa resposta do cliente via webhook com IA
 */
const processarRespostaWhatsapp = async (req, res) => {
    try {
       const telefoneCliente = req.body.telefoneCliente || req.body.phone;
       const mensagem = req.body.mensagem || req.body.text?.message;

      console.log(`AGENTE: Mensagem recebida de ${telefoneCliente}: "${mensagem}"`);

        // 1. Identificar o cliente
        const cliente = await Cliente.findOne({ telefone: telefoneCliente });
        
        if (!cliente) {
            // FLUXO PARA CLIENTES NOVOS
            await processarClienteNovo(telefoneCliente, mensagem);
            return res.status(200).json({ status: 'Processando cliente novo' });
        }

        // 2. FLUXO PARA CLIENTES EXISTENTES COM IA
        console.log(`AGENTE: Cliente encontrado: ${cliente.nome}`);
        
        // Buscar agendamentos próximos do cliente
        const agendamentosProximos = await buscarAgendamentosProximos(cliente._id);

        // 3. Analisar intenção da mensagem com IA
        const intencao = await analisarIntencaoComIA(mensagem);

        // 4. Processar baseado na intenção
        await processarIntencaoComIA(cliente, agendamentosProximos, intencao, mensagem);

        res.status(200).json({ 
            status: 'Mensagem processada com sucesso',
            cliente: cliente.nome,
            intencao: intencao
        });

    } catch (error) {
        console.error('AGENTE: Erro ao processar resposta WhatsApp:', error);
        res.status(500).json({ success: false, message: 'Erro interno do agente' });
    }
};

/**
 * Analisa intenção da mensagem usando OpenAI
 */
async function analisarIntencaoComIA(mensagem) {
    try {
        const intencao = await classificarIntencaoCliente(mensagem);
        console.log(`AGENTE: Intenção classificada pela IA: ${intencao}`);
        return intencao.toLowerCase();
    } catch (error) {
        console.error('AGENTE: Erro ao classificar intenção com IA:', error);
        // Fallback para análise manual se a IA falhar
        return analisarIntencaoManual(mensagem);
    }
}

/**
 * Processa a ação baseada na intenção (com IA)
 */
async function processarIntencaoComIA(cliente, agendamentos, intencao, mensagemOriginal) {
    console.log(`AGENTE: Processando intenção "${intencao}" para cliente ${cliente.nome}`);
    
    switch (intencao) {
        case 'confirmar':
            await processarConfirmacao(cliente, agendamentos);
            break;
        
        case 'cancelar':
            await processarCancelamento(cliente, agendamentos);
            break;
        
        case 'remarcar':
            await processarReagendamento(cliente, agendamentos);
            break;
        
        case 'pergunta':
        case 'outro':
            // Usa a IA para gerar resposta personalizada
            await processarComIA(cliente, mensagemOriginal);
            break;
        
        default:
            await processarNaoIdentificado(cliente, mensagemOriginal);
            break;
    }
}

/**
 * Usa a IA para gerar resposta personalizada
 */
async function processarComIA(cliente, mensagemOriginal) {
    try {
        console.log(`AGENTE: Gerando resposta com IA para ${cliente.nome}`);
        const respostaIA = await gerarRespostaLaura(mensagemOriginal, cliente.nome);
        console.log(`AGENTE: Resposta gerada pela IA: ${respostaIA}`);
        await sendWhatsAppMessage(cliente.telefone, respostaIA);
    } catch (error) {
        console.error('AGENTE: Erro ao gerar resposta com IA:', error);
        // Fallback para resposta padrão
        await processarNaoIdentificado(cliente, mensagemOriginal);
    }
}

/**
 * Processa clientes novos (não cadastrados)
 */
async function processarClienteNovo(telefoneCliente, mensagem) {
    let conversa = await Conversa.findOne({ telefone: telefoneCliente });

    if (!conversa) {
        // Primeira interação: pede o nome
        await sendWhatsAppMessage(telefoneCliente, 
            "Vejo que você ainda não é nossa cliente 😊. Eu sou a assistente da Laura e estou aqui para tirar qualquer dúvida e marcar uma sessão de teste. Para melhor te atender, poderia me dizer seu nome?");
        await Conversa.create({ telefone: telefoneCliente, estado: 'aguardando_nome' });
        return;
    }

    if (conversa.estado === 'aguardando_nome') {
        // Recebeu o nome, salva temporariamente e pergunta sobre objetivo/dor
        const nome = mensagem.trim().split(' ')[0]; // Pega só o primeiro nome para soar mais natural
        conversa.nomeTemporario = nome;
        conversa.estado = 'aguardando_objetivo';
        await conversa.save();

        await sendWhatsAppMessage(telefoneCliente, 
            `Prazer, ${nome}! Agora me conta: qual seu principal objetivo ou dúvida em relação à estética? Assim posso te explicar nossos serviços e te ajudar a escolher o melhor para você! 💕`);
        return;
    }

    if (conversa.estado === 'aguardando_objetivo') {
        // Recebeu o objetivo/dor, apresenta os serviços
        const nome = conversa.nomeTemporario || 'querida';
        // Busca os serviços do banco (model Pacote)
        const pacotes = await Pacote.find({});
        
        if (pacotes.length === 0) {
            await sendWhatsAppMessage(telefoneCliente, 
                `${nome}, no momento estou organizando nossa lista de serviços. Vou encaminhar sua mensagem para a Laura, que entrará em contato com todos os detalhes! 💕`);
            return;
        }

        let listaServicos = pacotes.map((p, i) => `${i + 1}. ${p.nome}`).join('\n');
        await sendWhatsAppMessage(telefoneCliente, 
            `Entendi, ${nome}! Olha só, temos esses serviços que podem te ajudar:\n\n${listaServicos}\n\nMe fala o número ou nome do serviço que você quer saber mais! 😊`);
        conversa.estado = 'aguardando_escolha_servico';
        await conversa.save();
        return;
    }

    if (conversa.estado === 'aguardando_escolha_servico') {
        // Cliente escolheu um serviço, explica o serviço
        const nome = conversa.nomeTemporario || 'querida';
        const pacotes = await Pacote.find({});
        const escolha = mensagem.trim().toLowerCase();

        // Tenta identificar o serviço pelo número ou nome
        let pacoteEscolhido = null;
        if (!isNaN(escolha)) {
            const idx = parseInt(escolha, 10) - 1;
            if (pacotes[idx]) pacoteEscolhido = pacotes[idx];
        } else {
            pacoteEscolhido = pacotes.find(p => 
                p.nome.toLowerCase().includes(escolha) || 
                escolha.includes(p.nome.toLowerCase())
            );
        }

        if (pacoteEscolhido) {
            const explicacao = pacoteEscolhido.descricao || 
                `O serviço "${pacoteEscolhido.nome}" é um dos nossos mais procurados!`;
            
            await sendWhatsAppMessage(telefoneCliente, 
                `Ótima escolha, ${nome}! 😍\n\n"${pacoteEscolhido.nome}"\n${explicacao}\n\nSe quiser agendar uma sessão de teste ou saber mais sobre outros serviços, é só me avisar! Estou aqui para te ajudar 💕`);
            
            // Cria o cliente no banco de dados
            await Cliente.create({ 
                nome: conversa.nomeTemporario, 
                telefone: telefoneCliente,
                observacoes: `Interessada em: ${pacoteEscolhido.nome}`
            });
            
            conversa.estado = 'finalizado';
            await conversa.save();
        } else {
            await sendWhatsAppMessage(telefoneCliente, 
                `Não consegui identificar o serviço, ${nome}. Pode me dizer o número ou nome certinho? Ou se preferir, posso te passar para a Laura! 😊`);
        }
        return;
    }
}

/**
 * Busca agendamentos próximos do cliente (próximos 7 dias)
 */
async function buscarAgendamentosProximos(clienteId) {
    const hoje = new Date();
    const proximosSete = new Date();
    proximosSete.setDate(hoje.getDate() + 7);

    return await Agendamento.find({
        cliente: clienteId,
        dataHora: { $gte: hoje, $lte: proximosSete },
        status: { $in: ['Agendado', 'Confirmado'] }
    }).populate('pacote');
}

/**
 * Analisa intenção da mensagem (fallback manual)
 */
function analisarIntencaoManual(mensagem) {
    const msg = mensagem.toLowerCase().trim();

    // Confirmação
    if (msg.includes('sim') || msg.includes('confirmo') || msg.includes('confirmar') || 
        msg.includes('ok') || msg.includes('certo') || msg.includes('perfeito')) {
        return 'confirmar';
    }

    // Cancelamento
    if (msg.includes('cancelar') || msg.includes('não vou') || msg.includes('nao vou') || 
        msg.includes('desmarcar') || msg.includes('não posso') || msg.includes('nao posso') ||
        msg.includes('não consigo') || msg.includes('nao consigo')) {
        return 'cancelar';
    }

    // Reagendamento
    if (msg.includes('remarcar') || msg.includes('mudar') || msg.includes('outro dia') || 
        msg.includes('outro horário') || msg.includes('outro horario') || msg.includes('reagendar')) {
        return 'remarcar';
    }

    // Dúvidas
    if (msg.includes('dúvida') || msg.includes('duvida') || msg.includes('pergunta') || 
        msg.includes('?') || msg.includes('como') || msg.includes('quando') || msg.includes('onde') ||
        msg.includes('quanto') || msg.includes('preço') || msg.includes('preco') || msg.includes('valor')) {
        return 'pergunta';
    }

    // Não identificado
    return 'outro';
}

/**
 * Processa confirmação de agendamento
 */
async function processarConfirmacao(cliente, agendamentos) {
    if (agendamentos.length === 0) {
        const mensagem = `Olá ${cliente.nome}! 😊

Não encontrei nenhum agendamento próximo para confirmar. Se você tem algum agendamento marcado, vou encaminhar para a Laura verificar.

Qualquer coisa, estou aqui! 💕`;
        
        await sendWhatsAppMessage(cliente.telefone, mensagem);
        return;
    }

    // Confirma o primeiro agendamento encontrado
    const agendamento = agendamentos[0];
    agendamento.status = 'Confirmado';
    await agendamento.save();

    const dataFormatada = DateTime.fromJSDate(agendamento.dataHora, { zone: 'Europe/Lisbon' })
        .toFormat('dd/MM/yyyy \'às\' HH:mm');
    const servico = agendamento.pacote?.nome || agendamento.servicoAvulsoNome || 'seu atendimento';

    const mensagem = `Perfeito, ${cliente.nome}! ✅

Seu agendamento está confirmado:
📅 ${servico}
🕐 ${dataFormatada}

Nos vemos em breve! Se precisar de algo, é só chamar 💕`;

    await sendWhatsAppMessage(cliente.telefone, mensagem);
}

/**
 * Processa cancelamento de agendamento
 */
async function processarCancelamento(cliente, agendamentos) {
    if (agendamentos.length === 0) {
        const mensagem = `Olá ${cliente.nome}! 😊

Não encontrei agendamentos próximos para cancelar. Vou encaminhar sua mensagem para a Laura verificar.

Qualquer coisa, estou aqui! 💕`;
        
        await sendWhatsAppMessage(cliente.telefone, mensagem);
        return;
    }

    const agendamento = agendamentos[0];
    agendamento.status = 'Cancelado';
    await agendamento.save();

    const mensagem = `Entendido, ${cliente.nome}! 

Seu agendamento foi cancelado conforme solicitado. 

Se quiser reagendar para outro dia, é só me avisar! Estou aqui para ajudar 💕`;

    await sendWhatsAppMessage(cliente.telefone, mensagem);
}

/**
 * Processa solicitação de reagendamento
 */
async function processarReagendamento(cliente, agendamentos) {
    const mensagem = `Olá ${cliente.nome}! 😊

Entendi que você gostaria de remarcar seu agendamento. Vou encaminhar sua solicitação para a Laura, que entrará em contato para verificar a disponibilidade de novos horários.

Ela tem a agenda toda na cabeça! 💕`;

    await sendWhatsAppMessage(cliente.telefone, mensagem);
}

/**
 * Processa mensagens não identificadas
 */
async function processarNaoIdentificado(cliente, mensagemOriginal) {
    const mensagem = `Olá ${cliente.nome}! 😊

Recebi sua mensagem, mas não consegui entender exatamente como posso ajudar. Vou encaminhar para a Laura, que entrará em contato em breve.

Ela sempre sabe o que fazer! 💕`;

    await sendWhatsAppMessage(cliente.telefone, mensagem);
}

module.exports = {
  enviarLembretes24h,
  processarRespostaWhatsapp,
};