import mongoose from 'mongoose';

const agendamentoSchema = new mongoose.Schema({
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
    // Sugestão: Manter a lista limpa e consistente com um único padrão de capitalização.
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
  }
}, {
  timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// Índices para otimização de performance
agendamentoSchema.index({ dataHora: 1 });
agendamentoSchema.index({ cliente: 1 });
agendamentoSchema.index({ status: 1 });

// Middleware para validação antes de salvar
agendamentoSchema.pre('save', function(next) {
  if (this.isNew && this.dataHora < new Date()) {
    // Cria um erro que será capturado pelo bloco .catch() no controller
    return next(new Error('Não é possível criar agendamentos com data no passado.'));
  }
  next();
});

// A correção principal está aqui: usar "export default"
export default mongoose.model('Agendamento', agendamentoSchema);
