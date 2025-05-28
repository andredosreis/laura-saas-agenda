// src/models/Agendamento.js (VERSÃO CORRIGIDA)
const mongoose = require('mongoose');

const agendamentoSchema = new mongoose.Schema({
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente', // Nome do modelo Cliente como definido em mongoose.model('Cliente', ...)
    required: [true, "O cliente é obrigatório."]
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',  // Nome do modelo Pacote como definido em mongoose.model('Pacote', ...)
    required: false // Pacote é opcional se for serviço avulso
  },
  dataHora: {
    type: Date,
    required: [true, "A data e hora são obrigatórias."]
  },
  status: {
    type: String,
    // Ajuste esta lista de enum para os status exatos que você usa no frontend e backend.
    // Exemplo: ['Agendado', 'Confirmado', 'Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu']
    // O seu schema anterior tinha: ['AGENDADO', 'CONCLUIDO', 'CANCELADO']
    // É importante que este enum seja consistente com o que o frontend envia e o controller espera.
    enum: ['Agendado', 'Confirmado', 'Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu', 'AGENDADO', 'CONCLUIDO', 'CANCELADO'],
    default: 'Agendado'
  },
  observacoes: {
    type: String,
    trim: true,
    default: ''
  },
  servicoAvulsoNome: {
    type: String,
    trim: true,
    default: null
  },
  servicoAvulsoValor: {
    type: Number,
    default: null
  }
}, {
  timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// Índices
agendamentoSchema.index({ dataHora: 1 });
agendamentoSchema.index({ cliente: 1 });
agendamentoSchema.index({ status: 1 });

// Middleware pre-save
agendamentoSchema.pre('save', function(next) {
  if (this.isNew && this.dataHora < new Date()) {
    return next(new Error('Não é possível criar agendamentos com data no passado'));
  }
  // Se você precisa garantir que o status seja salvo em maiúsculas, faça aqui ou no controller.
  // Ex: if (this.isModified('status') && this.status) { this.status = this.status.toUpperCase(); }
  next();
});

// Seus métodos virtuais e estáticos podem ser adicionados aqui de volta, se não causarem problemas.
// Ex: agendamentoSchema.virtual('isPast').get(...)
// Ex: agendamentoSchema.statics.findTodayAppointments = function() { ... }
// Ex: agendamentoSchema.methods.cancelar = async function() { ... }


module.exports = mongoose.model('Agendamento', agendamentoSchema);