import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * ProcessedMessage — idempotência de webhooks.
 *
 * Marca cada messageId já processado pelo webhook Evolution API.
 * Usa unique index para resolver race conditions atomicamente
 * (insert duplicado retorna E11000) e TTL index para auto-cleanup
 * após 5 minutos (alinhado com a janela de validação temporal do webhook).
 *
 * Vive na DB partilhada `laura-saas` (igual a Tenant/User) porque
 * o webhook é processado antes da resolução de tenant.
 */
const processedMessageSchema = new Schema({
    messageId: {
        type: String,
        required: true,
        unique: true
    },
    processedAt: {
        type: Date,
        default: Date.now,
        expires: 300 // TTL 5 minutos — MongoDB faz GC automático
    }
}, { collection: 'processedmessages' });

export default mongoose.model('ProcessedMessage', processedMessageSchema);
