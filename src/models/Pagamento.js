import mongoose from 'mongoose';

const pagamentoSchema = new mongoose.Schema({
  // Multi-tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },

  // Relacionamento
  transacao: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transacao',
    required: [true, 'A transação é obrigatória']
  },

  // Valor
  valor: {
    type: Number,
    required: [true, 'O valor é obrigatório'],
    min: [0, 'O valor não pode ser negativo']
  },

  // Forma de Pagamento
  formaPagamento: {
    type: String,
    enum: [
      'Dinheiro',
      'MBWay',
      'Multibanco',
      'Cartão de Débito',
      'Cartão de Crédito',
      'Transferência Bancária'
    ],
    required: [true, 'A forma de pagamento é obrigatória']
  },

  dataPagamento: {
    type: Date,
    required: true,
    default: Date.now
  },

  // Dados MBWay (Portugal)
  dadosMBWay: {
    telefone: {
      type: String,
      match: [/^9[0-9]{8}$/, 'Telefone deve ter formato 9xxxxxxxx'],
      trim: true
    },
    referencia: {
      type: String,
      trim: true
    },
    estado: {
      type: String,
      enum: ['Pendente', 'Pago', 'Expirado', 'Cancelado'],
      default: 'Pago'
    }
  },

  // Dados Multibanco (Portugal)
  dadosMultibanco: {
    entidade: {
      type: String,
      match: [/^[0-9]{5}$/, 'Entidade deve ter 5 dígitos'],
      trim: true
    },
    referencia: {
      type: String,
      match: [/^[0-9]{9}$/, 'Referência deve ter 9 dígitos'],
      trim: true
    },
    valor: {
      type: Number,
      min: 0
    },
    dataLimite: {
      type: Date
    }
  },

  // Dados Cartão
  dadosCartao: {
    bandeira: {
      type: String,
      enum: ['Visa', 'Mastercard', 'American Express', 'Maestro', 'Outro']
    },
    ultimos4Digitos: {
      type: String,
      match: [/^[0-9]{4}$/, 'Últimos 4 dígitos inválidos']
    },
    parcelas: {
      type: Number,
      default: 1,
      min: [1, 'Deve ter pelo menos 1 parcela'],
      max: [12, 'Máximo de 12 parcelas']
    },
    nsu: {
      type: String,
      trim: true
    }
  },

  // Dados Transferência
  dadosTransferencia: {
    banco: {
      type: String,
      trim: true
    },
    iban: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^PT50[0-9]{21}$/, 'IBAN português inválido']
    },
    referencia: {
      type: String,
      trim: true
    },
    comprovante: {
      type: String,
      trim: true
    }
  },

  // Observações
  observacoes: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

// Índices para performance
pagamentoSchema.index({ tenantId: 1, transacao: 1 });
pagamentoSchema.index({ tenantId: 1, dataPagamento: -1 });
pagamentoSchema.index({ tenantId: 1, formaPagamento: 1 });
pagamentoSchema.index({ tenantId: 1, createdAt: -1 });

// Validação: Telefone MBWay deve ter 9 dígitos
pagamentoSchema.pre('save', function(next) {
  if (this.formaPagamento === 'MBWay') {
    if (!this.dadosMBWay || !this.dadosMBWay.telefone) {
      return next(new Error('Telefone MBWay é obrigatório'));
    }
  }

  if (this.formaPagamento === 'Multibanco') {
    if (!this.dadosMultibanco || !this.dadosMultibanco.referencia) {
      return next(new Error('Referência Multibanco é obrigatória'));
    }
  }

  if (this.formaPagamento === 'Cartão de Débito' || this.formaPagamento === 'Cartão de Crédito') {
    if (!this.dadosCartao || !this.dadosCartao.ultimos4Digitos) {
      return next(new Error('Últimos 4 dígitos do cartão são obrigatórios'));
    }
  }

  next();
});

// Método estático: Total de pagamentos por forma de pagamento
pagamentoSchema.statics.totalPorFormaPagamento = async function(tenantId, dataInicio, dataFim) {
  return this.aggregate([
    {
      $match: {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        dataPagamento: {
          $gte: new Date(dataInicio),
          $lte: new Date(dataFim)
        }
      }
    },
    {
      $group: {
        _id: '$formaPagamento',
        total: { $sum: '$valor' },
        quantidade: { $sum: 1 }
      }
    },
    {
      $sort: { total: -1 }
    }
  ]);
};

// Exporta schema para uso no registry (database-per-tenant)
export { pagamentoSchema as PagamentoSchema };

export default mongoose.model('Pagamento', pagamentoSchema);
