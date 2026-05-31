/**
 * Integration tests for messageRouter — F12 §7.2.
 *
 * Pure-function tests: each test builds a RoutingInput literal and asserts
 * the returned RoutingDecision. No DB, no harness, no async — the router
 * is a pure function and the test is the cheapest possible reproduction
 * of the decision tree.
 *
 * Tests are organised by the decision-tree branch they exercise (§6.2).
 */

import {
  decide,
  Route,
  Reason,
} from '../src/modules/messaging/routing/messageRouter.js';

// ── Helpers ──────────────────────────────────────────────────────────

const SIM = {
  kind: 'confirmation_yes',
  original: 'sim',
  normalized: 'sim',
  matched: 'sim',
};
const NAO = {
  kind: 'confirmation_no',
  original: 'nao',
  normalized: 'nao',
  matched: 'nao',
};
const FREE_TEXT = {
  kind: 'free_text',
  original: 'olá',
  normalized: 'ola',
};

const ACTIVE_TENANT = {
  _id: 'tenant_active',
  plano: { status: 'ativo' },
  limites: { leadsAtivo: true },
};

const ENV_FULL = {
  IA_SERVICE_ENABLED: true,
  IA_SERVICE_URL_CONFIGURED: true,
};

function buildInput(overrides = {}) {
  return {
    classified: overrides.classified ?? FREE_TEXT,
    telefoneNormalizado: overrides.telefoneNormalizado ?? '351912462033',
    messageId: 'EVT-test',
    timestamp: new Date('2026-05-15T10:00:00Z'),
    instanceName: overrides.instanceName ?? 'marcai',
    tenant: 'tenant' in overrides ? overrides.tenant : ACTIVE_TENANT,
    persistedState: overrides.persistedState ?? {
      hasPendingAppointment: false,
      existingClient: null,
      existingLead: null,
    },
    env: overrides.env ?? ENV_FULL,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('messageRouter (F12 §6.2 decision tree)', () => {
  // ── Branch 1: tenant + plan guards ─────────────────────────────────

  test('tenant null → IGNORE / tenant_unresolved', () => {
    const d = decide(buildInput({ tenant: null }));
    expect(d.route).toBe(Route.IGNORE);
    expect(d.reason).toBe(Reason.TENANT_UNRESOLVED);
  });

  test('tenant plan cancelled → IGNORE / plan_inactive', () => {
    const d = decide(buildInput({
      tenant: { _id: 't1', plano: { status: 'cancelado' }, limites: { leadsAtivo: true } },
    }));
    expect(d.route).toBe(Route.IGNORE);
    expect(d.reason).toBe(Reason.PLAN_INACTIVE);
  });

  // ── Branch 2: IA availability guards ───────────────────────────────

  test('IA disabled via env → LEGACY_FALLBACK / ia_service_disabled', () => {
    const d = decide(buildInput({
      env: { IA_SERVICE_ENABLED: false, IA_SERVICE_URL_CONFIGURED: true },
    }));
    expect(d.route).toBe(Route.LEGACY_FALLBACK);
    expect(d.reason).toBe(Reason.IA_SERVICE_DISABLED);
  });

  test('IA_SERVICE_URL not configured → LEGACY_FALLBACK / ia_service_disabled', () => {
    const d = decide(buildInput({
      env: { IA_SERVICE_ENABLED: true, IA_SERVICE_URL_CONFIGURED: false },
    }));
    expect(d.route).toBe(Route.LEGACY_FALLBACK);
    expect(d.reason).toBe(Reason.IA_SERVICE_DISABLED);
  });

  test('leads disabled on tenant → LEGACY_FALLBACK / leads_disabled_on_tenant', () => {
    const d = decide(buildInput({
      tenant: { ...ACTIVE_TENANT, limites: { leadsAtivo: false } },
    }));
    expect(d.route).toBe(Route.LEGACY_FALLBACK);
    expect(d.reason).toBe(Reason.LEADS_DISABLED_ON_TENANT);
  });

  // ── Branch 3: confirmation routing ─────────────────────────────────

  test('SIM + pending appointment → LEGACY_CONFIRMATION / confirmation_with_pending_appointment', () => {
    const d = decide(buildInput({
      classified: SIM,
      persistedState: { hasPendingAppointment: true, existingClient: null, existingLead: null },
    }));
    expect(d.route).toBe(Route.LEGACY_CONFIRMATION);
    expect(d.reason).toBe(Reason.CONFIRMATION_WITH_PENDING_APPOINTMENT);
  });

  test('NÃO + pending appointment → LEGACY_CONFIRMATION / confirmation_with_pending_appointment', () => {
    const d = decide(buildInput({
      classified: NAO,
      persistedState: { hasPendingAppointment: true, existingClient: null, existingLead: null },
    }));
    expect(d.route).toBe(Route.LEGACY_CONFIRMATION);
    expect(d.reason).toBe(Reason.CONFIRMATION_WITH_PENDING_APPOINTMENT);
  });

  test('SIM + pending + existing Client + IA conversation active → CLIENT_LIFECYCLE (não hijack legacy)', () => {
    const d = decide(buildInput({
      classified: SIM,
      persistedState: {
        hasPendingAppointment: true,
        existingClient: { _id: 'c1' },
        existingLead: null,
        iaConversationActive: true,
      },
    }));
    expect(d.route).toBe(Route.CLIENT_LIFECYCLE_PENDING);
    expect(d.reason).toBe(Reason.CLIENT_INBOUND_PENDING_LIFECYCLE);
  });

  test('SIM + pending + existing Client + SEM conversa IA activa → LEGACY_CONFIRMATION (resposta a lembrete preservada)', () => {
    const d = decide(buildInput({
      classified: SIM,
      persistedState: {
        hasPendingAppointment: true,
        existingClient: { _id: 'c1' },
        existingLead: null,
        iaConversationActive: false,
      },
    }));
    expect(d.route).toBe(Route.LEGACY_CONFIRMATION);
    expect(d.reason).toBe(Reason.CONFIRMATION_WITH_PENDING_APPOINTMENT);
  });

  // Regression — 2026-05-20: a confirmation-shaped message ("ok", "sim",
  // "perfeito", "nao", "cancelar"…) without a pending appointment must NOT
  // short-circuit to NO_PENDING_APPOINTMENT_REPLY anymore. The classifier
  // is too eager (matches "ok agradeço mas vou pensar" mid-conversation),
  // so the router now only treats confirmation-kind as a reminder reply
  // when there is actually an appointment to confirm. New phone → IA_LEAD.
  test('SIM without pending appointment, no Lead/Client → IA_LEAD (new phone capture)', () => {
    const d = decide(buildInput({
      classified: SIM,
      persistedState: { hasPendingAppointment: false, existingClient: null, existingLead: null },
    }));
    expect(d.route).toBe(Route.IA_LEAD);
    expect(d.reason).toBe(Reason.NEW_PHONE_CAPTURE);
  });

  test('NÃO without pending appointment, no Lead/Client → IA_LEAD (new phone capture)', () => {
    const d = decide(buildInput({
      classified: NAO,
      persistedState: { hasPendingAppointment: false, existingClient: null, existingLead: null },
    }));
    expect(d.route).toBe(Route.IA_LEAD);
    expect(d.reason).toBe(Reason.NEW_PHONE_CAPTURE);
  });

  test('SIM without pending appointment + active IA Lead → IA_LEAD (agent owns the turn)', () => {
    const d = decide(buildInput({
      classified: SIM,
      persistedState: {
        hasPendingAppointment: false,
        existingClient: null,
        existingLead: { _id: 'l1', iaAtiva: true, status: 'em_conversa' },
      },
    }));
    expect(d.route).toBe(Route.IA_LEAD);
    expect(d.reason).toBe(Reason.LEAD_IA_ACTIVE);
  });

  // ── Branch 4: data-integrity guard ─────────────────────────────────

  test('Lead convertido but cliente null + no existingClient → LEGACY_FALLBACK / client_conversion_inconsistency', () => {
    const d = decide(buildInput({
      persistedState: {
        hasPendingAppointment: false,
        existingClient: null,
        existingLead: { _id: 'l1', iaAtiva: true, status: 'convertido', cliente: null },
      },
    }));
    expect(d.route).toBe(Route.LEGACY_FALLBACK);
    expect(d.reason).toBe(Reason.CLIENT_CONVERSION_INCONSISTENCY);
  });

  // ── Branch 5: Client lifecycle stub ────────────────────────────────

  test('Free-text + existing Client → CLIENT_LIFECYCLE_PENDING', () => {
    const d = decide(buildInput({
      persistedState: {
        hasPendingAppointment: false,
        existingClient: { _id: 'c1' },
        existingLead: null,
      },
    }));
    expect(d.route).toBe(Route.CLIENT_LIFECYCLE_PENDING);
    expect(d.reason).toBe(Reason.CLIENT_INBOUND_PENDING_LIFECYCLE);
  });

  test('Free-text + existing Client + iaAtiva=false → MANUAL_SILENT / client_ia_paused', () => {
    const d = decide(buildInput({
      persistedState: {
        hasPendingAppointment: false,
        existingClient: { _id: 'c1', iaAtiva: false },
        existingLead: null,
      },
    }));
    expect(d.route).toBe(Route.MANUAL_SILENT);
    expect(d.reason).toBe(Reason.CLIENT_IA_PAUSED);
  });

  test('Cliente present OVERRIDES Lead present → CLIENT_LIFECYCLE_PENDING (Client wins)', () => {
    const d = decide(buildInput({
      persistedState: {
        hasPendingAppointment: false,
        existingClient: { _id: 'c1' },
        existingLead: { _id: 'l1', iaAtiva: true, status: 'convertido', cliente: 'c1' },
      },
    }));
    expect(d.route).toBe(Route.CLIENT_LIFECYCLE_PENDING);
    expect(d.reason).toBe(Reason.CLIENT_INBOUND_PENDING_LIFECYCLE);
  });

  // ── Branch 6: Lead lifecycle iaActive flag ─────────────────────────

  test('Free-text + Lead with iaActive=false → MANUAL_SILENT / lead_ia_paused', () => {
    const d = decide(buildInput({
      persistedState: {
        hasPendingAppointment: false,
        existingClient: null,
        existingLead: { _id: 'l1', iaAtiva: false, status: 'em_conversa' },
      },
    }));
    expect(d.route).toBe(Route.MANUAL_SILENT);
    expect(d.reason).toBe(Reason.LEAD_IA_PAUSED);
  });

  test('Free-text + Lead with iaActive=true → IA_LEAD / lead_ia_active', () => {
    const d = decide(buildInput({
      persistedState: {
        hasPendingAppointment: false,
        existingClient: null,
        existingLead: { _id: 'l1', iaAtiva: true, status: 'em_conversa' },
      },
    }));
    expect(d.route).toBe(Route.IA_LEAD);
    expect(d.reason).toBe(Reason.LEAD_IA_ACTIVE);
  });

  // ── Branch 7: default new phone capture ────────────────────────────

  test('Free-text + no Lead, no Client → IA_LEAD / new_phone_capture', () => {
    const d = decide(buildInput());
    expect(d.route).toBe(Route.IA_LEAD);
    expect(d.reason).toBe(Reason.NEW_PHONE_CAPTURE);
  });

  // ── Invariants: Route/Reason are frozen enums ──────────────────────

  test('Route and Reason are frozen string-literal enums', () => {
    expect(Object.isFrozen(Route)).toBe(true);
    expect(Object.isFrozen(Reason)).toBe(true);
    expect(() => { Route.HACK = 'hack'; }).toThrow();
    expect(() => { Reason.HACK = 'hack'; }).toThrow();
  });
});
