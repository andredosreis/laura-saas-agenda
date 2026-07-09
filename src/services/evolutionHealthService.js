/**
 * evolutionHealthService — orquestra a verificação de saúde da ligação WhatsApp
 * e a entrega de alertas. Caller impuro do decisor puro evolutionHealthDecision.
 */
import { DateTime } from 'luxon';
import * as Sentry from '@sentry/node';
import Tenant from '../models/Tenant.js';
import logger from '../utils/logger.js';
import { sendEmail } from './emailService.js';
import { getConnectionState } from '../utils/evolutionClient.js';
import { decideAlert, normalizeObserved, isDisconnectError } from './evolutionHealthDecision.js';

const ZONA = 'Europe/Lisbon';
const CONFIRM_MS = parseInt(process.env.EVOLUTION_HEALTH_CONFIRM_MS, 10) || 180000;
const DAILY_MS = parseInt(process.env.EVOLUTION_HEALTH_DAILY_MS, 10) || 86400000;
const RECHECK_DEBOUNCE_MS = parseInt(process.env.EVOLUTION_HEALTH_RECHECK_DEBOUNCE_MS, 10) || 60000;
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const MANAGER_URL = process.env.EVOLUTION_MANAGER_URL || '';

const inFlight = new Set();
const lastReactiveCheck = new Map();

function fmt(date) {
  return date ? DateTime.fromJSDate(new Date(date)).setZone(ZONA).toFormat('dd/MM/yyyy HH:mm') : '—';
}

export function buildAlertEmail({ action, reason, tenantNome, instanceName, downSince }) {
  if (action === 'notify_recovered') {
    const subject = `✅ Marcai: WhatsApp reconectado (instância ${instanceName})`;
    const text = `A ligação WhatsApp da instância "${instanceName}" (${tenantNome}) voltou a estar ONLINE.`;
    return { subject, text, html: `<p>${text}</p>` };
  }
  const motivo = reason === 'api_unreachable'
    ? 'A API Evolution está inacessível (serviço em baixo).'
    : 'A sessão de WhatsApp está desligada (telemóvel offline / sessão terminada).';
  const prefix = action === 'notify_daily' ? '[Lembrete] ' : '';
  const subject = `⚠️ ${prefix}Marcai: WhatsApp desligado (instância ${instanceName})`;
  const linkManager = MANAGER_URL
    ? `<li>Abrir o Manager: <a href="${MANAGER_URL}">${MANAGER_URL}</a> (login = API key)</li>`
    : `<li>Abrir o Manager da Evolution (login = API key)</li>`;
  const text = [
    'A ligação WhatsApp está EM BAIXO.',
    `Instância: ${instanceName}`,
    `Clínica: ${tenantNome}`,
    `Desde: ${fmt(downSince)} (Europe/Lisbon)`,
    `Motivo: ${motivo}`,
    'Nenhum envio (manual, IA ou lembretes) sai enquanto isto durar.',
    `Como resolver: no Manager${MANAGER_URL ? ` (${MANAGER_URL})` : ''}, instância "${instanceName}", a Laura scaneia o QR no telemóvel (WhatsApp → Dispositivos ligados → Ligar um dispositivo).`,
  ].join('\n');
  const html = `
    <h2>⚠️ WhatsApp desligado — ${instanceName}</h2>
    <p><b>Clínica:</b> ${tenantNome}<br/>
    <b>Desde:</b> ${fmt(downSince)} (Europe/Lisbon)<br/>
    <b>Motivo:</b> ${motivo}</p>
    <p>Nenhum envio (manual, IA ou lembretes) sai enquanto isto durar.</p>
    <p><b>Como resolver:</b></p>
    <ol>${linkManager}<li>Instância <code>${instanceName}</code> → a Laura scaneia o QR (WhatsApp → Dispositivos ligados → Ligar um dispositivo).</li></ol>`;
  return { subject, text, html };
}

/** Entrega o alerta. Sentry sempre; email se ALERT_EMAIL definido.
 *  @returns {Promise<boolean>} true se considerado entregue (p/ avançar dedup) */
