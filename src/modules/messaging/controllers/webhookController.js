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
// Namespace imports: estes módulos são substituídos por mocks parciais em vários
// testes de webhook. Com import nomeado, o link ESM falharia nesses testes por
// "export não fornecido"; com namespace, um nome em falta é só undefined (e só
// seria acedido no caminho de áudio, que esses testes não exercem).
import * as evolutionClient from '../../../utils/evolutionClient.js';
import * as iaServiceClient from '../../../utils/iaServiceClient.js';

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
import LidCapture from '../../../models/LidCapture.js';

const FIVE_MIN_MS = 5 * 60 * 1000;

/**
 * Descrição curta de uma mensagem não-texto (media), para aparecer na thread do
 * inbox como placeholder em vez de a conversa "saltar" o momento. Devolve null se
 * não for media reconhecida.
 */
export function descreverMidia(msgData) {
  const m = msgData?.message || {};
  const t = msgData?.messageType || '';
  if (m.audioMessage || m.pttMessage || t === 'audioMessage') return '🎤 [áudio]';
  if (m.imageMessage || t === 'imageMessage') return '🖼️ [imagem]';
  if (m.videoMessage || t === 'videoMessage') return '🎥 [vídeo]';
  if (m.documentMessage || m.documentWithCaptionMessage || t === 'documentMessage') return '📎 [documento]';
  if (m.stickerMessage || t === 'stickerMessage') return '🩷 [sticker]';
  if (m.locationMessage || t === 'locationMessage') return '📍 [localização]';
  if (m.contactMessage || m.contactsArrayMessage || t === 'contactMessage') return '👤 [contacto]';
  return null;
}

