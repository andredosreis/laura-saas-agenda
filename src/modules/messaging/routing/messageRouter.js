/**
 * messageRouter — pure routing decision for inbound WhatsApp messages.
 *
 * Part of F12 (IA↔Legacy Handoff Coordinator). Given a RoutingInput
 * (classified message + tenant context + persisted state snapshot),
 * returns a RoutingDecision = { route, reason }. The runtime
 * implementation of the PRD §1.1 Routing Matrix.
 *
 * Pure function — no I/O, no DB calls, no time, no Random. The caller
 * (webhook controller, Phase 5) is responsible for fetching the
 * persisted state and passing a frozen snapshot in. This separation
 * makes routing decisions trivially testable and free of side effects.
 *
 * INVARIANTS (enforced by the decision tree below):
 *   1. Returns exactly one Route value.
 *   2. Returns exactly one Reason value matching the Route.
 *   3. IGNORE only fires on tenant/plan failures (never silent for
 *      legitimate messages).
 *   4. MANUAL_SILENT only fires when existingLead.iaAtiva === false.
 *   5. CLIENT_CONVERSION_INCONSISTENCY fires when Lead.status='convertido'
 *      AND Lead.cliente is falsy AND existingClient is null — a data
 *      integrity guard against an F04 regression. It NEVER routes the
 *      lead silently somewhere wrong; it falls through to LEGACY_FALLBACK
 *      so the inconsistency surfaces in observability.
 *   6. A genuine SIM/NÃO reply to a pending appointment (LEGACY_CONFIRMATION)
 *      is evaluated BEFORE the IA-availability guards, so deterministic
 *      reminder confirmations work even with the IA off — master switch or
 *      IA service disabled (ADR-027). Tenant/plan guards still take
 *      precedence over it.
 *
 * @see docs/F12-ia-legacy-handoff-coordinator/spec.md §4.2, §6.1, §6.2
 * @see docs/adrs/generated/ADR-027-confirmacao-lembrete-independente-da-ia.md
 */

/**
 * Stable string enum of the seven possible routes. Frozen.
 * @readonly
 */
export const Route = Object.freeze({
  LEGACY_CONFIRMATION: 'LEGACY_CONFIRMATION',
  IA_LEAD: 'IA_LEAD',
  CLIENT_LIFECYCLE_PENDING: 'CLIENT_LIFECYCLE_PENDING',
  MANUAL_SILENT: 'MANUAL_SILENT',
  LEGACY_FALLBACK: 'LEGACY_FALLBACK',
  NO_PENDING_APPOINTMENT_REPLY: 'NO_PENDING_APPOINTMENT_REPLY',
  IGNORE: 'IGNORE',
});

/**
 * Stable string enum of the eleven possible reasons. Frozen.
 * Each Reason is associated with exactly one Route (documented inline).
 * @readonly
 */
export const Reason = Object.freeze({
  // ── Guards → IGNORE / LEGACY_FALLBACK ─────────────────────────────
  TENANT_UNRESOLVED:        'tenant_unresolved',           // → IGNORE
  PLAN_INACTIVE:            'plan_inactive',               // → IGNORE
  IA_SERVICE_DISABLED:      'ia_service_disabled',         // → LEGACY_FALLBACK
  LEADS_DISABLED_ON_TENANT: 'leads_disabled_on_tenant',    // → LEGACY_FALLBACK
  IA_GLOBAL_DISABLED:       'ia_global_disabled',          // → MANUAL_SILENT (master switch da clínica)

  // ── Confirmation routing ──────────────────────────────────────────
  CONFIRMATION_WITH_PENDING_APPOINTMENT:    'confirmation_with_pending_appointment',    // → LEGACY_CONFIRMATION
  CONFIRMATION_WITHOUT_PENDING_APPOINTMENT: 'confirmation_without_pending_appointment', // → NO_PENDING_APPOINTMENT_REPLY

  // ── Data integrity guard → LEGACY_FALLBACK with warn telemetry ───
  CLIENT_CONVERSION_INCONSISTENCY: 'client_conversion_inconsistency',

  // ── Client lifecycle stub (v1) → CLIENT_LIFECYCLE_PENDING ────────
  CLIENT_INBOUND_PENDING_LIFECYCLE: 'client_inbound_pending_lifecycle',
  CLIENT_IA_PAUSED:                 'client_ia_paused',                 // → MANUAL_SILENT

  // ── Lead lifecycle ────────────────────────────────────────────────
  LEAD_IA_PAUSED:    'lead_ia_paused',    // → MANUAL_SILENT
  LEAD_IA_ACTIVE:    'lead_ia_active',    // → IA_LEAD
  NEW_PHONE_CAPTURE: 'new_phone_capture', // → IA_LEAD
});

