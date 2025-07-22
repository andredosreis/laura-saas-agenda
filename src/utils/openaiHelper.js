// src/utils/openaiHelper.js – CommonJS revised
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const { OpenAI } = require('openai');

// Inicializa o cliente OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Carrega prompt do sistema (super-prompt) de src/utils/systemLaura.md
const systemPromptPath = path.join(__dirname, '../prompt/systemLaura.md');
let systemPrompt = '';
try {
  systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
  console.log('OpenAIHelper: systemPrompt carregado de', systemPromptPath);
} catch (err) {
  console.error('OpenAIHelper: erro ao carregar systemPrompt:', err);
}

// Carrega schema de function-calling de src/utils/functionsSchema.json (opcional)
const schemaPath = path.join(__dirname, 'functionsSchema.json');
let functionsSchema = [];
if (fs.existsSync(schemaPath)) {
  try {
    functionsSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    console.log('OpenAIHelper: functionsSchema carregado de', schemaPath);
  } catch (err) {
    console.warn('OpenAIHelper: schema inválido em', schemaPath);
  }
} else {
  console.warn('OpenAIHelper: functionsSchema.json não encontrado, function-calling desativado');
}

/**
 * Invoca a LLM com suporte a function-calling, se disponível.
 *
 * @param {Object} opts
 * @param {string} opts.userMsg - texto enviado pelo utilizador
 * @param {Object} [opts.ctx] - contexto dinâmico serializado
 * @param {Object} [opts.functionResponse] - resposta de uma função já executada
 * @returns {Promise<Object>} - mensagem da LLM ({ content?, function_call? })
 */
async function chatWithLaura({ userMsg, ctx = {}, functionResponse = null }) {
  const messages = [
    { role: 'system',    content: systemPrompt },
    { role: 'assistant', content: JSON.stringify(ctx) },
    ...(functionResponse
      ? [{ role: 'function', name: functionResponse.name, content: JSON.stringify(functionResponse.result) }]
      : []),
    { role: 'user',      content: userMsg }
  ];

  const options = {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    messages
  };
  if (functionsSchema.length) {
    options.functions = functionsSchema;
  }

  const resp = await openai.chat.completions.create(options);
  return resp.choices[0].message;
}

module.exports = { chatWithLaura };
