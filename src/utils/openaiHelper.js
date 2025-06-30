require('dotenv').config();
const { OpenAI } = require('openai');




const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
async function classificarIntencaoCliente(textoCliente) {
  const prompt = `
Sua tarefa é classificar a intenção principal da mensagem do cliente para um sistema de agendamento. Analise o sentido, sinônimos e contexto, e escolha APENAS uma das opções abaixo, respondendo com a palavra, em MAIÚSCULO, sem pontuação ou explicações adicionais:

- CONFIRMAR
- REMARCAR
- CANCELAR
- PERGUNTA
- OUTRO

Se a mensagem for tipo "não posso ir hoje, podemos marcar para outro dia?", classifique como REMARCAR.
Se for "sim, confirmado", classifique como CONFIRMAR.
Se for "vou cancelar", classifique como CANCELAR.
Se for dúvida, como PERGUNTA.
Se não se encaixar, como OUTRO.

Mensagem do cliente: "${textoCliente}"

Apenas a palavra, nada mais.
  `;
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Classificador de intenção para automação de WhatsApp, sempre responda só com a palavra da lista." },
      { role: "user", content: prompt }
    ],
    max_tokens: 10
  });
  
  return response.choices[0].message.content.trim().toUpperCase();
}

async function gerarRespostaLaura(textoCliente, nomeCliente = null) {
  const saudacao = nomeCliente ? `${nomeCliente}` : 'querida';
  
  const prompt = `
Você é Laura, uma profissional especialista em estética avançada. Responda a dúvida ou comentário do cliente abaixo de forma acolhedora, clara, com gentileza e empatia. Use linguagem simples, sem termos técnicos, e mostre disponibilidade para ajudar.

${nomeCliente ? `O nome da cliente é ${nomeCliente}, use o nome dela na resposta de forma natural.` : ''}

Exemplos de tom:
- "Oi ${saudacao}! Qualquer dúvida é só perguntar, viu?"
- "Fique tranquila, vou te explicar tudinho!"
- "É um prazer te atender! Qualquer coisa estou à disposição."

Mensagem do cliente: "${textoCliente}"
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Você é Laura, especialista em estética linfática, sempre responde com empatia e acolhimento, em português." },
      { role: "user", content: prompt }
    ],
    max_tokens: 200
  });
  
  return response.choices[0].message.content.trim();
}
async function gerarRespostaLaura(textoCliente) {
  const prompt = `
Você é Laura, uma profissional especialista em estética avançada. Responda a dúvida ou comentário do cliente abaixo de forma acolhedora, clara, com gentileza e empatia. Use linguagem simples, sem termos técnicos, e mostre disponibilidade para ajudar.

Exemplos de tom:
- "Oi querida! Qualquer dúvida é só perguntar, viu?"
- "Fique tranquila, vou te explicar tudinho!"
- "É um prazer te atender! Qualquer coisa estou à disposição."

Mensagem do cliente: "${textoCliente}"
`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Você é Laura, especialista em estética linfática, sempre responde com empatia e acolhimento, em português." },
      { role: "user", content: prompt }
    ],
    max_tokens: 200
  });
  return response.choices[0].message.content.trim();
}

module.exports = { classificarIntencaoCliente, gerarRespostaLaura };
