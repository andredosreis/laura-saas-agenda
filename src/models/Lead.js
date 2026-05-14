import mongoose from 'mongoose';
import { LEAD_STAGES, ORIGEM_VALUES, URGENCIA_VALUES } from '../modules/leads/pipelineConstants.js';

const { Schema } = mongoose;

/**
 * Lead — contacto inbound (WhatsApp ou manual) ainda não convertido em Cliente.
 *
 * Vive na DB do tenant (DB-per-tenant, ADR-001 / ADR-002). Convertido para
 * Cliente via endpoint /api/leads/:id/convert (manual, decisão do user).
 */
const leadSchema = new Schema({
  // Multi-tenant: idêntico aos outros modelos do registry
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'tenantId é obrigatório'],
    index: true,
  },

  // Pode ser null no início — IA recolhe nome durante qualificação
  nome: {
    type: String,
    trim: true,
    maxlength: [100, 'Nome não pode exceder 100 caracteres'],
  },

  // Telefone normalizado (só dígitos), obrigatório
  telefone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    minlength: [9, 'Telefone deve ter no mínimo 9 dígitos'],
    maxlength: [15, 'Telefone deve ter no máximo 15 dígitos'],
    set: v => v ? String(v).replace(/[^\d]/g, '') : v,
  },

  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true,
    set: v => (v === '' ? null : v),
  },

  origem: {
    type: String,
    enum: ORIGEM_VALUES,
    default: 'whatsapp',
    index: true,
  },

  status: {
    type: String,
    enum: LEAD_STAGES,
    default: 'novo',
    index: true,
  },

  interesse: {
    type: String,
    trim: true,
    maxlength: [200, 'Interesse não pode exceder 200 caracteres'],
  },

  urgencia: {
    type: String,
    enum: URGENCIA_VALUES,
    default: 'baixa',
  },

  observacoes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Observações não podem exceder 1000 caracteres'],
  },

  ultimaInteracao: {
    type: Date,
    default: Date.now,
    index: true,
  },

  // Refs (preenchidas conforme o lead progride no funil)
  conversa:    { type: Schema.Types.ObjectId, ref: 'Conversa' },
  agendamento: { type: Schema.Types.ObjectId, ref: 'Agendamento' },
  cliente:     { type: Schema.Types.ObjectId, ref: 'Cliente' }, // só quando status='convertido'

  // Toggle "pausar IA neste lead" — usado quando a clínica responde manualmente
  // (Phase 4: ia-service Python verifica este campo e faz early return).
  iaAtiva: { type: Boolean, default: true },

  // Qualificação capturada pela IA (Phase 4)
  qualificacao: {
    score: { type: Number, min: 0, max: 100, default: 0 },
    motivoInteresse: { type: String, trim: true },
    objetivos: [{ type: String, trim: true }],
  },

  // Razão de "perdido"
  perdido: {
    motivo: { type: String, trim: true },
    em: { type: Date },
  },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Índices para isolamento + performance
// telefone único por tenant (não global) — mesmo padrão do Cliente
leadSchema.index({ tenantId: 1, telefone: 1 }, { unique: true });
// Listagem default no Kanban: por tenant, status, ordenado por última interacção desc
leadSchema.index({ tenantId: 1, status: 1, ultimaInteracao: -1 });
// Filtros por origem (campanhas)
leadSchema.index({ tenantId: 1, origem: 1, ultimaInteracao: -1 });

// Update automático de `ultimaInteracao` quando o lead é tocado.
// Em mongoose 9.x os hooks usam estilo Promise (sem `next`).
leadSchema.pre('save', function () {
  if (this.isModified() && !this.isNew) {
    this.ultimaInteracao = new Date();
  }
});

// Exporta schema para uso no registry (database-per-tenant)
export { leadSchema as LeadSchema };

export default mongoose.model('Lead', leadSchema);
