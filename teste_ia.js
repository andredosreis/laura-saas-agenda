const { classificarIntencaoCliente, gerarRespostaLaura } = require('./src/utils/openaiHelper');

async function testarIA() {
    console.log('=== TESTE DE CLASSIFICAÇÃO ===');
    
    const mensagens = [
        "Sim, confirmo meu agendamento",
        "Não vou conseguir ir, preciso cancelar",
        "Posso remarcar para outro dia?",
        "Quanto custa a limpeza de pele?",
        "Oi, tudo bem?"
    ];

    for (const msg of mensagens) {
        try {
            const intencao = await classificarIntencaoCliente(msg);
            console.log(`Mensagem: "${msg}"`);
            console.log(`Intenção: ${intencao}\n`);
        } catch (error) {
            console.error(`Erro ao classificar "${msg}":`, error.message);
        }
    }

    console.log('=== TESTE DE RESPOSTA ===');
    try {
        const resposta = await gerarRespostaLaura("Quanto custa a limpeza de pele?", "Maria");
        console.log(`Resposta da Laura: ${resposta}`);
    } catch (error) {
        console.error('Erro ao gerar resposta:', error.message);
    }
}

testarIA();