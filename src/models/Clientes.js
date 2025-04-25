const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true
  },
  telefone: {
    type: String,
    required: true,
    unique: true
  },
  dataNascimento: {
    type: Date,
    required: true
  },
  pacote: {
    type: String,
    default: null
  },
  sessoesRestantes: {
    type: Number,
    default: 0
  },
  criadoEm: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Cliente', clienteSchema);
