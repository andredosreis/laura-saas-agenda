// src/utils/notificacaoHelper.js

const palavrasChave = [
  'urgente', 'problema', 'reclamação', 'reagendar', 'remarcar', 'cancelar',
  'dor', 'complicação', 'não funcionou', 'insatisfeita'
];

function detectarPalavraChave(mensagem) {
  const texto = mensagem.toLowerCase();
  return palavrasChave.some(palavra => texto.includes(palavra));
}

module.exports = { detectarPalavraChave };