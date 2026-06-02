import crypto from 'crypto';
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

// Janela da deduplicação semântica (eventos quase simultâneos do Evolution).
const CONTENT_WINDOW_MS = 15_000;

/**
 * Anti-duplicação SEMÂNTICA — complementa markMessageSeen.
 *
 * O Evolution/Baileys pode emitir 2 eventos da MESMA mensagem com `key.id`
 * diferentes; a dedup por messageId não os apanha e a IA responde 2x.
 * Esta função ignora a mesma (telefone + texto) repetida numa janela curta,
 * via um bucket temporal na chave unique do ProcessedMessage (atómico, sem lock).
 *
 * @param {string} telefone   telefone normalizado (só dígitos)
 * @param {string} mensagem   texto da mensagem
 * @returns {Promise<boolean>} true se NOVO, false se DUPLICADO recente
 */
export async function markContentSeen(telefone, mensagem) {
    const texto = (mensagem || '').trim();
    if (!telefone || !texto) return true; // sem dados — não há dedupe possível

    const hash = crypto.createHash('sha1').update(texto).digest('hex').slice(0, 16);
    const bucket = Math.floor(Date.now() / CONTENT_WINDOW_MS);
    const key = `c:${telefone}:${hash}:${bucket}`;

    try {
        await ProcessedMessage.create({ messageId: key });
        return true; // novo
    } catch (err) {
        if (err.code === 11000) {
            return false; // mesma mensagem do mesmo número numa janela curta
        }
        logger.error({ err, telefone }, '[WebhookDedupe] Erro content dedupe — processando por defeito');
        return true;
    }
}
