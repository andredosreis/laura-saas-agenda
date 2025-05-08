const mongoose = require('mongoose');

const clienteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true, // Remove espaços em branco no início e fim
    minlength: [3, 'Nome deve ter no mínimo 3 caracteres']
  },
  telefone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    unique: true,
    minlength: [9, 'Telefone deve ter no mínimo 9 dígitos'],
    maxlength: [15, 'Telefone deve ter no máximo 15 dígitos'],
    match: [/^[\d\+\-\(\)\s]+$/, 'Formato de telefone inválido. Use apenas números, +, -, (, ) e espaços'],
    // Função para limpar o telefone antes de salvar
    set: v => v.replace(/\s+/g, '').trim() // Remove espaços extras
  },
  dataNascimento: {
    type: Date,
    required: [true, 'Data de nascimento é obrigatória'],
    validate: {
      validator: function(data) {
        // Verifica se a data não é futura e se a pessoa tem pelo menos 16 anos
        const hoje = new Date();
        let idade = hoje.getFullYear() - data.getFullYear(); // Mudou de const para let
        const mesAtual = hoje.getMonth() - data.getMonth();
        
        if (mesAtual < 0 || (mesAtual === 0 && hoje.getDate() < data.getDate())) {
          idade--;
        }
        
        return data <= hoje && idade >= 16;
      },
      message: 'Data de nascimento inválida. Cliente deve ter pelo menos 16 anos.'
    }
  },
  sessoesRestantes: {
    type: Number,
    default: 0,
    min: [0, 'Número de sessões não pode ser negativo'],
    validate: {
      validator: Number.isInteger,
      message: 'Número de sessões deve ser um número inteiro'
    }
  },
  criadoEm: {
    type: Date,
    default: Date.now,
    immutable: true // Não permite alteração após criação
  },
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    default: null
  },
  // Campos adicionais úteis
  ultimaAtualizacao: {
    type: Date,
    default: Date.now
  },
  observacoes: {
    type: String,
    trim: true,
    maxlength: [500, 'Observações não podem passar de 500 caracteres']
  },
  ativo: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true, // Adiciona automaticamente createdAt e updatedAt
  toJSON: { virtuals: true }, // Permite usar virtuals quando converter para JSON
  toObject: { virtuals: true }
});

// Middleware para atualizar ultimaAtualizacao
clienteSchema.pre('save', function(next) {
  this.ultimaAtualizacao = new Date();
  next();
});

// Virtual para idade
clienteSchema.virtual('idade').get(function() {
  const hoje = new Date();
  const nascimento = new Date(this.dataNascimento);
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mesAtual = hoje.getMonth() - nascimento.getMonth();
  
  if (mesAtual < 0 || (mesAtual === 0 && hoje.getDate() < nascimento.getDate())) {
    idade--;
  }
  
  return idade;
});

// Índices

clienteSchema.index({ nome: 1 });

const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;