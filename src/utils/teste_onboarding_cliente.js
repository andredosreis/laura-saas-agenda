require('dotenv').config();
const mongoose = require('mongoose');
const Cliente = require('../models/Cliente');
const Conversa = require('../models/Conversa');
const Pacote = require('../models/Pacote');
const { processarClienteNovo } = require('../controllers/agenteController');

// Mock da função de envio de WhatsApp (para não enviar de verdade)
global.sendWhatsAppMessage = async (telefone, mensagem) => {
  console.log(`[WHATSAPP MOCK] Para: ${telefone} | Mensagem: ${mensagem}`);
};

async function rodarTesteOnboarding() {
  // 1. Limpa o banco para garantir que o cliente é novo
  await Cliente.deleteMany({ telefone: '999999999' });
  await Conversa.deleteMany({ telefone: '999999999' });

  // 2. Simula o fluxo de mensagens
  const telefoneTeste = '999999999';

  // Passo 1: Primeira mensagem (cliente novo)
  await processarClienteNovo(telefoneTeste, "Oi, quero saber mais!");

  // Passo 2: Cliente responde com o nome
  await processarClienteNovo(telefoneTeste, "Ana Paula");

  // Passo 3: Cliente responde com objetivo
  await processarClienteNovo(telefoneTeste, "Quero melhorar a circulação");

  // Passo 4: Cliente responde com data de nascimento
  await processarClienteNovo(telefoneTeste, "15/08/1990");

  // Passo 5: Cliente escolhe um serviço (ex: 1)
  await processarClienteNovo(telefoneTeste, "1");

  // (Opcional) Verifica se o cliente foi criado no banco
  const clienteCriado = await Cliente.findOne({ telefone: telefoneTeste });
  console.log('Cliente criado:', clienteCriado);

  // (Opcional) Verifica o estado final da conversa
  const conversaFinal = await Conversa.findOne({ telefone: telefoneTeste });
  console.log('Conversa final:', conversaFinal);
}

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => rodarTesteOnboarding())
  .then(() => mongoose.disconnect());