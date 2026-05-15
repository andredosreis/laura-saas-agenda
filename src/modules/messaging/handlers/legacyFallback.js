/**
 * legacyFallback handler — F12 Route.LEGACY_FALLBACK + Route.CLIENT_LIFECYCLE_PENDING.
 *
 * Sends a single period-of-day greeting and marks the Client (when present)
 * as `etapaConversa='aguardando_laura'` so subsequent inbounds from the same
 * phone do NOT receive duplicate greetings — the human professional takes
 * over from there.
 *
 * Used by:
 *   - Route.LEGACY_FALLBACK (IA disabled / leads disabled / data-integrity guard)
 *   - Route.CLIENT_LIFECYCLE_PENDING (matrix rows 4-5: existing Client; the
 *     Client lifecycle SDD will replace this dispatch with the real IA handler)
 *
 * Pure relocation of the legacy `delegarParaIAAsync` logic from
 * `src/modules/ia/webhookController.js`. No behaviour change.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §6.1
 */

import { DateTime } from 'luxon';
import { sendWhatsAppMessage } from '../../../utils/evolutionClient.js';

/**
 * @param {object} input
 * @param {object} [input.tenant]
 * @param {object} [input.models]
 * @param {string} input.telefoneNormalizado
 * @param {string|null} input.instanceName
 * @param {{ existingClient: object|null }} [input.persistedState]
 * @returns {Promise<{ delivered: boolean, source: 'fallback_greeting' | 'skipped' }>}
 */
export async function handle(input) {
  const { telefoneNormalizado, instanceName, persistedState, models } = input;

  if (!telefoneNormalizado) {
    console.warn('[legacyFallback] missing telefoneNormalizado — abort');
    return { delivered: false, source: 'skipped' };
  }

  // Skip only if THIS handler already greeted the Client (sentinel value
  // 'aguardando_laura' set on a previous run). The schema default is
  // 'inicial' (truthy), so testing for any truthy value would skip every
  // existing Client — that was a pre-F12 bug. The correct sentinel is the
  // one we set ourselves below.
  const existingClient = persistedState?.existingClient || null;
  if (existingClient?.etapaConversa === 'aguardando_laura') {
    return { delivered: false, source: 'skipped' };
  }

  // Period-of-day greeting in Europe/Lisbon timezone
  const agora = DateTime.now().setZone('Europe/Lisbon');
  const hora = agora.hour;
  let saudacao;
  if (hora >= 6 && hora < 12) saudacao = 'Bom dia';
  else if (hora >= 12 && hora < 19) saudacao = 'Boa tarde';
  else saudacao = 'Boa noite';

  const mensagemAutomatica = `${saudacao}! 👋

Tudo bem? Sou um assistente virtual da *Laura*.

Em breve ela entrará em contato para mais informações. 💆‍♀️✨

_La Estética Avançada_`;

  await sendWhatsAppMessage(telefoneNormalizado, mensagemAutomatica, instanceName);

  // Mark Client as already greeted using the sentinel 'aguardando_laura'.
  // Uses updateOne (no schema validators) because the value is intentionally
  // outside the strict enum defined on `etapaConversa`. The sentinel is read
  // by the early-return guard above to prevent duplicate greetings; it is
  // never user-facing.
  if (existingClient && models?.Cliente) {
    try {
      await models.Cliente.updateOne(
        { _id: existingClient._id },
        { $set: { etapaConversa: 'aguardando_laura' } },
      );
    } catch (err) {
      console.warn('[legacyFallback] failed to mark Client.etapaConversa:', err?.message);
    }
  }

  return { delivered: true, source: 'fallback_greeting' };
}
