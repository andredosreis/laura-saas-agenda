const mongoose = require('mongoose');
console.log('CONTROLLER: Iniciando carregamento de agendamentoController.js');

let Agendamento;
try {
  console.log('CONTROLLER: Tentando fazer require de ../models/Agendamento');
  Agendamento = require('../models/Agendamento');
  console.log('CONTROLLER: Modelo Agendamento CARREGADO COM SUCESSO');
} catch (err) {
  console.error('CONTROLLER: FALHA AO FAZER REQUIRE DE AGENDAMENTO:', err);
  throw err; // Importante para parar a execução se o modelo não carregar
}
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
    enum: ['AGENDADO', 'CONCLUIDO', 'CANCELADO'], // Padronizando em maiúsculas e sem acentos
    default: 'AGENDADO'
  },
  observacoes: {
    type: String,
    default: ''
  },
  isAvulso: {
    type: Boolean,
    default: false
  },
  criadoEm: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Isso vai criar automaticamente createdAt e updatedAt
});

// Índices para melhorar performance de consultas comuns
agendamentoSchema.index({ dataHora: 1 });
agendamentoSchema.index({ cliente: 1 });
agendamentoSchema.index({ status: 1 });

// Método virtual para verificar se o agendamento está no passado
agendamentoSchema.virtual('isPast').get(function() {
  return this.dataHora < new Date();
});

// Método virtual para formatar a data
agendamentoSchema.virtual('dataFormatada').get(function() {
  return this.dataHora.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Middleware pre-save para validações adicionais
agendamentoSchema.pre('save', function(next) {
  // Não permite agendamentos no passado
  if (this.isNew && this.dataHora < new Date()) {
    next(new Error('Não é possível criar agendamentos com data no passado'));
    return;
  }

  // Garante que o status está em maiúsculas
  if (this.status) {
    this.status = this.status.toUpperCase();
  }

  next();
});

// Método estático para buscar agendamentos do dia
agendamentoSchema.statics.findTodayAppointments = function() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    dataHora: {
      $gte: today.setHours(0, 0, 0, 0),
      $lt: tomorrow.setHours(0, 0, 0, 0)
    }
  }).populate('cliente').populate('pacote');
};

// Método de instância para cancelar agendamento
agendamentoSchema.methods.cancelar = async function() {
  this.status = 'CANCELADO';
  return this.save();
};

module.exports = mongoose.model('Agendamento', agendamentoSchema);