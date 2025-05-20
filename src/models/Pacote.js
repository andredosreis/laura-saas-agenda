// Este é o teu schema atualizado - Ótimo!
// Em src/models/Pacote.js (ou similar)
const mongoose = require('mongoose');

const pacoteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'O nome do pacote é obrigatório.'],
    trim: true
  },
  categoria: {
    type: String,
    required: [true, 'A categoria do pacote é obrigatória.'],
    trim: true
  },
  sessoes: {
    type: Number,
    required: [true, 'O número de sessões é obrigatório.'],
    min: [1, 'O pacote deve ter pelo menos 1 sessão.']
  },
  valor: { // CAMPO VALOR ADICIONADO E CORRETO!
    type: Number,
    required: [true, 'O valor do pacote é obrigatório.'],
    min: [0, 'O valor não pode ser negativo.']
  },
  descricao: {
    type: String,
    trim: true,
    maxlength: [500, 'A descrição não pode exceder 500 caracteres.']
  },
  ativo: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

module.exports = mongoose.model('Pacote', pacoteSchema);