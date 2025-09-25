import mongoose from 'mongoose';

const clienteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true,
    minlength: [3, 'Nome deve ter no mínimo 3 caracteres']
  },
  telefone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    unique: true,
    minlength: [9, 'Telefone deve ter no mínimo 9 dígitos'],
    maxlength: [15, 'Telefone deve ter no máximo 15 dígitos'],
    match: [/^[\d\+\-\(\)\s]+$/, 'Formato de telefone inválido.'],
    set: v => v ? v.replace(/[^\d]/g, '') : v
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Email inválido.'],
    unique: true,
    sparse: true,
    set: v => (v === '' ? null : v)
  },
  dataNascimento: {
    type: Date,
    required: [true, 'Data de nascimento é obrigatória'],
    validate: {
      validator: function(data) {
        const hoje = new Date();
        let idade = hoje.getFullYear() - data.getFullYear(); // Corrigido para let
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
  pacote: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pacote',
    default: null
  },
  observacoes: {
    type: String,
    trim: true,
    maxlength: [500, 'Observações não podem passar de 500 caracteres']
  },
  ativo: {
    type: Boolean,
    default: true
  },
  // --- CAMPOS DA FICHA DE ANAMNESE ---
  costumaPermanecerMuitoTempoSentada: { type: Boolean, default: false },
  alergias: { type: String, trim: true, default: '' },
  qualAlergia: { type: String, trim: true, default: '' },
  historicoMedico: { type: String, trim: true, default: '' },
  qualHistorico: { type: String, trim: true, default: '' },
  medicamentosEmUso: { type: String, trim: true, default: '' },
  qualMedicamento: { type: String, trim: true, default: '' },
  antecedentesCirurgicos: { type: String, trim: true, default: '' },
  qualCirurgia: { type: String, trim: true, default: '' },
  cicloMenstrualRegular: { type: String, enum: ['Sim', 'Não', 'N/A', ''], default: '' },
  usaAnticoncepcional: { type: Boolean, default: false },
  qualAnticoncepcional: { type: String, trim: true, default: '' },
  temHipertensao: { type: Boolean, default: false },
  grauHipertensao: { type: String, trim: true, default: '' },
  temDiabetes: { type: Boolean, default: false },
  tipoDiabetes: { type: String, trim: true, default: '' },
  temEpilepsia: { type: Boolean, default: false },
  qualEpilepsia: { type: String, trim: true, default: '' },
  temMarcapasso: { type: Boolean, default: false },
  temMetais: { type: Boolean, default: false },
  observacoesAdicionaisAnamnese: { type: String, trim: true, default: '' },
  // --- CAMPOS DE GESTÃO DO CHATBOT ---
  etapaConversa: {
    type: String,
    default: 'inicial',
    enum: ['inicial', 'aguardando_nome', 'livre', 'aguardando_nova_data', 'aguardando_confirmacao_horario', 'inativo']
  },
  historicoMensagens: [
    {
      data: { type: Date, default: Date.now },
      mensagem: String,
      resposta: String,
      intent: String,
      entidades: Object
    }
  ]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual para idade (calculado, não guardado)
clienteSchema.virtual('idade').get(function() {
  if (!this.dataNascimento) return null;
  const hoje = new Date();
  const nascimento = new Date(this.dataNascimento);
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const mes = hoje.getMonth() - nascimento.getMonth();
  if (mes < 0 || (mes === 0 && hoje.getDate() < nascimento.getDate())) {
    idade--;
  }
  return idade;
});

const Cliente = mongoose.model('Cliente', clienteSchema);

// A correção principal está aqui
export default Cliente;