const PLAN_ACTIVE_STATUSES = ['ativo', 'trial'];
const CONFIRMATION_KINDS = ['confirmation_yes', 'confirmation_no'];

/**
 * @typedef {object} ClassifiedMessage
 * @property {'confirmation_yes' | 'confirmation_no' | 'free_text'} kind
 * @property {string} original
 * @property {string} normalized
 * @property {string} [matched]
 *
 * @typedef {object} PersistedState
 * @property {boolean} hasPendingAppointment
 * @property {{ _id: any, etapaConversa?: string|null } | null} existingClient
 * @property {{ _id: any, iaAtiva: boolean, status: string, cliente?: any } | null} existingLead
 *
 * @typedef {object} TenantContext
 * @property {any} _id
 * @property {{ status: string }} plano
 * @property {{ leadsAtivo?: boolean }} [limites]
 *
 * @typedef {object} EnvFlags
 * @property {boolean} IA_SERVICE_ENABLED
 * @property {boolean} IA_SERVICE_URL_CONFIGURED
 *
 * @typedef {object} RoutingInput
 * @property {ClassifiedMessage} classified
 * @property {string} telefoneNormalizado
 * @property {string} messageId
 * @property {Date} timestamp
 * @property {string|null} instanceName
 * @property {TenantContext|null} tenant
 * @property {PersistedState} persistedState
 * @property {EnvFlags} env
 *
 * @typedef {object} RoutingDecision
 * @property {string} route   one of Route.* values
 * @property {string} reason  one of Reason.* values (matches the Route)
 */

/**
 * Decide the route for an inbound message.
 *
 * Top-down evaluation, first match wins. The order matches spec §6.2.
 *
 * @param {RoutingInput} input
 * @returns {RoutingDecision}
 */
