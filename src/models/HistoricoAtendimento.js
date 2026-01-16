import mongoose from 'mongoose';

/**
 * Model: HistoricoAtendimento
 *
 * Armazena o histórico completo de cada atendimento realizado,
 * incluindo anamnese pré-atendimento, procedimentos realizados,
 * resultados observados e orientações pós-atendimento.
 *
 * @author Laura SaaS Team
 * @version 1.0.0
 */

const historicoAtendimentoSchema = new mongoose.Schema({
  // ============================================
  // MULTI-TENANT
  // ============================================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },

  // ============================================
  // RELACIONAMENTOS
  // ============================================
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: [true, 'Cliente é obrigatório'],
    index: true
  },

  agendamento: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agendamento',
    default: null,
    index: true
  },

  profissional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Profissional é obrigatório'],
    index: true
  },

  // ============================================
  // DADOS DO ATENDIMENTO
  // ============================================
  dataAtendimento: {
    type: Date,
    required: [true, 'Data do atendimento é obrigatória'],
    default: Date.now,
    index: true
  },

  servico: {
    type: String,
    required: [true, 'Nome do serviço é obrigatório'],
    trim: true,
    maxlength: [200, 'Nome do serviço não pode exceder 200 caracteres']
  },

  duracaoReal: {
    type: Number, // em minutos
    default: null,
    min: [0, 'Duração não pode ser negativa'],
    max: [600, 'Duração não pode exceder 10 horas']
  },

  // ============================================
  // ANAMNESE PRÉ-ATENDIMENTO
  // ============================================
  queixaPrincipal: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Queixa principal não pode exceder 1000 caracteres']
  },

  expectativas: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Expectativas não podem exceder 1000 caracteres']
  },

  sintomasRelatados: [{
    type: String,
    trim: true
  }],

  restricoes: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Restrições não podem exceder 1000 caracteres']
  },

  // ============================================
  // PROCEDIMENTO REALIZADO
  // ============================================
  tecnicasUtilizadas: [{
    type: String,
    trim: true,
    maxlength: [200, 'Nome da técnica não pode exceder 200 caracteres']
  }],

  produtosAplicados: [{
    type: String,
    trim: true,
    maxlength: [200, 'Nome do produto não pode exceder 200 caracteres']
  }],

  equipamentosUsados: [{
    type: String,
    trim: true,
    maxlength: [200, 'Nome do equipamento não pode exceder 200 caracteres']
  }],

  areasTrabalhas: [{
    type: String,
    trim: true,
    maxlength: [100, 'Nome da área não pode exceder 100 caracteres']
  }],

  intensidade: {
    type: String,
    enum: ['', 'Leve', 'Moderada', 'Intensa'],
    default: ''
  },

  // ============================================
  // OBSERVAÇÕES PÓS-ATENDIMENTO
  // ============================================
  resultadosImediatos: {
    type: String,
    trim: true,
    default: '',
    maxlength: [2000, 'Resultados imediatos não podem exceder 2000 caracteres']
  },

  reacoesCliente: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Reações do cliente não podem exceder 1000 caracteres']
  },

  orientacoesPassadas: {
    type: String,
    trim: true,
    default: '',
    maxlength: [2000, 'Orientações não podem exceder 2000 caracteres']
  },

  proximosPassos: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Próximos passos não podem exceder 1000 caracteres']
  },

  // ============================================
  // AVALIAÇÃO
  // ============================================
  satisfacaoCliente: {
    type: Number,
    min: [1, 'Satisfação mínima é 1'],
    max: [5, 'Satisfação máxima é 5'],
    default: null
  },

  observacoesProfissional: {
    type: String,
    trim: true,
    default: '',
    maxlength: [2000, 'Observações do profissional não podem exceder 2000 caracteres']
  },

  // ============================================
  // FOTOS (URLs - podem ser do S3, Cloudinary, etc)
  // ============================================
  fotosAntes: [{
    type: String,
    trim: true
  }],

  fotosDepois: [{
    type: String,
    trim: true
  }],

  // ============================================
  // CONTROLE
  // ============================================
  status: {
    type: String,
    enum: ['Rascunho', 'Finalizado'],
    default: 'Rascunho',
    index: true
  },

  // Permite edição apenas se for rascunho
  podeEditar: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ============================================
// ÍNDICES COMPOSTOS
// ============================================
historicoAtendimentoSchema.index({ tenantId: 1, cliente: 1, dataAtendimento: -1 });
historicoAtendimentoSchema.index({ tenantId: 1, profissional: 1, dataAtendimento: -1 });
historicoAtendimentoSchema.index({ tenantId: 1, status: 1 });

// ============================================
// VIRTUAL: Resumo do Atendimento
// ============================================
historicoAtendimentoSchema.virtual('resumo').get(function() {
  const partes = [];

  if (this.servico) partes.push(this.servico);
  if (this.tecnicasUtilizadas && this.tecnicasUtilizadas.length > 0) {
    partes.push(this.tecnicasUtilizadas.join(', '));
  }

  return partes.join(' - ') || 'Atendimento sem descrição';
});

// ============================================
// METHODS
// ============================================

/**
 * Finaliza o atendimento, impedindo futuras edições
 */
historicoAtendimentoSchema.methods.finalizar = function() {
  this.status = 'Finalizado';
  this.podeEditar = false;
  return this.save();
};

/**
 * Calcula a média de satisfação do cliente para um período
 */
historicoAtendimentoSchema.statics.mediaSatisfacao = async function(clienteId, dataInicio, dataFim) {
  const result = await this.aggregate([
    {
      $match: {
        cliente: clienteId,
        satisfacaoCliente: { $exists: true, $ne: null },
        dataAtendimento: {
          $gte: dataInicio,
          $lte: dataFim
        }
      }
    },
    {
      $group: {
        _id: null,
        media: { $avg: '$satisfacaoCliente' },
        total: { $sum: 1 }
      }
    }
  ]);

  return result.length > 0 ? result[0] : { media: 0, total: 0 };
};

/**
 * Busca técnicas mais utilizadas para um cliente
 */
historicoAtendimentoSchema.statics.tecnicasMaisUsadas = async function(clienteId, limite = 5) {
  const result = await this.aggregate([
    {
      $match: { cliente: clienteId }
    },
    {
      $unwind: '$tecnicasUtilizadas'
    },
    {
      $group: {
        _id: '$tecnicasUtilizadas',
        quantidade: { $sum: 1 }
      }
    },
    {
      $sort: { quantidade: -1 }
    },
    {
      $limit: limite
    }
  ]);

  return result;
};

// ============================================
// MIDDLEWARE
// ============================================

// Antes de salvar, impedir edição se já estiver finalizado
historicoAtendimentoSchema.pre('save', function(next) {
  if (!this.isNew && this.status === 'Finalizado' && !this.podeEditar) {
    const modifiedPaths = this.modifiedPaths();
    // Permite apenas mudança de status
    if (modifiedPaths.length > 0 && !modifiedPaths.includes('status')) {
      return next(new Error('Atendimento finalizado não pode ser editado'));
    }
  }
  next();
});

export default mongoose.model('HistoricoAtendimento', historicoAtendimentoSchema);
