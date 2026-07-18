import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * PedidoEquipa — pedido que a IA enviou ao número pessoal da equipa.
 *
 * O registo permite relacionar respostas curtas da responsável ("diz-lhe que
 * sim") com o cliente/lead certo sem confiar no LLM para escolher um telefone.
 * Vive na DB do tenant e expira automaticamente após sete dias.
 */
const pedidoEquipaSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  contactoTipo: {
    type: String,
    enum: ['cliente', 'lead'],
    required: true,
  },
  contactoId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  contactoNome: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  contactoTelefone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20,
    set: (value) => String(value || '').replace(/\D/g, ''),
  },
  motivo: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  status: {
    type: String,
    enum: ['pendente', 'entregue', 'falhou'],
    default: 'pendente',
    index: true,
  },
  notificadoEm: {
    type: Date,
    default: Date.now,
  },
  respondidoEm: Date,
  respostaTexto: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  respostaMessageId: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
}, {
  timestamps: true,
});

pedidoEquipaSchema.index({ tenantId: 1, status: 1, notificadoEm: -1 });
pedidoEquipaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export { pedidoEquipaSchema as PedidoEquipaSchema };
export default mongoose.model('PedidoEquipa', pedidoEquipaSchema);
