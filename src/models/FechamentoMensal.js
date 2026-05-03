import mongoose from 'mongoose';

// Snapshot mensal "soft close": fotografia do mês para histórico/auditoria.
// NÃO bloqueia mutações posteriores — se um lançamento retroactivo cair num mês
// já fechado, o snapshot fica desactualizado (campo `stale`) e o utilizador
// re-fecha manualmente (incrementa `versao`).

// Sub-schemas pequenos com `_id: false` para evitar IDs inúteis nos arrays
const totalCategoriaSchema = new mongoose.Schema({
  categoria: { type: String, required: true },
  valor: { type: Number, required: true, min: 0 }
}, { _id: false });

const totalFormaSchema = new mongoose.Schema({
  forma: { type: String, required: true },
  valor: { type: Number, required: true, min: 0 }
}, { _id: false });

const fechamentoMensalSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  ano: { type: Number, required: true, min: 2020, max: 2099 },
  mes: { type: Number, required: true, min: 1, max: 12 },

  periodo: {
    inicio: { type: Date, required: true },
    fim:    { type: Date, required: true }
  },

  totais: {
    receitas:  { type: Number, default: 0, min: 0 },
    despesas:  { type: Number, default: 0, min: 0 },
    saldo:     { type: Number, default: 0 },
    pendente:  { type: Number, default: 0, min: 0 },
    receitasPorCategoria:        { type: [totalCategoriaSchema], default: [] },
    receitasPorFormaPagamento:   { type: [totalFormaSchema],     default: [] },
    despesasPorCategoria:        { type: [totalCategoriaSchema], default: [] }
  },

  contagens: {
    transacoes:    { type: Number, default: 0, min: 0 },
    pagamentos:    { type: Number, default: 0, min: 0 },
    comprasPacote: { type: Number, default: 0, min: 0 }
  },

  // Lançamentos com origemRetroactiva preenchido cujo dataPagamento cai neste período.
  retroactivos: {
    quantidade: { type: Number, default: 0, min: 0 },
    valorTotal: { type: Number, default: 0, min: 0 }
  },

  observacoes: { type: String, maxlength: 1000 },

  // Versionamento para re-fechamento idempotente.
  // Cada re-fechamento incrementa `versao` via $inc no findOneAndUpdate.
  versao: { type: Number, default: 1, min: 1 },

  fechadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fechadoEm: { type: Date, default: Date.now },
  criadoEm:  { type: Date, default: Date.now },

  // Marcado quando uma mutação posterior cai neste período.
  // Implementado em PR7 (hook). Neste PR fica como campo passivo.
  stale: {
    desde: Date,
    transacoesIds: [{ type: mongoose.Schema.Types.ObjectId }]
  }
}, { timestamps: true });

// Um snapshot por (tenant, ano, mes). Re-fechamento usa upsert + $inc.
fechamentoMensalSchema.index({ tenantId: 1, ano: 1, mes: 1 }, { unique: true });
// Para listagens ordenadas (mais recente primeiro).
fechamentoMensalSchema.index({ tenantId: 1, ano: -1, mes: -1 });

export { fechamentoMensalSchema as FechamentoMensalSchema };
export default mongoose.model('FechamentoMensal', fechamentoMensalSchema);
