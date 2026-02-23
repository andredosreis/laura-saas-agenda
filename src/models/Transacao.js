import mongoose from 'mongoose';

const transacaoSchema = new mongoose.Schema({
  // Multi-tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },

  // Tipo e Categoria
  tipo: {
    type: String,
    enum: ['Receita', 'Despesa'],
    required: [true, 'O tipo é obrigatório']
  },
  categoria: {
    type: String,
    enum: [
      // Receitas
      'Serviço Avulso',
      'Pacote',
      'Produto',
      // Despesas
      'Fornecedor',
      'Salário',
      'Comissão',
      'Aluguel',
      'Água/Luz',
      'Internet',
      'Produtos',
      'Marketing',
      'Outros'
    ],
    required: [true, 'A categoria é obrigatória']
  },

  // Relacionamentos
  agendamento: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agendamento',
    default: null
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    default: null
  },
  compraPacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CompraPacote',
    default: null
  },
  profissional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Valores
  valor: {
    type: Number,
    required: [true, 'O valor é obrigatório'],
    min: [0, 'O valor não pode ser negativo']
  },
  desconto: {
    type: Number,
    default: 0,
    min: [0, 'O desconto não pode ser negativo']
  },
  valorFinal: {
    type: Number,
    required: true,
    min: 0
  },

  // Pagamento
  statusPagamento: {
    type: String,
    enum: ['Pendente', 'Pago', 'Parcial', 'Cancelado', 'Estornado'],
    default: 'Pendente'
  },
  formaPagamento: {
    type: String,
    enum: [
      'Dinheiro',
      'MBWay',
      'Multibanco',
      'Cartão de Débito',
      'Cartão de Crédito',
      'Transferência Bancária',
      'Múltiplas'
    ],
    default: null
  },
  dataPagamento: {
    type: Date,
    default: null
  },

  // Parcelamento
  parcelado: {
    type: Boolean,
    default: false
  },
  numeroParcelas: {
    type: Number,
    default: 1,
    min: [1, 'Deve ter pelo menos 1 parcela'],
    max: [12, 'Máximo de 12 parcelas']
  },
  parcelaAtual: {
    type: Number,
    default: 1,
    min: 1
  },

  // Detalhes
  descricao: {
    type: String,
    required: [true, 'A descrição é obrigatória'],
    trim: true
  },
  observacoes: {
    type: String,
    trim: true,
    default: ''
  },

  // Comissão (para receitas de serviços)
  comissao: {
    profissional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    percentual: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    valor: {
      type: Number,
      min: 0,
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

// Índices para performance
transacaoSchema.index({ tenantId: 1, tipo: 1, createdAt: -1 });
transacaoSchema.index({ tenantId: 1, statusPagamento: 1 });
transacaoSchema.index({ tenantId: 1, cliente: 1 });
transacaoSchema.index({ tenantId: 1, createdAt: -1 });

// Middleware: Calcular valorFinal automaticamente
transacaoSchema.pre('save', function(next) {
  // Calcular valor final
  this.valorFinal = this.valor - this.desconto;

  // Calcular comissão se houver
  if (this.comissao && this.comissao.percentual > 0 && this.valorFinal > 0) {
    this.comissao.valor = (this.valorFinal * this.comissao.percentual) / 100;
  }

  next();
});

// Método: Registrar pagamento
transacaoSchema.methods.registrarPagamento = function(valorPago, formaPagamento, dataPagamento = new Date()) {
  if (valorPago <= 0) {
    throw new Error('Valor do pagamento deve ser maior que zero');
  }

  if (this.statusPagamento === 'Pago') {
    throw new Error('Transação já está paga');
  }

  if (this.statusPagamento === 'Cancelado' || this.statusPagamento === 'Estornado') {
    throw new Error('Não é possível registrar pagamento em transação cancelada ou estornada');
  }

  // Atualizar status baseado no valor pago
  if (valorPago >= this.valorFinal) {
    this.statusPagamento = 'Pago';
    this.dataPagamento = dataPagamento;
  } else {
    this.statusPagamento = 'Parcial';
  }

  this.formaPagamento = formaPagamento;

  return this.save();
};

// Método: Cancelar/Estornar
transacaoSchema.methods.cancelar = function(motivo = '') {
  if (this.statusPagamento === 'Pago') {
    this.statusPagamento = 'Estornado';
  } else {
    this.statusPagamento = 'Cancelado';
  }

  if (motivo) {
    this.observacoes = `${this.observacoes}\n[Cancelado/Estornado] ${motivo}`.trim();
  }

  return this.save();
};

// Exporta schema para uso no registry (database-per-tenant)
export { transacaoSchema as TransacaoSchema };

export default mongoose.model('Transacao', transacaoSchema);
