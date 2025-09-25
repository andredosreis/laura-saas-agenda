import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import functionsSchema from './functionsSchema.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Carrega o prompt do sistema uma única vez quando o módulo é iniciado
const systemPrompt = await readFile(path.join(__dirname, '../prompt/systemLaura.md'), 'utf8');

/**
 * @description Interage com o assistente da OpenAI, enviando a mensagem do user e o contexto.
 */
export const chatWithLaura = async ({ userMsg, ctx, toolOutputs }) => {
  const messages = [
    { role: 'system', content: systemPrompt },
    // TODO: Adicionar histórico da conversa aqui se necessário
    { role: 'user', content: `Contexto atual: ${JSON.stringify(ctx)}\n\nMensagem do Utilizador: ${userMsg}` }
  ];

  if (toolOutputs) {
    for (const toolOutput of toolOutputs) {
        messages.push({
            tool_call_id: toolOutput.tool_call_id,
            role: "tool",
            name: toolOutput.function_name, // Supondo que o nome da função venha aqui
            content: toolOutput.output,
        });
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ou o modelo que preferir
      messages: messages,
      tools: functionsSchema,
      tool_choice: "auto",
    });
    return response.choices[0].message;
  } catch (error) {
    console.error("Erro ao comunicar com a OpenAI:", error);
    throw error;
  }
};

/**
 * @description Usa um modelo mais simples para classificar a intenção principal do cliente.
 */
export const classificarIntencaoCliente = async (texto) => {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "Você é um classificador de intenções para uma clínica de estética. Classifique a mensagem do utilizador numa das seguintes categorias: AGENDAR, REAGENDAR, CANCELAR, PERGUNTA, CONFIRMAR, OUTRO."
                },
                {
                    role: "user",
                    content: texto
                }
            ],
            temperature: 0,
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("Erro ao classificar intenção:", error);
        return "OUTRO"; // Retorna uma intenção padrão em caso de erro
    }
};