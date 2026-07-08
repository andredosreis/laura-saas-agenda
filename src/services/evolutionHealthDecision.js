/**
 * evolutionHealthDecision — lógica pura da máquina de estados do alerta de
 * ligação WhatsApp. Sem I/O, sem tempo interno (recebe `now`), sem Random.
 * Espelha o padrão messageRouter.decide (decisor puro + caller impuro).
 */

/** Normaliza o resultado de getConnectionState num par healthy/reason. */
export function normalizeObserved(connResult) {
  if (connResult?.ok && connResult.state === 'open') return { healthy: true, reason: null };
  if (connResult?.ok) return { healthy: false, reason: 'session_closed' };
  return { healthy: false, reason: 'api_unreachable' };
}

/** True se o erro de envio indica desconexão do WhatsApp (não um erro de payload). */
export function isDisconnectError(error) {
  if (!error) return false;
  const text = typeof error === 'string'
    ? error
    : [error.message, JSON.stringify(error)].filter(Boolean).join(' ');
  return /connection closed|connection terminated|not connected|disconnected/i.test(text);
}

/**
 * Decide a acção de alerta a partir do estado guardado + o observado.
 * @returns {{ nextState: {state,downSince,lastAlertAt}, action, reason }}
 */
export function decideAlert(stored, observed, now, { confirmMs, dailyMs }) {
  const prev = {
    state: stored?.state || 'unknown',
    downSince: stored?.downSince ? new Date(stored.downSince) : null,
    lastAlertAt: stored?.lastAlertAt ? new Date(stored.lastAlertAt) : null,
  };
  const nowMs = now.getTime();

  if (observed.healthy) {
    const recovered = prev.state === 'down' && prev.lastAlertAt != null;
    return {
      nextState: { state: 'open', downSince: null, lastAlertAt: null },
      action: recovered ? 'notify_recovered' : 'none',
      reason: null,
    };
  }

  // unhealthy
  const downSince = prev.state === 'down' && prev.downSince ? prev.downSince : now;

  // ainda não alertou neste episódio
  if (prev.state !== 'down' || prev.lastAlertAt == null) {
    if (nowMs - downSince.getTime() >= confirmMs) {
      return {
        nextState: { state: 'down', downSince, lastAlertAt: now },
        action: 'notify_down',
        reason: observed.reason,
      };
    }
    return {
      nextState: { state: 'down', downSince, lastAlertAt: null },
      action: 'none',
      reason: observed.reason,
    };
  }

  // já alertou → lembrete diário?
  if (nowMs - prev.lastAlertAt.getTime() >= dailyMs) {
    return {
      nextState: { state: 'down', downSince, lastAlertAt: now },
      action: 'notify_daily',
      reason: observed.reason,
    };
  }
  return {
    nextState: { state: 'down', downSince, lastAlertAt: prev.lastAlertAt },
    action: 'none',
    reason: observed.reason,
  };
}
