import mongoose from 'mongoose';

const MensagemSchema = new mongoose.Schema({
  telefone: { type: String, required: true },
  mensagem: { type: String, required: true },
  origem: { type: String, enum: ['cliente', 'laura'], required: true },
  data: { type: Date, default: Date.now },
  conversa: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversa' }
});

export default mongoose.model('Mensagem', MensagemSchema);