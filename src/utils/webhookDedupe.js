import ProcessedMessage from '../models/ProcessedMessage.js';
import logger from './logger.js';

/**
 * Anti-replay para webhooks Evolution API.
 *
 * Atomicamente marca um messageId como processado e retorna se é novo
 * ou duplicado. Usa o unique index do ProcessedMessage para resolver
 * race conditions sem locks aplicacionais.
 *
 * @param {string|undefined} messageId — `key.id` da mensagem Evolution
 * @returns {Promise<boolean>} true se NOVO (caller processa), false se DUPLICATE (caller ignora)
 */
export async function markMessageSeen(messageId) {
    if (!messageId) return true; // sem ID, não há dedupe possível — processar

    try {
        await ProcessedMessage.create({ messageId });
        return true; // novo
    } catch (err) {
        if (err.code === 11000) {
            return false; // duplicate key — já processada
        }
        // Erros inesperados (DB down, etc.) — não bloquear o webhook por bug interno
        logger.error({ err, messageId }, '[WebhookDedupe] Erro inesperado — processando por defeito');
        return true;
    }
}
