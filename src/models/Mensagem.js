import mongoose from 'mongoose';

const MensagemSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  telefone: { type: String, required: true },
  mensagem: { type: String, required: true },
  origem:   { type: String, enum: ['cliente', 'laura'], required: true },
  direcao:  { type: String, enum: ['entrada', 'saida'], default: 'entrada' },
  // Quem produziu a mensagem outbound: 'ia' (agente), 'humano' (resposta manual
  // no inbox) ou 'cliente' (inbound). Aditivo e opcional — docs antigos não têm
  // o campo; o inbox trata ausência de 'ia'/'humano' em outbound como IA.
  geradoPor: { type: String, enum: ['ia', 'humano', 'cliente'] },
  data:     { type: Date, default: Date.now },
  conversa: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversa' },
}, { timestamps: false });

MensagemSchema.index({ conversa: 1, data: 1 });

export { MensagemSchema };
export default mongoose.model('Mensagem', MensagemSchema);