export function decide(input) {
  const { classified, tenant, persistedState, env } = input;

  // 1) Tenant resolution + plan status guards
  if (!tenant) {
    return { route: Route.IGNORE, reason: Reason.TENANT_UNRESOLVED };
  }
  if (!PLAN_ACTIVE_STATUSES.includes(tenant.plano?.status)) {
    return { route: Route.IGNORE, reason: Reason.PLAN_INACTIVE };
  }

  // 2) Confirmation routing — evaluated BEFORE the IA availability guards
  //    (step 3) on purpose (ADR-027). A SIM/NÃO reply to a pending reminder
  //    is a deterministic state machine that does NOT need the LLM, so it
  //    must still confirm/cancel the appointment (and free the slot via the
  //    Agendamento pre-save hook) even when the IA is off — whether by the
  //    clinic master switch (would otherwise be MANUAL_SILENT) or the IA
  //    service being disabled (LEGACY_FALLBACK). Reminders keep going out
  //    via BullMQ regardless of the IA switch, so silently ignoring the
  //    client's answer was incoherent.
  //
  //    The block ONLY short-circuits when this message is genuinely a reply
  //    to a pending appointment reminder. The classifier flags ANY message
  //    starting with "ok", "sim", "perfeito", "claro" (and the NÃO
  //    equivalents) as a confirmation — fine for SIM/NÃO answers to a
  //    reminder, but catastrophic mid-conversation when the lead writes
  //    "ok agradeço mas vou pensar" or "sim quero saber mais" during an
  //    active IA Lead chat. Before 2026-05-20 this branch hijacked those
  //    messages to a generic legacy reply, bypassing the agent.
  //
  //    Guards that preserve that fix: fire only when hasPendingAppointment
  //    is true, never mid-IA-conversation, and for existing Clients only on
  //    a short (≤2 words) reply. Otherwise fall through to steps 3–7.
  //
  //    See docs/testes-ia/05-sessao-2026-05-19-bugs.md §1 for the two
  //    E2E sessions (Jasmin, Joana) where this manifested.
  const { existingLead, existingClient } = persistedState;
  const isConfirmation = CONFIRMATION_KINDS.includes(classified?.kind);

  if (isConfirmation && persistedState.hasPendingAppointment) {
    const words = (classified?.normalized || '').trim().split(/\s+/);
    const isShortReply = words.length <= 2;
    // Se o cliente está a meio de uma conversa com a IA (a última mensagem
    // foi o agente a perguntar algo — ex: "confirma o cancelamento?"), o
    // "sim" é uma resposta ao agente, NÃO uma confirmação de lembrete.
    // Nesse caso não curto-circuitar para o confirmador legacy — deixar
    // seguir para CLIENT_LIFECYCLE (passo 4) e a IA continua o fluxo.
    const midIaConversation = Boolean(existingClient) && persistedState.iaConversationActive === true;
    if (!midIaConversation && (!existingClient || isShortReply)) {
      return {
        route: Route.LEGACY_CONFIRMATION,
        reason: Reason.CONFIRMATION_WITH_PENDING_APPOINTMENT,
      };
    }
  }

  // 3) IA availability guards — both env-level and tenant-level. Reached
  //    only for non-confirmation messages (or confirmations that fell
  //    through the guards above), so turning the IA off never silences a
  //    deterministic reminder confirmation.
  if (!env?.IA_SERVICE_ENABLED || !env?.IA_SERVICE_URL_CONFIGURED) {
    return { route: Route.LEGACY_FALLBACK, reason: Reason.IA_SERVICE_DISABLED };
  }
  // Master switch da clínica — desligado pela Laura no inbox. Silêncio total
  // para conversas: a IA não responde a ninguém (cliente ou lead). NÃO afecta
  // a confirmação determinística de lembretes (tratada no passo 2 acima).
  // Default é ON: só dispara quando o campo é explicitamente false.
  if (tenant.configuracoes?.iaGlobalAtiva === false) {
    return { route: Route.MANUAL_SILENT, reason: Reason.IA_GLOBAL_DISABLED };
  }
  if (tenant.limites?.leadsAtivo === false) {
    return { route: Route.LEGACY_FALLBACK, reason: Reason.LEADS_DISABLED_ON_TENANT };
  }

  // 4) Client lifecycle — existing clients go to the IA agent, A NÃO SER
  //    que o agente esteja pausado para este cliente (iaAtiva=false):
  //    handoff humano (inbox) ou auto-pausa off-topic anti-abuso →
  //    MANUAL_SILENT (persiste o inbound, não responde, não chama o LLM).
  if (existingClient) {
    if (existingClient.iaAtiva === false) {
      return { route: Route.MANUAL_SILENT, reason: Reason.CLIENT_IA_PAUSED };
    }
    return {
      route: Route.CLIENT_LIFECYCLE_PENDING,
      reason: Reason.CLIENT_INBOUND_PENDING_LIFECYCLE,
    };
  }

  // 5) Data-integrity guard: Lead.status='convertido' MUST come with a
  //    non-null Lead.cliente (F04 atomic conversion transaction guarantees
  //    this). If this branch fires, F04 regressed — fall through to
  //    LEGACY_FALLBACK with a distinguishing reason that surfaces in logs.
  if (
    existingLead?.status === 'convertido' &&
    !existingLead.cliente &&
    !existingClient
  ) {
    return {
      route: Route.LEGACY_FALLBACK,
      reason: Reason.CLIENT_CONVERSION_INCONSISTENCY,
    };
  }

  // 6) Lead lifecycle: iaActive flag governs whether the agent runs or
  //    the inbound is captured silently for manual handling in F03.
  if (existingLead) {
    if (existingLead.iaAtiva === false) {
      return { route: Route.MANUAL_SILENT, reason: Reason.LEAD_IA_PAUSED };
    }
    return { route: Route.IA_LEAD, reason: Reason.LEAD_IA_ACTIVE };
  }

  // 7) Default: no lead, no client, free-text — new phone capture
  return { route: Route.IA_LEAD, reason: Reason.NEW_PHONE_CAPTURE };
}
