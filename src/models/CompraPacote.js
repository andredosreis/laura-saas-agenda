import mongoose from 'mongoose';

const compraPacoteSchema = new mongoose.Schema({
  // Multi-tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },

  // Relacionamentos
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: [true, 'O cliente é obrigatório']
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    required: [true, 'O pacote é obrigatório']
  },

  // Controle de Sessões
  sessoesContratadas: {
    type: Number,
    required: [true, 'O número de sessões é obrigatório'],
    min: [1, 'Deve ter pelo menos 1 sessão']
  },
  sessoesUsadas: {
    type: Number,
    default: 0,
    min: [0, 'Sessões usadas não pode ser negativo']
  },
  sessoesRestantes: {
    type: Number,
    required: true,
    min: 0
  },

  // Valores
  valorTotal: {
    type: Number,
    required: [true, 'O valor total é obrigatório'],
    min: [0, 'O valor não pode ser negativo']
  },
  valorPago: {
    type: Number,
    default: 0,
    min: [0, 'O valor pago não pode ser negativo']
  },
  valorPendente: {
    type: Number,
    required: true,
    min: 0
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
  parcelasPagas: {
    type: Number,
    default: 0,
    min: 0
  },
  valorParcela: {
    type: Number,
    default: 0,
    min: 0
  },

  // Status e Datas
  status: {
    type: String,
    enum: ['Ativo', 'Concluído', 'Cancelado', 'Expirado'],
    default: 'Ativo'
  },
  dataCompra: {
    type: Date,
    required: true,
    default: Date.now
  },
  dataExpiracao: {
    type: Date,
    default: null
  },
  diasValidade: {
    type: Number,
    default: null,
    min: 0
  },

  // Histórico de Uso
  historico: [{
    agendamento: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agendamento'
    },
    dataSessao: {
      type: Date,
      required: true
    },
    valorCobrado: {
      type: Number,
      required: true,
      min: 0
    },
    numeroDaSessao: {
      type: Number,
      required: true,
      min: 1
    },
    profissional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Extensões de Prazo
  extensoes: [{
    dataAnterior: {
      type: Date,
      required: true
    },
    novaData: {
      type: Date,
      required: true
    },
    motivo: {
      type: String,
      trim: true
    },
    realizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Índices para performance
compraPacoteSchema.index({ tenantId: 1, status: 1 });
compraPacoteSchema.index({ tenantId: 1, cliente: 1, status: 1 });
compraPacoteSchema.index({ dataExpiracao: 1 });
compraPacoteSchema.index({ tenantId: 1, dataExpiracao: 1, status: 1 });

// Middleware: Calcular campos derivados antes de salvar
compraPacoteSchema.pre('save', function(next) {
  // Calcular sessões restantes
  this.sessoesRestantes = this.sessoesContratadas - this.sessoesUsadas;

  // Calcular valor pendente
  this.valorPendente = this.valorTotal - this.valorPago;

  // Calcular valor da parcela se parcelado
  if (this.parcelado && this.numeroParcelas > 0) {
    this.valorParcela = this.valorTotal / this.numeroParcelas;
  }

  // Calcular data de expiração se for nova compra e tiver dias de validade
  if (this.isNew && this.diasValidade && !this.dataExpiracao) {
    const dataCompra = new Date(this.dataCompra);
    this.dataExpiracao = new Date(dataCompra.setDate(dataCompra.getDate() + this.diasValidade));
  }

  // Verificar se deve marcar como expirado
  if (this.dataExpiracao && new Date() > this.dataExpiracao && this.status === 'Ativo') {
    this.status = 'Expirado';
  }

  // Verificar se deve marcar como concluído
  if (this.sessoesRestantes === 0 && this.status === 'Ativo') {
    this.status = 'Concluído';
  }

  next();
});

// Método: Usar uma sessão do pacote
compraPacoteSchema.methods.usarSessao = function(agendamentoId, valorCobrado, profissionalId = null) {
  // Validações
  if (this.sessoesRestantes <= 0) {
    throw new Error('Pacote não possui sessões restantes');
  }

  if (this.status !== 'Ativo') {
    throw new Error(`Pacote não está ativo (status: ${this.status})`);
  }

  if (this.dataExpiracao && new Date() > this.dataExpiracao) {
    this.status = 'Expirado';
    throw new Error('Pacote expirado');
  }

  // Incrementar sessões usadas
  this.sessoesUsadas += 1;
  this.sessoesRestantes -= 1;

  // Adicionar ao histórico
  this.historico.push({
    agendamento: agendamentoId,
    dataSessao: new Date(),
    valorCobrado: valorCobrado,
    numeroDaSessao: this.sessoesUsadas,
    profissional: profissionalId
  });

  // Marcar como concluído se não tiver mais sessões
  if (this.sessoesRestantes === 0) {
    this.status = 'Concluído';
  }

  return this.save();
};

// Método: Estender prazo de validade
compraPacoteSchema.methods.estenderPrazo = function(novosDias, motivo, userId) {
  if (!novosDias || novosDias <= 0) {
    throw new Error('Número de dias deve ser maior que zero');
  }

  const dataAnterior = this.dataExpiracao;
  const novaData = new Date(this.dataExpiracao || new Date());
  novaData.setDate(novaData.getDate() + novosDias);

  this.dataExpiracao = novaData;

  // Adicionar ao histórico de extensões
  this.extensoes.push({
    dataAnterior,
    novaData,
    motivo,
    realizadoPor: userId
  });

  // Se estava expirado e ainda tem sessões, reativar
  if (this.status === 'Expirado' && this.sessoesRestantes > 0) {
    this.status = 'Ativo';
  }

  return this.save();
};

// Método: Registrar pagamento de parcela
compraPacoteSchema.methods.registrarPagamento = function(valorPago) {
  if (valorPago <= 0) {
    throw new Error('Valor do pagamento deve ser maior que zero');
  }

  this.valorPago += valorPago;
  this.valorPendente = this.valorTotal - this.valorPago;

  // Calcular parcelas pagas
  if (this.parcelado && this.valorParcela > 0) {
    this.parcelasPagas = Math.floor(this.valorPago / this.valorParcela);
  }

  return this.save();
};

// Método: Cancelar pacote
compraPacoteSchema.methods.cancelar = function(motivo = '') {
  this.status = 'Cancelado';

  // Adicionar motivo às extensões (reutilizando a estrutura)
  if (motivo) {
    this.extensoes.push({
      dataAnterior: this.dataExpiracao,
      novaData: this.dataExpiracao,
      motivo: `[CANCELAMENTO] ${motivo}`,
      realizadoPor: null
    });
  }

  return this.save();
};

// Método estático: Buscar pacotes expirando em breve
compraPacoteSchema.statics.buscarExpirandoEmBreve = function(tenantId, dias = 7) {
  const hoje = new Date();
  const dataLimite = new Date();
  dataLimite.setDate(hoje.getDate() + dias);

  return this.find({
    tenantId,
    status: 'Ativo',
    dataExpiracao: {
      $gte: hoje,
      $lte: dataLimite
    }
  }).populate('cliente pacote');
};

// Método estático: Buscar pacotes com poucas sessões
compraPacoteSchema.statics.buscarComPoucasSessoes = function(tenantId, limite = 2) {
  return this.find({
    tenantId,
    status: 'Ativo',
    sessoesRestantes: { $lte: limite, $gt: 0 }
  }).populate('cliente pacote');
};

// Exporta schema para uso no registry (database-per-tenant)
export { compraPacoteSchema as CompraPacoteSchema };

export default mongoose.model('CompraPacote', compraPacoteSchema);
