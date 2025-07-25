// src/models/Conversa.js
const mongoose = require('mongoose');

// Subschema para armazenar dados temporários coletados via LLM
const DadosSchema = new mongoose.Schema({
  clientId: { type: String },    // preenchido após persistência
  name: { type: String },
  telephone: { type: String },
  dateOfBirth: { type: Date }// jamais pegar dados dos clientes se for novo por causa do LGPD
}, { _id: false });

const ConversaSchema = new mongoose.Schema({
  telefone: { type: String, required: true, unique: true },
  estado: {
    type: String,
    enum: [
       // inicialização do fluxo
      'iniciando', 
      // novo cliente: nome e telefone
      'aguardando_nome', 
      'aguardando_telefone',
      // clientes antigos
      'aguardando_data_nascimento', // cliente existente: data de nascimento
      'aguardando_agendamento',  // após criar cliente, coletar slot
      'fluxo_concluido'          // diálogo encerrado
    ],
    default: 'iniciando'
  },
  dados: {
    type: DadosSchema,
    default: {}
  },
  ultimaInteracao: { type: Date, default: Date.now }
});

// Atualiza automaticamente a data da última interação
ConversaSchema.pre('save', function(next) {
  this.ultimaInteracao = new Date();
  next();
});

module.exports = mongoose.model('Conversa', ConversaSchema);
