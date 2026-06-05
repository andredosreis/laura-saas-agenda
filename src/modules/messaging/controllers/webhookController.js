/**
 * webhookController — F12 entry point.
 *
 * POST /webhook/evolution
 *
 * Flow:
 *   1. Validation guards (event, group, fromMe, age, replay, JID) — short-circuit
 *      with HTTP 200 silently for any guard violation.
 *   2. Classify the inbound text.
 *   3. ACK Evolution with HTTP 200 immediately to avoid retries.
 *   4. Asynchronously: fetch routing state + decide route + dispatch handler
 *      + emit structured Pino telemetry.
 *
 * The body of the handler is now ~150 lines (was 567 inlined pre-F12). The
 * routing decision lives in `messageRouter.decide`; each side-effect lives
 * in its own handler under `messaging/handlers/`. This file orchestrates.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §3, §6
 */

import { markMessageSeen, markContentSeen } from '../../../utils/webhookDedupe.js';
import { withPhoneLock } from '../../../utils/phoneLock.js';
import logger from '../../../utils/logger.js';
import { telefoneHash } from '../../../utils/telefoneHash.js';

import { classify } from '../routing/messageClassifier.js';
import { decide, Route, Reason } from '../routing/messageRouter.js';
import { fetchRoutingState } from '../webhookState.js';

import { handle as handleLegacyConfirmation } from '../handlers/legacyConfirmation.js';
import { handle as handleIaLeadLifecycle } from '../handlers/iaLeadLifecycle.js';
import { handle as handleLegacyFallback } from '../handlers/legacyFallback.js';
import { handle as handleManualSilent } from '../handlers/manualSilent.js';
import { handle as handleNoPendingAppointmentReply } from '../handlers/noPendingAppointmentReply.js';
import { handle as handleClientLifecycle } from '../handlers/iaClientLifecycle.js';
import { persistManualOutbound } from '../handlers/manualOutbound.js';

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Express handler — POST /webhook/evolution.
 *
 * Returns HTTP 200 to Evolution within the 500ms PRD F01 budget.
 * All routing and side effects happen asynchronously after the ACK.
 */
