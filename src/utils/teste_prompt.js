require('dotenv').config();
const { detectarIntencaoCliente, gerarRespostaLaura } = require('./openaiHelper');

async function executarTestesDeIA() {
  console.log('--- Testando Helper Atualizado ---');

  const cenarios = [
    { mensagem: "Oi, queria saber quais pacotes vocês têm", nome: "Ana" },
    { mensagem: "Gostaria de marcar uma sessão", nome: "Maria" },
    { mensagem: "Quanto custa a drenagem linfática?", nome: "Sofia" }
  ];

  for (const cenario of cenarios) {
    console.log(`\n--- Mensagem: "${cenario.mensagem}" ---`);

    try {
      // Detecta intenção
      const intencao = await detectarIntencaoCliente(cenario.mensagem);
      console.log(`  Intenção: ${intencao}`);

      // Gera resposta (sem contexto dinâmico por enquanto)
      const resposta = await gerarRespostaLaura(cenario.mensagem, cenario.nome, intencao);
      console.log(`  Resposta: "${resposta}"`);

    } catch (error) {
      console.error(`  ERRO: ${error.message}`);
    }
  }

  console.log('\n--- Testes Concluídos ---');
}

executarTestesDeIA().catch(console.error);