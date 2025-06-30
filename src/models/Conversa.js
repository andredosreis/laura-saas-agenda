const mongoose = require('mongoose');

const ConversaSchema = new mongoose.Schema({
  telefone: { type: String, required: true, unique: true },
  estado: { type: String, required: true, default: 'aguardando_nome' },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
  nomeTemporario: { type: String }, // Guarda o nome antes de criar o cliente
  ultimaMensagem: { type: String },
  atualizadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Conversa', ConversaSchema);