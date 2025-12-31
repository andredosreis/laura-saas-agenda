import mongoose from 'mongoose';

const agendamentoSchema = new mongoose.Schema({
  // 🆕 MULTI-TENANT: Identificador do tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: [true, "O cliente é obrigatório."]
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    required: false
  },
  dataHora: {
    type: Date,
    required: [true, "A data e hora são obrigatórias."]
  },
  status: {
    type: String,
    enum: ['Agendado', 'Confirmado', 'Realizado', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu'],
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
  },
  confirmacao: {
    tipo: {
      type: String,
      enum: ['pendente', 'confirmado', 'rejeitado'],
      default: 'pendente'
    },
    respondidoEm: {
      type: Date,
      default: null
    },
    respondidoPor: {
      type: String,
      enum: ['cliente', 'laura'],
      default: null
    }
  }
}, {
  timestamps: true
});

agendamentoSchema.index({ dataHora: 1 });
agendamentoSchema.index({ cliente: 1 });
agendamentoSchema.index({ status: 1 });

agendamentoSchema.pre('save', function (next) {
  if (this.isNew && this.dataHora < new Date()) {
    return next(new Error('Não é possível criar agendamentos com data no passado.'));
  }
  next();
});

export default mongoose.model('Agendamento', agendamentoSchema);