export const processarConfirmacaoWhatsapp = async (req, res) => {
  const startMs = Date.now();

  try {
    // ── Validation guards (spec §6.3) ──────────────────────────────

    if (req.body.event !== 'messages.upsert') {
      return res.status(200).json({ message: 'Evento ignorado' });
    }

    const msgData = req.body.data;
    const remoteJidRaw = msgData?.key?.remoteJid || '';

    if (remoteJidRaw.endsWith('@g.us') || msgData?.messageType === 'reactionMessage') {
      return res.status(200).json({ message: 'Grupo ou reação ignorada' });
    }

    // Saída do próprio salão. Se for a profissional a responder pelo telemóvel,
    // gravamos como saída humana para a conversa ficar COMPLETA no inbox — mas
    // NUNCA encaminhamos para a IA (mantém o anti-loop com as próprias mensagens).
    if (msgData?.key?.fromMe === true) {
      const textoSaida =
        msgData?.message?.conversation || msgData?.message?.extendedTextMessage?.text || '';
      const idSaida = msgData?.key?.id;
      const tsSaidaMs = (msgData?.messageTimestamp || 0) * 1000 || Date.now();

      // Só texto, não-@lid, recente e não-duplicada (Evolution faz retry).
      if (remoteJidRaw.endsWith('@lid') || !textoSaida.trim()) {
        return res.status(200).json({ message: 'Saída sem texto/lid ignorada' });
      }
      if (Date.now() - tsSaidaMs > FIVE_MIN_MS) {
        return res.status(200).json({ message: 'Saída antiga ignorada' });
      }
      if (!(await markMessageSeen(idSaida))) {
        return res.status(200).json({ message: 'Saída duplicada ignorada' });
      }

      const telSaida = remoteJidRaw
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace(/[^\d]/g, '');
      const instanceSaida = req.body?.instance ? String(req.body.instance) : null;

      res.status(200).json({ success: true, message: 'Saída registada' });

      persistManualOutbound({
        instanceName: instanceSaida,
        telefoneNormalizado: telSaida,
        mensagem: textoSaida,
        timestamp: new Date(tsSaidaMs),
      }).catch((err) =>
        logger.error(
          { err: err.message, stack: err.stack },
          '[webhook] persistManualOutbound falhou',
        ),
      );
      return;
    }

    const timestampMensagem = (msgData?.messageTimestamp || 0) * 1000 || Date.now();
    if (Date.now() - timestampMensagem > FIVE_MIN_MS) {
      return res.status(200).json({ message: 'Mensagem antiga ignorada' });
    }

    const messageId = msgData?.key?.id;
    const isNew = await markMessageSeen(messageId);
    if (!isNew) {
      return res.status(200).json({ message: 'Mensagem duplicada ignorada' });
    }

    if (remoteJidRaw.endsWith('@lid')) {
      logger.warn({ remoteJid: remoteJidRaw }, '[webhook] @lid payload — aguardando resolução');
      return res.status(200).json({ message: 'LID ignorado, aguardando resolução' });
    }

    const telefone = remoteJidRaw.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const mensagem =
      msgData?.message?.conversation || msgData?.message?.extendedTextMessage?.text || '';

    if (!telefone || !mensagem) {
      logger.warn({ telefone, mensagemPresent: Boolean(mensagem) }, '[webhook] dados incompletos');
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const trimmed = mensagem.trim();
    if (trimmed.length <= 2 && /^[?!.,;:…]+$/.test(trimmed)) {
      return res.status(200).json({ message: 'Pontuação isolada ignorada' });
    }

    const telefoneNormalizado = telefone.replace(/[^\d]/g, '');
    const instanceName = req.body?.instance ? String(req.body.instance) : null;

    // ── Anti-duplicação semântica ──────────────────────────────────
    // O Evolution pode emitir 2 eventos da MESMA mensagem com messageId
    // diferentes (a dedup por ID não os apanha → IA responde 2x). Ignora a
    // mesma (telefone+texto) repetida numa janela curta de 15s.
    const contentNew = await markContentSeen(telefoneNormalizado, mensagem);
    if (!contentNew) {
      logger.warn(
        { telefone_hash: telefoneHash(telefoneNormalizado) },
        '[webhook] conteúdo duplicado (janela curta) — ignorado',
      );
      return res.status(200).json({ message: 'Conteúdo duplicado ignorado' });
    }

    // ── Classify (pure, cheap) ─────────────────────────────────────
    const classified = classify(mensagem);

    // ── ACK Evolution FAST — processing continues asynchronously ──
    res.status(200).json({ success: true, message: 'Mensagem aceite, processando' });

    // ── Async pipeline: fetch state → decide → dispatch → telemetry ──
    // Phone lock serializes concurrent messages from the same number so that
    // the second message sees the Lead created by the first (prevents duplicate
    // Lead creation from Evolution retry/rapid-fire).
    withPhoneLock(telefoneNormalizado, () =>
      processInbound({
        classified,
        telefoneNormalizado,
        mensagem,
        messageId,
        timestamp: new Date(timestampMensagem),
        instanceName,
        startMs,
      }),
    ).catch((err) => {
      logger.error({ err: err.message, stack: err.stack }, '[webhook] async pipeline failed');
    });
  } catch (error) {
    logger.error({ err: error.message, stack: error.stack }, '[webhook] sync handler failed');
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

/**
 * Asynchronous routing + dispatch pipeline. Runs fire-and-forget after the
 * webhook ACK is sent.
 */
async function processInbound({
  classified,
  telefoneNormalizado,
  mensagem,
  messageId,
  timestamp,
  instanceName,
  startMs,
}) {
  // 1) Fetch routing state (tenant + parallel reads)
  const { tenant, models, tenantId, persistedState } = await fetchRoutingState({
    instanceName,
    telefoneNormalizado,
  });

  // 2) Build env snapshot for the router
  const env = {
    IA_SERVICE_ENABLED: process.env.IA_SERVICE_ENABLED !== 'false',
    IA_SERVICE_URL_CONFIGURED: Boolean(process.env.IA_SERVICE_URL),
  };

  // 3) Routing decision (pure)
  const decision = decide({
    classified,
    telefoneNormalizado,
    messageId,
    timestamp,
    instanceName,
    tenant,
    persistedState,
    env,
  });

  // 4) Build the handler input — every handler accepts the same shape
  const handlerInput = {
    tenant,
    models,
    tenantId,
    telefoneNormalizado,
    mensagem,
    classified,
    messageId,
    timestamp,
    instanceName,
    persistedState,
  };

  // 5) Telemetry — emit BEFORE dispatch so the log line is recorded even if
  //    a handler throws. Level is `warn` for IGNORE, `info` otherwise (spec §4.3).
  const logPayload = {
    route: decision.route,
    reason: decision.reason,
    tenant_id: tenantId,
    telefone_hash: telefoneHash(telefoneNormalizado),
    message_id: messageId,
    message_kind: classified.kind,
    has_pending_appt: persistedState.hasPendingAppointment,
    has_existing_client: Boolean(persistedState.existingClient),
    has_existing_lead: Boolean(persistedState.existingLead),
    lead_ia_active: persistedState.existingLead?.iaAtiva ?? null,
    tenant_plan_status: tenant?.plano?.status ?? null,
    ia_service_enabled: env.IA_SERVICE_ENABLED && env.IA_SERVICE_URL_CONFIGURED,
    elapsed_ms: Date.now() - startMs,
  };

  if (decision.route === Route.IGNORE) {
    logger.warn(logPayload, 'webhook_routed');
  } else {
    logger.info(logPayload, 'webhook_routed');
  }

  // 6) Dispatch to the named handler.
  //    Each case maps explicitly to a PRD §1.1 matrix row (or v1 stub).
  try {
    switch (decision.route) {
      case Route.IGNORE:
        // Tenant unresolved or plan inactive — no handler runs, no reply sent.
        return;

      case Route.LEGACY_CONFIRMATION:
        // Matrix row 2: SIM/NÃO + pending appointment
        return await handleLegacyConfirmation(handlerInput);

      case Route.IA_LEAD:
        // Matrix row 3 (new phone capture) + lead_ia_active (continuation)
        return await handleIaLeadLifecycle(handlerInput);

      case Route.CLIENT_LIFECYCLE_PENDING:
        // Matrix rows 4-5: existing Client → IA agent for booking/reschedule.
        return await handleClientLifecycle(handlerInput);

      case Route.MANUAL_SILENT:
        // Lead.iaAtiva=false: persist inbound, no reply
        return await handleManualSilent(handlerInput);

      case Route.LEGACY_FALLBACK:
        // IA disabled, leads disabled, or data-integrity guard (client_conversion_inconsistency)
        if (decision.reason === Reason.CLIENT_CONVERSION_INCONSISTENCY) {
          logger.warn(
            { ...logPayload, lead_id: persistedState.existingLead?._id },
            '[webhook] Lead.status=convertido with Lead.cliente=null — F04 regression suspected',
          );
        }
        return await handleLegacyFallback(handlerInput);

      case Route.NO_PENDING_APPOINTMENT_REPLY:
        // SIM/NÃO without pending appointment: deterministic ack, no LLM
        return await handleNoPendingAppointmentReply(handlerInput);

      default:
        // Unreachable — router invariant guarantees exactly one of the values above.
        logger.error({ decision }, '[webhook] unknown route from router');
        return;
    }
  } catch (err) {
    logger.error(
      { err: err.message, stack: err.stack, route: decision.route, reason: decision.reason },
      '[webhook] handler dispatch failed',
    );
  }
}
