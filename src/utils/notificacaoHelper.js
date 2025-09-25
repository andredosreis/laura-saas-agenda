const palavrasChave = [
  'urgente', 'problema', 'reclamação', 'reagendar', 'remarcar', 'cancelar',
  'dor', 'complicação', 'não funcionou', 'insatisfeita'
];

/**
 * Deteta se alguma palavra-chave de alerta está presente na mensagem do cliente.
 * @param {string} mensagem A mensagem a ser analisada.
 * @returns {boolean} Retorna true se encontrar uma palavra-chave, senão false.
 */
export const detectarPalavraChave = (mensagem) => {
  if (!mensagem) return false;
  const texto = mensagem.toLowerCase();
  // .some() é eficiente porque para assim que encontra a primeira correspondência
  return palavrasChave.some(palavra => texto.includes(palavra));
};

// Não precisamos mais do module.exports, pois a função já foi exportada acima.