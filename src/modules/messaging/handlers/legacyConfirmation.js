/**
 * legacyConfirmation handler — F12 Route.LEGACY_CONFIRMATION.
 *
 * Processes SIM/NÃO replies that match a pending Agendamento confirmation
 * (matrix row 2 of PRD §1.1). The handler:
 *
 *   1. Re-fetches the pending Agendamento by ID for mutation (router gave
 *      us only the ID via persistedState).
 *   2. Mutates confirmacao.tipo + status atomically per the SIM/NÃO branch.
 *   3. Sends the confirmation reply WhatsApp message to the sender.
 *   4. Notifies the tenant admin (if a `numeroWhatsapp` is configured).
 *
 * Pure relocation of the legacy `processarConfirmacaoAsync` logic from
 * `src/modules/ia/webhookController.js`. No behaviour change.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §6.1
 */

import { DateTime } from 'luxon';
import Tenant from '../../../models/Tenant.js';
import { sendWhatsAppMessage } from '../../../utils/evolutionClient.js';

/**
 * Resolve the Evolution instance to use for outbound: prefer the one passed
 * in (already resolved upstream), fall back to the tenant's configured
 * instance, then to null (env default).
 */
async function resolveOutboundInstance(tenantId, currentInstance) {
  if (currentInstance) return currentInstance;
  if (!tenantId) return null;
  try {
    const t = await Tenant.findById(tenantId).select('whatsapp.instanceName').lean();
    return t?.whatsapp?.instanceName || null;
  } catch {
    return null;
  }
}

/**
 * @param {object} input
 * @param {object} input.tenant                tenant doc (lean)
 * @param {object} input.models                tenant DB models from registry
 * @param {string} input.tenantId
 * @param {string} input.telefoneNormalizado
 * @param {string} input.mensagem              original raw text
 * @param {{ kind: string, normalized: string }} input.classified
 * @param {string|null} input.instanceName
 * @param {{ pendingAppointmentId: string|null, existingClient: object|null, existingLead: object|null }} input.persistedState
 * @returns {Promise<{ delivered: boolean, novoStatus?: string }>}
 */
export async function handle({
  tenant,
  models,
  tenantId,
  telefoneNormalizado,
  mensagem,
  classified,
  instanceName,
  persistedState,
}) {
  const { pendingAppointmentId, existingClient, existingLead } = persistedState;

  if (!pendingAppointmentId) {
    // Defensive: the router only emits this route when hasPendingAppointment=true.
    // If we get here without an ID, something upstream is wrong.
    console.warn('[legacyConfirmation] missing pendingAppointmentId — abort');
    return { delivered: false };
  }

  const agendamento = await models.Agendamento.findById(pendingAppointmentId);
  if (!agendamento) {
    console.warn(`[legacyConfirmation] Agendamento ${pendingAppointmentId} not found`);
    return { delivered: false };
  }

  // Resolve sender display name (Client first, then Lead-side appointment data)
  const nomeRemetente =
    (existingClient && (await models.Cliente.findById(existingClient._id).select('nome').lean())?.nome) ||
    agendamento.lead?.nome ||
    existingLead?.nome ||
    null;

  const ehSim = classified?.kind === 'confirmation_yes';
  const ehNao = classified?.kind === 'confirmation_no';

  let resposta = '';
  let novoStatus = '';

  if (ehSim) {
    agendamento.confirmacao.tipo = 'confirmado';
    agendamento.confirmacao.respondidoEm = new Date();
    agendamento.confirmacao.respondidoPor = 'cliente';
    agendamento.status = 'Confirmado';
    agendamento.markModified('confirmacao');
    novoStatus = 'confirmado';

    const dataFormatada = DateTime.fromJSDate(agendamento.dataHora)
      .setZone('Europe/Lisbon')
      .toFormat("dd/MM/yyyy 'às' HH:mm");

    resposta = `✅ Obrigada pela confirmação${nomeRemetente ? `, ${nomeRemetente}` : ''}! A sua sessão está marcada para ${dataFormatada}. Até breve! 💆‍♀️✨`;
  } else if (ehNao) {
    agendamento.confirmacao.tipo = 'rejeitado';
    agendamento.confirmacao.respondidoEm = new Date();
    agendamento.confirmacao.respondidoPor = 'cliente';
    agendamento.status = 'Cancelado Pelo Cliente';
    agendamento.markModified('confirmacao');
    novoStatus = 'rejeitado';

    resposta = `Entendido${nomeRemetente ? `, ${nomeRemetente}` : ''}. 📅\n\nPara reagendarmos, indique por favor o dia e hora que prefere e iremos analisar a nossa agenda para lhe propor a melhor opção.\n\nObrigada! 💆‍♀️✨`;
  } else {
    // Should be unreachable — router only routes here for confirmation kinds.
    console.warn(`[legacyConfirmation] non-confirmation kind: ${classified?.kind}`);
    return { delivered: false };
  }

  await agendamento.save();

  const outboundInstance = await resolveOutboundInstance(tenantId, instanceName);
  await sendWhatsAppMessage(telefoneNormalizado, resposta, outboundInstance);

  // Notify admin if a number is configured
  const numeroAdmin = tenant?.whatsapp?.numeroWhatsapp || tenant?.contato?.telefone;
  if (numeroAdmin) {
    const dataFormatadaAdmin = DateTime.fromJSDate(agendamento.dataHora)
      .setZone('Europe/Lisbon')
      .toFormat('HH:mm');

    const msgAdmin =
      novoStatus === 'confirmado'
        ? `✅ *Agendamento Confirmado*\n\nOlá, Administrador!\n\n*${nomeRemetente || 'Cliente'}* confirmou a sessão das *${dataFormatadaAdmin}* de hoje.`
        : `❌ *Agendamento Cancelado*\n\nOlá, Administrador!\n\n*${nomeRemetente || 'Cliente'}* cancelou a sessão das *${dataFormatadaAdmin}* de hoje.`;

    await sendWhatsAppMessage(numeroAdmin, msgAdmin, outboundInstance);
  }

  return { delivered: true, novoStatus };
}