async function deliverAlert(ctx) {
  const level = ctx.action === 'notify_recovered' ? 'info' : 'warning';
  try { Sentry.captureMessage(`[Evolution] ${ctx.action} — instância ${ctx.instanceName}`, level); }
  catch { /* best-effort */ }

  if (!ALERT_EMAIL) {
    logger.warn({ instance: ctx.instanceName, action: ctx.action }, '[EvolutionHealth] ALERT_EMAIL não definido — só Sentry');
    return true; // Sentry é o canal configurado
  }
  try {
    const { subject, html, text } = buildAlertEmail(ctx);
    await sendEmail({ to: ALERT_EMAIL, subject, html, text });
    logger.info({ instance: ctx.instanceName, action: ctx.action, to: ALERT_EMAIL }, '[EvolutionHealth] Email de alerta enviado');
    return true;
  } catch (err) {
    logger.error({ instance: ctx.instanceName, err: err.message }, '[EvolutionHealth] Falha a enviar email — vai re-tentar');
    return false;
  }
}

export async function checkInstanceHealth(tenant) {
  const instanceName = tenant?.whatsapp?.instanceName;
  if (!instanceName) return;
  if (inFlight.has(instanceName)) return;
  inFlight.add(instanceName);
  try {
    const conn = await getConnectionState(instanceName);
    const observed = normalizeObserved(conn);
    const stored = tenant.whatsapp?.health || {};
    const now = DateTime.now().setZone(ZONA).toJSDate();
    const decision = decideAlert(stored, observed, now, { confirmMs: CONFIRM_MS, dailyMs: DAILY_MS });

    let persist = decision.nextState;
    if (decision.action !== 'none') {
      const delivered = await deliverAlert({
        action: decision.action,
        reason: decision.reason,
        tenantNome: tenant.nome,
        instanceName,
        downSince: decision.nextState.downSince || stored.downSince || now,
      });
      if (!delivered) {
        // não avança lastAlertAt nem transiciona para open → re-tenta no próximo ciclo
        persist = decision.action === 'notify_recovered'
          ? { state: 'down', downSince: stored.downSince || null, lastAlertAt: stored.lastAlertAt || null }
          : { state: 'down', downSince: decision.nextState.downSince, lastAlertAt: stored.lastAlertAt || null };
      }
    }

    await Tenant.updateOne(
      { _id: tenant._id },
      { $set: {
        'whatsapp.health.state': persist.state,
        'whatsapp.health.downSince': persist.downSince,
        'whatsapp.health.lastAlertAt': persist.lastAlertAt,
      } },
    );
  } catch (err) {
    logger.error({ instance: instanceName, err: err.message }, '[EvolutionHealth] checkInstanceHealth falhou');
  } finally {
    inFlight.delete(instanceName);
  }
}

async function triggerCheck(instanceName) {
  try {
    const tenant = await Tenant.findOne({ 'whatsapp.instanceName': instanceName })
      .select('_id nome whatsapp.instanceName whatsapp.health')
      .lean();
    if (tenant) await checkInstanceHealth(tenant);
  } catch (err) {
    logger.error({ instance: instanceName, err: err.message }, '[EvolutionHealth] triggerCheck falhou');
  }
}

/** Entrada reactiva: falha de envio de desconexão → check imediato (debounced)
 *  + 1 recheck de confirmação a CONFIRM_MS. Fire-and-forget, nunca lança. */
export function noteSendFailure(instanceName, errorPayload) {
  try {
    if (!instanceName || !isDisconnectError(errorPayload)) return;
    const now = Date.now();
    if (now - (lastReactiveCheck.get(instanceName) || 0) < RECHECK_DEBOUNCE_MS) return;
    lastReactiveCheck.set(instanceName, now);
    triggerCheck(instanceName);
    const t = setTimeout(() => triggerCheck(instanceName), CONFIRM_MS);
    if (typeof t.unref === 'function') t.unref();
  } catch (err) {
    logger.error({ instance: instanceName, err: err.message }, '[EvolutionHealth] noteSendFailure falhou');
  }
}
