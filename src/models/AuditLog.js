import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * AuditLog — registo imutável de acções de super-admin (ADR-024).
 *
 * Vive na DB partilhada (`laura-saas`), tal como Tenant e User, porque
 * regista acções que ATRAVESSAM tenants. É só escrito, nunca actualizado
 * nem apagado — a imutabilidade é garantida ao nível da aplicação:
 *   - única escrita é via `AuditLog.record()`
 *   - não existem rotas de update/delete
 *   - `updatedAt` desactivado (só `createdAt`)
 */
const AuditLogSchema = new Schema(
  {
    // Quem executou a acção
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail: { type: String, trim: true, lowercase: true }, // denormalizado p/ leitura

    // O que foi feito — ex: 'tenant.create', 'tenant.suspend', 'tenant.view'
    action: { type: String, required: true, trim: true },

    // Sobre que tenant (opcional — algumas acções são globais)
    targetTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },

    // Contexto adicional (campos alterados, valores anteriores/novos, etc.)
    metadata: { type: Schema.Types.Mixed, default: {} },

    // Origem do pedido
    ip: { type: String, default: null },

    // Resultado da acção — distingue acessos concedidos, negados e erros (ADR-024)
    status: { type: String, enum: ['ok', 'denied', 'error'], default: 'ok' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Índices para consulta de auditoria
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ targetTenantId: 1, createdAt: -1 });
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

/**
 * Cria uma entrada de auditoria — único ponto de escrita.
 *
 * Os chamadores (Fase 3) decidem como tratar falhas: para acções críticas
 * pode-se querer falhar a operação se a auditoria falhar; para leituras,
 * registar no logger e continuar. Por isso `record` não engole erros.
 */
AuditLogSchema.statics.record = function record({
  actorUserId,
  actorEmail,
  action,
  targetTenantId = null,
  metadata = {},
  ip = null,
  status = 'ok',
}) {
  return this.create({ actorUserId, actorEmail, action, targetTenantId, metadata, ip, status });
};

export default mongoose.model('AuditLog', AuditLogSchema);
