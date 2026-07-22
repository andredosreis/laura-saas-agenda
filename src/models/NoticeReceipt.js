import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * NoticeReceipt — prova de que o aviso de privacidade foi APRESENTADO ao
 * titular (ADR-031, RECONCILIATION R7).
 *
 * Isto NÃO é consentimento. A v1 do modelo registava a entrega do aviso como
 * se fosse um consentimento (`tipo: 'politica_privacidade'` no `ConsentLog`),
 * o que é juridicamente errado: a informação do Art. 13 é um DEVER do
 * responsável, não uma autorização do titular. Os dois passaram a viver em
 * sítios separados.
 *
 * Append-only, como `ConsentLog`: escrita só por `record()`, sem rotas de
 * update/delete, `updatedAt` desactivado.
 *
 * Escrito pela submissão da ficha pública (F04). F01 só fornece o modelo —
 * não expõe qualquer rota HTTP sobre ele.
 */
const NoticeReceiptSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },

    // Versão do aviso apresentado + hash do texto exacto que o titular viu.
    versao: { type: String, required: true },
    textoHash: { type: String, required: true },

    // Canal por onde o aviso foi apresentado. Cresce quando houver outros
    // (ex.: 'email', 'presencial').
    canal: { type: String, required: true, enum: ['formulario'] },

    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NoticeReceiptSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 });

/** Regista a apresentação do aviso — único ponto de escrita. */
NoticeReceiptSchema.statics.record = function record({
  tenantId,
  clienteId,
  versao,
  textoHash,
  canal = 'formulario',
  ip = null,
}) {
  return this.create({ tenantId, clienteId, versao, textoHash, canal, ip });
};

export { NoticeReceiptSchema };
export default mongoose.model('NoticeReceipt', NoticeReceiptSchema);
