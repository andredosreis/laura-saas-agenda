// src/models/Conversa.js

const mongoose = require('mongoose');

const ConversaSchema = new mongoose.Schema({
  telefone: { type: String, required: true, unique: true },
  estado: {
    type: String,
    enum: [
      'aguardando_nome',
      'aguardando_data_nascimento',
      'aguardando_escolha_servico',
      'aguardando_reagendamento',
      'ativo',
      'finalizado'
    ],
    default: 'aguardando_nome'
  },
  nomeTemporario: String,
  dataNascimentoTemporaria: Date,
  ultimaInteracao: { type: Date, default: Date.now },
  agendamentoParaRemarcar: { type: mongoose.Schema.Types.ObjectId, ref: 'Agendamento' }
  // ... outros campos que você quiser
});

// Middleware para atualizar a data da última interação automaticamente
ConversaSchema.pre('save', function(next) {
  this.ultimaInteracao = new Date();
  next();
});

module.exports = mongoose.model('Conversa', ConversaSchema);