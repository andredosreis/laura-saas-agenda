const mongoose = require('mongoose');

const pacoteSchema = new mongoose.Schema({
  nome: { type: String, required: true, unique: true },
  categoria: { type: String, required: true },
  descricao: { type: String },
  sessoes: { type: Number, default: 1 },
  videoDemoURL: { type: String },
  criadoEm: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pacote', pacoteSchema);
