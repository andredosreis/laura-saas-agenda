/**
 * iaLeadLifecycle handler — F12 Route.IA_LEAD.
 *
 * Delegates the inbound to the Python ia-service (`/process-lead`). Used for:
 *   - Matrix row 3: phone with no Lead and no Client (new capture)
 *   - Existing Lead with iaAtiva=true (continuation)
 *
 * The handler is a thin wrapper around `iaServiceClient.processLead(...)`:
 *   - Existing leadId is passed when present so the Python side can skip
 *     idempotent re-creation; otherwise Python will create the Lead.
 *   - On failure (timeout, network, Python down) falls back to the legacy
 *     greeting handler so the user is not left silent.
 *
 * Pure relocation of the legacy `processarMensagemLeadAsync` logic from
 * `src/modules/ia/webhookController.js`. No behaviour change.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §6.1
 */

import * as iaServiceClient from '../../../utils/iaServiceClient.js';
import { handle as handleLegacyFallback } from './legacyFallback.js';

/**
 * @param {object} input
 * @param {object} input.tenant
 * @param {string} input.tenantId
 * @param {string} input.telefoneNormalizado
 * @param {string} input.mensagem
 * @param {string} input.messageId
 * @param {Date|number} input.timestamp
 * @param {string|null} input.instanceName
 * @param {{ existingClient: object|null, existingLead: object|null }} input.persistedState
 * @returns {Promise<{ delivered: boolean, source: 'ia_service' | 'fallback' }>}
 */
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

  const leadId = persistedState.existingLead?._id
    ? String(persistedState.existingLead._id)
    : null;
  const clienteId = persistedState.existingClient?._id
    ? String(persistedState.existingClient._id)
    : null;

  try {
    await iaServiceClient.processLead({
      tenantId: tenantId ?? null,
      instanceName,
      telefone: telefoneNormalizado,
      mensagem,
      messageId,
      timestamp: timestamp instanceof Date
        ? timestamp.toISOString()
        : new Date(timestamp || Date.now()).toISOString(),
      clienteId,
      leadId,
      avisoIA: tenant?.configuracoes?.avisoIA || null,
    });
    return { delivered: true, source: 'ia_service' };
  } catch (err) {
    // Persistent failure → degrade to greeting fallback (spec §6.5).
    // Sentry captures the error via global integration.
    console.error('[iaLeadLifecycle] ia_service_unreachable — fallback:', err?.message);
    await handleLegacyFallback(input);
    return { delivered: true, source: 'fallback' };
  }
}
