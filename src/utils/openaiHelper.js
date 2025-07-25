// src/utils/openaiHelper.js
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const { OpenAI } = require('openai');

// Inicializa o cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Carrega o super-prompt de systemLaura.md
const systemPrompt = fs.readFileSync(
  path.join(__dirname, '../prompt/systemLaura.md'),
  'utf8'
);

// Declara aqui as funções que o LLM pode chamar
const functions = [
  {
    name: 'create_client',
    description: 'Regista um novo cliente e devolve o ID.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        telephone: { type: 'string' }
      },
      required: ['name', 'telephone']
    }
  },
  {
    name: 'update_client_data',
    description: 'Atualiza nome, telefone e data de nascimento de cliente existente.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        name: { type: 'string' },
        telephone: { type: 'string' },
        dateOfBirth: { type: 'string', description: 'DD/MM/YYYY ou ISO' }
      },
      required: ['clientId', 'name', 'telephone', 'dateOfBirth']
    }
  },
  {
    name: 'schedule_appointment',
    description: 'Agenda uma sessão para um cliente num determinado slot.',
    parameters: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        slotId: { type: 'string' },
        packageId: { type: 'string' }
      },
      required: ['clientId', 'slotId', 'packageId']
    }
  },
  // … outras funções: find_packages, find_slots, update_appointment, get_weekly_finance
];

async function chatWithLaura({ userMsg, ctx = {}, functionResponse = null }) {
  const messages = [
    { role: 'system',    content: systemPrompt },
    { role: 'assistant', content: JSON.stringify(ctx) },
    ...(functionResponse
      ? [{
          role: 'function',
          name: functionResponse.name,
          content: JSON.stringify(functionResponse.result)
        }]
      : []),
    { role: 'user',      content: userMsg }
  ];

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 1.0,
    messages,
    functions
  });

  return resp.choices[0].message;
}

module.exports = { chatWithLaura };
