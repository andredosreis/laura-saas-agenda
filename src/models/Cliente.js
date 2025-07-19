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
    set: v => {
      if (!v) return v;
      // Remove caracteres não numéricos
      return v.replace(/[^\d]/g, '');
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^[\w-]+(?:\.[\w-]+)*@(?:[\w-]+\.)+[a-zA-Z]{2,7}$/, 'Email inválido.'],
    unique: true,
    sparse: true, // Permite valores nulos, mas impõe unicidade para não nulos
    set: v => (v === '' ? null : v) // Converte string vazia para null
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

clienteSchema.add({
  // --- CAMPOS DA FICHA DE ANAMNESE ---
  costumaPermanecerMuitoTempoSentada: { type: Boolean, default: false },
  alergias: { type: String, trim: true, default: '' },
  historicoMedico: { type: String, trim: true, default: '' },
  medicamentosEmUso: { type: String, trim: true, default: '' },
  antecedentesCirurgicos: { type: String, trim: true, default: '' },
  cicloMenstrualRegular: { type: String, enum: ['Sim', 'Não', 'N/A', ''], default: '' }, // Adicionei '' para o default se não preenchido
  usaAnticoncepcional: { type: Boolean, default: false },
  temHipertensao: { type: Boolean, default: false },
  temDiabetes: { type: Boolean, default: false },
  temEpilepsia: { type: Boolean, default: false },
  temMarcapasso: { type: Boolean, default: false },
  temMetais: { type: Boolean, default: false },
  // Campos de observação mais específicos da anamnese
  qualAlergia: { type: String, trim: true, default: '' }, // Campo para "Qual?" da alergia
  qualHistorico: { type: String, trim: true, default: '' }, // Campo para "Qual?" do histórico
  qualMedicamento: { type: String, trim: true, default: '' }, // Campo para "Qual?" do medicamento
  qualCirurgia: { type: String, trim: true, default: '' }, // Campo para "Qual?" da cirurgia
  qualAnticoncepcional: { type: String, trim: true, default: '' }, // Campo para "Qual?" do anticoncepcional
  grauHipertensao: { type: String, trim: true, default: '' }, // Campo para "Grau?" da hipertensão
  tipoDiabetes: { type: String, trim: true, default: '' }, // Campo para "Tipo?" da diabetes
  qualEpilepsia: { type: String, trim: true, default: '' }, // Campo para "Qual?" da epilepsia
  observacoesAdicionaisAnamnese: { type: String, trim: true, default: '' }, // Para observações gerais da anamnese
  estadoConversa: {
    type: String,
    default: 'inicial', // Ex: inicial, aguardando_confirmacao_cliente, aguardando_dados_cadastro, cadastrado, etc.
    enum: [
      'inicial',
      'aguardando_confirmacao_cliente',
      'aguardando_dados_cadastro',
      'cadastrado',
      'aguardando_info_extra',
      'aguardando_agendamento',
      'aguardando_feedback',
      'inativo'
    ]
  },
  historicoMensagens: [
    {
      data: { type: Date, default: Date.now },
      mensagem: String,
      resposta: String,
      intent: String, // Ex: novo_agendamento, reagendamento, etc.
      entidades: Object // Para guardar entidades extraídas, se quiser
    }
  ],
  preferencias: {
    tomDeVoz: { type: String, default: '' }, // Ex: "formal", "informal", "carinhosa"
    assuntosFrequentes: [String],
    outros: { type: Object, default: {} }
  }

});

clienteSchema.index({ nome: 1 });

const Cliente = mongoose.model('Cliente', clienteSchema);

module.exports = Cliente;