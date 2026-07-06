/**
 * iaClientLifecycle handler — F12 Route.CLIENT_LIFECYCLE_PENDING.
 *
 * Delegates the inbound to the Python ia-service (`/process-client`).
 * Used for existing clients messaging via WhatsApp to book, reschedule,
 * or ask about services.
 *
 * On failure (timeout, network, Python down) falls back to the legacy
 * greeting handler so the client is not left silent.
 */

import * as iaServiceClient from '../../../utils/iaServiceClient.js';
import { handle as handleLegacyFallback } from './legacyFallback.js';
import logger from '../../../utils/logger.js';

export async function handle(input) {
  const {
    tenant,
    tenantId,
    telefoneNormalizado,
    mensagem,
    messageId,
    timestamp,
    instanceName,
    persistedState,
  } = input;

  const clienteId = persistedState.existingClient?._id
    ? String(persistedState.existingClient._id)
    : null;

  if (!clienteId) {
    await handleLegacyFallback(input);
    return { delivered: true, source: 'fallback' };
  }

  try {
    await iaServiceClient.processClient({
      tenantId: tenantId ?? null,
      instanceName,
      telefone: telefoneNormalizado,
      mensagem,
      messageId,
      timestamp: timestamp instanceof Date
        ? timestamp.toISOString()
        : new Date(timestamp || Date.now()).toISOString(),
      clienteId,
      clienteNome: persistedState.existingClient?.nome || null,
      avisoIA: tenant?.configuracoes?.avisoIA || null,
    });
    return { delivered: true, source: 'ia_service' };
  } catch (err) {
    // Timeout: o ia-service continua a processar e entrega a resposta —
    // não duplicar com o greeting legacy (ver iaLeadLifecycle).
    if (err?.isTimeout) {
      logger.warn({ err: err?.message }, '[iaClientLifecycle] ia_service_lento — sem fallback');
      return { delivered: true, source: 'ia_service' };
    }
    logger.error({ err: err?.message }, '[iaClientLifecycle] ia_service_unreachable — fallback');
    await handleLegacyFallback(input);
    return { delivered: true, source: 'fallback' };
  }
}
