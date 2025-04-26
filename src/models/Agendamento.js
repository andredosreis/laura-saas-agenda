const mongoose = require('mongoose');

const agendamentoSchema = new mongoose.Schema({
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    required: true
  },
  dataHora: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['agendado', 'concluído', 'cancelado'],
    default: 'agendado'
  },
  observacoes: {
    type: String,
    default: ''
  },
  criadoEm: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Agendamento', agendamentoSchema);
