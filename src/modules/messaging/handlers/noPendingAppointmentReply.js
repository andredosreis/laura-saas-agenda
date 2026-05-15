/**
 * noPendingAppointmentReply handler — F12 Route.NO_PENDING_APPOINTMENT_REPLY.
 *
 * Triggered when the inbound is a SIM/NÃO confirmation but no pending
 * Agendamento exists for the phone in the lookup window. Without this
 * handler, the alternative would be to feed the bare confirmation to the
 * LLM agent — which would burn tokens on a confused turn ("sim a quê?").
 *
 * Sends a deterministic acknowledgement verbatim. The next substantive
 * inbound naturally routes to IA_LEAD via the router's default branch.
 *
 * Properties of the fixed copy (spec §6.2):
 *   - Acknowledges receipt without assuming intent
 *   - Informs absence of pending appointment (useful surprise for the user)
 *   - Opens door without directing
 *   - Next message routes naturally — substantive → IA_LEAD; another bare
 *     confirmation → repeats this fallback without escalating
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §6.1, §6.2
 */

import { sendWhatsAppMessage } from '../../../utils/evolutionClient.js';

/**
 * Fixed reply copy. NOT LLM-generated — sent verbatim. If you change this,
 * also update the spec §6.2 reference copy and the corresponding E2E test.
 */
export const NO_PENDING_APPOINTMENT_COPY =
  'Olá! 😊 Recebi a sua mensagem, mas não encontrei nenhum agendamento pendente de confirmação. ' +
  'Se quiser informações ou marcar algo, é só dizer-me como posso ajudar.';

/**
 * @param {object} input
 * @param {string} input.telefoneNormalizado
 * @param {string|null} input.instanceName
 * @returns {Promise<{ delivered: boolean, source: 'no_pending_appointment_reply' }>}
 */
export async function handle({ telefoneNormalizado, instanceName }) {
  if (!telefoneNormalizado) {
    console.warn('[noPendingAppointmentReply] missing telefoneNormalizado — abort');
    return { delivered: false, source: 'no_pending_appointment_reply' };
  }

  await sendWhatsAppMessage(telefoneNormalizado, NO_PENDING_APPOINTMENT_COPY, instanceName);
  return { delivered: true, source: 'no_pending_appointment_reply' };
}
