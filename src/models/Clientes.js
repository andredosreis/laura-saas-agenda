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
  sessoesRestantes: {
    type: Number,
    default: 0
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    default: null
  }
});

module.exports = mongoose.model('Cliente', clienteSchema);
