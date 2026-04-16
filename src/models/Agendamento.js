import mongoose from 'mongoose';

const agendamentoSchema = new mongoose.Schema({
  // 🆕 MULTI-TENANT: Identificador do tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },
  tipo: {
    type: String,
    enum: ['Avaliacao', 'Sessao', 'Retorno'],
    default: 'Sessao'
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: false
  },
  // Lead data para agendamentos de avaliação (cliente ainda não cadastrado)
  lead: {
    nome:     { type: String, trim: true, default: null },
    telefone: { type: String, trim: true, default: null },
    email:    { type: String, trim: true, lowercase: true, default: null }
  },
  // Quando lead vira cliente após fechar pacote
  clienteConvertido: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    default: null
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    required: false
  },
  // Referência à compra do pacote (usado quando cliente comprou pacote)
  compraPacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompraPacote',
    required: false
  },
  dataHora: {
    type: Date,
    required: [true, "A data e hora são obrigatórias."]
  },
  status: {
    type: String,
    enum: ['Agendado', 'Confirmado', 'Compareceu', 'Realizado', 'Fechado', 'Avaliacao', 'Cancelado Pelo Cliente', 'Cancelado Pelo Salão', 'Não Compareceu'],
    default: 'Agendado'
  },
  compareceu: {
    type: Boolean,
    default: null
  },
  fechouPacote: {
    type: Boolean,
    default: null
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
  },

  // 💰 FASE 3: Controle Financeiro
  valorCobrado: {
    type: Number,
    default: null,
    min: [0, 'O valor não pode ser negativo']
  },

  numeroDaSessao: {
    type: Number,
    default: null,
    min: [1, 'Número da sessão deve ser pelo menos 1']
  },

  // Controle financeiro
  transacao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transacao',
    default: null
  },
  statusPagamento: {
    type: String,
    enum: ['Pendente', 'Pago', 'Cancelado'],
    default: 'Pendente'
  },

  // Profissional que realizou o serviço
  profissional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Comissão
  comissao: {
    profissional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    percentual: {
      type: Number,
      min: [0, 'Percentual não pode ser negativo'],
      max: [100, 'Percentual não pode ser maior que 100'],
      default: 0
    },
    valor: {
      type: Number,
      min: [0, 'Valor não pode ser negativo'],
      default: 0
    },
    pago: {
      type: Boolean,
      default: false
    },
    dataPagamento: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

agendamentoSchema.index({ dataHora: 1 });
agendamentoSchema.index({ cliente: 1 });
agendamentoSchema.index({ status: 1 });

// 🆕 Phase 2B: Composite indexes for analytics queries
agendamentoSchema.index({ tenantId: 1, status: 1, dataHora: 1 });
agendamentoSchema.index({ tenantId: 1, dataHora: 1 });
agendamentoSchema.index({ tenantId: 1, cliente: 1, status: 1 });

agendamentoSchema.index({ tenantId: 1, tipo: 1 });
agendamentoSchema.index({ tenantId: 1, compareceu: 1, fechouPacote: 1 });

// 💰 Phase 3: Financial indexes
agendamentoSchema.index({ tenantId: 1, compraPacote: 1 });
agendamentoSchema.index({ tenantId: 1, statusPagamento: 1 });
agendamentoSchema.index({ tenantId: 1, profissional: 1, status: 1 });

agendamentoSchema.pre('save', function (next) {
  if (this.isNew && this.dataHora < new Date()) {
    return next(new Error('Não é possível criar agendamentos com data no passado.'));
  }
  next();
});

// Exporta schema para uso no registry (database-per-tenant)
export { agendamentoSchema as AgendamentoSchema };

export default mongoose.model('Agendamento', agendamentoSchema);