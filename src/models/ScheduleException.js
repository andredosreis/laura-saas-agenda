import mongoose from 'mongoose';

/**
 * Excepção de disponibilidade por data (F02 — ADR-028 Fase 1).
 *
 * Uma excepção substitui o horário base recorrente para a sua `data`:
 *   - `fechado`          → dia fechado (sem slots)
 *   - `horas-extra`      → janela `inicio`..`fim` como horário de trabalho desse dia
 *   - `horario-especial` → idem (semântica de janela especial que substitui a base)
 *
 * Chave única `(tenantId, data)` — no máximo uma excepção por data por tenant.
 */
const scheduleExceptionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'TenantId é obrigatório'],
    index: true,
  },
  data: {
    type: String, // "YYYY-MM-DD" (date-only, TZ-safe key)
    required: true,
  },
  tipo: {
    type: String,
    required: true,
    enum: ['fechado', 'horas-extra', 'horario-especial'],
  },
  inicio: {
    type: String, // "HH:mm" — null para `fechado`
    default: null,
  },
  fim: {
    type: String, // "HH:mm" — null para `fechado`
    default: null,
  },
  observacao: {
    type: String,
    default: '',
    maxlength: 280,
  },
}, { timestamps: true });

// Uma excepção por data por tenant (semântica de override)
scheduleExceptionSchema.index({ tenantId: 1, data: 1 }, { unique: true });

// Exporta schema para uso no registry (database-per-tenant)
export { scheduleExceptionSchema as ScheduleExceptionSchema };

const ScheduleException = mongoose.model('ScheduleException', scheduleExceptionSchema);
export default ScheduleException;
