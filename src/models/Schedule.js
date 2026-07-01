import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
  // 🆕 MULTI-TENANT: Identificador do tenant
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true
  },
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0, // 0 para Domingo, 1 para Segunda, etc.
    max: 6,
    // Removido unique: true - agora é único por tenant (ver índice composto abaixo)
  },
  label: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  startTime: {
    type: String,
    default: '09:00',
  },
  endTime: {
    type: String,
    default: '18:00',
  },
  breakStartTime: {
    type: String,
    default: '12:00',
  },
  breakEndTime: {
    type: String,
    default: '13:00',
  },
  // Nota livre opcional sobre o horário base deste dia (F02)
  observacao: {
    type: String,
    default: '',
    maxlength: 280,
  },
}, { timestamps: true });

// Único por tenant: no máximo um documento por dia da semana por tenant.
// A migração F03 (seedScheduleFromAgentRules) depende desta unicidade para
// fazer upserts idempotentes por (tenantId, dayOfWeek).
scheduleSchema.index({ tenantId: 1, dayOfWeek: 1 }, { unique: true });

// Exporta schema para uso no registry (database-per-tenant)
export { scheduleSchema as ScheduleSchema };

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;