// ⚠️ DIAGNÓSTICO TEMPORÁRIO — Fase 3 do plano de inbox (docs/plano-inbox-completo.md).
// Captura o payload COMPLETO de uma mensagem @lid para descobrir onde o Evolution v2
// põe o número real (a doc não o documenta). Remover assim que a resolução de @lid
// estiver implementada. Frequência: grep '"motivo":"lid"'. Payload: grep 'lidPayload'.
function logLidParaFase3(direcao, msgData, instance) {
  logger.info(
    { direcao, motivo: 'lid', lidPayload: msgData },
    '[webhook] @lid capturado para Fase 3',
  );
  // Persistência DURÁVEL (sobrevive a restarts/deploys, ao contrário dos docker
  // logs). Best-effort — uma falha aqui nunca quebra o webhook.
  LidCapture.create({
    direcao,
    remoteJid: msgData?.key?.remoteJid,
    instance,
    payload: msgData,
  }).catch((err) => logger.warn({ err: err.message }, '[webhook] @lid capture persist falhou'));
}

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
    // instância Evolution — constante para todo o request; usada em vários ramos.
    const instance = req.body?.instance ? String(req.body.instance) : null;

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
      const telSaida = remoteJidRaw
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace(/[^\d]/g, '');
      const logBase = { direcao: 'saida', telefone_hash: telefoneHash(telSaida), instance };

      // @lid: ainda não resolvemos o número real (Fase 3 do plano de inbox).
      if (remoteJidRaw.endsWith('@lid')) {
        logLidParaFase3('saida', msgData, instance);
        return res.status(200).json({ message: 'Saída @lid ignorada' });
      }

      // Texto OU descrição da media (áudio/imagem/...) — para a thread não saltar
      // momentos quando a Laura responde com uma nota de voz/foto pelo telemóvel.
      const conteudoSaida = textoSaida.trim() || descreverMidia(msgData);
      if (!conteudoSaida) {
        logger.info({ ...logBase, motivo: 'sem-conteudo' }, '[webhook] saída descartada');
        return res.status(200).json({ message: 'Saída sem conteúdo ignorada' });
      }
      if (Date.now() - tsSaidaMs > FIVE_MIN_MS) {
        logger.info({ ...logBase, motivo: 'antiga' }, '[webhook] saída descartada');
        return res.status(200).json({ message: 'Saída antiga ignorada' });
      }
      if (!(await markMessageSeen(idSaida))) {
        logger.info({ ...logBase, motivo: 'duplicada' }, '[webhook] saída descartada');
        return res.status(200).json({ message: 'Saída duplicada ignorada' });
      }

      res.status(200).json({ success: true, message: 'Saída registada' });

      persistManualOutbound({
        instanceName: instance,
        telefoneNormalizado: telSaida,
        mensagem: conteudoSaida,
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
      logger.info({ direcao: 'entrada', motivo: 'antiga' }, '[webhook] entrada descartada');
      return res.status(200).json({ message: 'Mensagem antiga ignorada' });
    }

    const messageId = msgData?.key?.id;
    const isNew = await markMessageSeen(messageId);
    if (!isNew) {
      return res.status(200).json({ message: 'Mensagem duplicada ignorada' });
    }

    if (remoteJidRaw.endsWith('@lid')) {
      logLidParaFase3('entrada', msgData, instance);
      return res.status(200).json({ message: 'LID ignorado, aguardando resolução' });
    }

    // ── Áudio (nota de voz) ────────────────────────────────────────
    // O WhatsApp não traz texto numa nota de voz. Descarrega o áudio do
    // Evolution, transcreve via Gemini (ia-service) e injecta a transcrição no
    // pipeline normal de texto — assim a IA "ouve" o áudio e responde.
    const textoDirecto =
      msgData?.message?.conversation || msgData?.message?.extendedTextMessage?.text || '';
    const isAudio =
      Boolean(msgData?.message?.audioMessage) || msgData?.messageType === 'audioMessage';
    if (isAudio && !textoDirecto) {
      const telefoneAudio = remoteJidRaw
        .replace('@s.whatsapp.net', '')
        .replace('@c.us', '')
        .replace(/[^\d]/g, '');
      if (!telefoneAudio) {
        return res.status(200).json({ message: 'Áudio sem telefone ignorado' });
      }
      res.status(200).json({ success: true, message: 'Áudio recebido, a transcrever' });

      withPhoneLock(telefoneAudio, () =>
        processAudioInbound({
          messageKey: msgData.key,
          mimetype: msgData?.message?.audioMessage?.mimetype || 'audio/ogg',
          telefoneNormalizado: telefoneAudio,
          messageId,
          timestamp: new Date(timestampMensagem),
          instanceName: instance,
          startMs,
        }),
      ).catch((err) =>
        logger.error({ err: err.message, stack: err.stack }, '[webhook] audio pipeline failed'),
      );
      return;
    }

    const telefone = remoteJidRaw.replace('@s.whatsapp.net', '').replace('@c.us', '');
    const mensagem =
      msgData?.message?.conversation || msgData?.message?.extendedTextMessage?.text || '';

    if (!telefone || !mensagem) {
      // Entrada não-texto (imagem/documento/sticker do cliente). Por agora é
      // descartada — logamos a media para medir frequência (placeholder de
      // entrada fica para a Fase 2b do plano de inbox).
      logger.info(
        { direcao: 'entrada', motivo: 'sem-texto', midia: descreverMidia(msgData) || 'desconhecida' },
        '[webhook] entrada descartada (não-texto)',
      );
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const trimmed = mensagem.trim();
    if (trimmed.length <= 2 && /^[?!.,;:…]+$/.test(trimmed)) {
      return res.status(200).json({ message: 'Pontuação isolada ignorada' });
    }

    const telefoneNormalizado = telefone.replace(/[^\d]/g, '');

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
        instanceName: instance,
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
 * Pipeline de áudio: descarrega o áudio do Evolution → transcreve via
 * ia-service (Gemini) → injecta a transcrição no pipeline de texto normal.
 * Fire-and-forget após o ACK. Degrada em silêncio (apenas log) se o download
 * ou a transcrição falharem — não rebenta o webhook.
 */
async function processAudioInbound({
  messageKey,
  mimetype,
  telefoneNormalizado,
  messageId,
  timestamp,
  instanceName,
  startMs,
}) {
  const media = await evolutionClient.getMediaBase64(messageKey, instanceName);
  if (!media.success || !media.base64) {
    logger.warn(
      { telefone_hash: telefoneHash(telefoneNormalizado) },
      '[webhook] áudio: download falhou',
    );
    return;
  }

  let texto = '';
  try {
    const r = await iaServiceClient.transcribeAudio({
      audioBase64: media.base64,
      mimeType: media.mimetype || mimetype,
    });
    texto = String(r?.text || '').trim();
  } catch (err) {
    logger.warn(
      { telefone_hash: telefoneHash(telefoneNormalizado), err: err.message },
      '[webhook] áudio: transcrição falhou',
    );
    return;
  }

  if (!texto) {
    logger.info(
      { telefone_hash: telefoneHash(telefoneNormalizado) },
      '[webhook] áudio sem fala — ignorado',
    );
    return;
  }

  logger.info(
    { telefone_hash: telefoneHash(telefoneNormalizado), chars: texto.length },
    '[webhook] áudio transcrito',
  );

  // Injecta a transcrição no pipeline normal (mesma rota que uma msg de texto).
  await processInbound({
    classified: classify(texto),
    telefoneNormalizado,
    mensagem: texto,
    messageId,
    timestamp,
    instanceName,
    startMs,
  });
}

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
