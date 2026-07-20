# F09 — Communications Consent Capture · Contract (GWT)

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R7/R8 — the previous contract had a staff-clicked booking checkbox granting consent; superseded. The titular grant is the F04 form; the panel records withdrawals and evidence-backed assisted grants.

## C1 — Assisted grant requires evidence and is staff-attributed (R8)
- **GIVEN** an authenticated staff user and a client in the tenant
- **WHEN** `POST /api/v1/gdpr/consent` with `{ tipo: 'whatsapp_optin' | 'marketing', accao: 'granted', origem: 'painel', evidencia: '...' }` and no `versao`
- **THEN** exactly one `ConsentLog` entry is committed with `accao: granted`, the communications `tipo`, `actor: 'funcionario'`, the `evidencia`, and `versao === POLICY_VERSION`
- **AND GIVEN** the same body **without** `evidencia`, it returns 400 and commits nothing (F01 C10, asserted here as the F09 surface).

## C2 — Record reflects current state from latest entry per type, including actor
- **GIVEN** a client with, for `marketing`, a `granted` then a later `withdrawn` entry, and no `whatsapp_optin` entry
- **WHEN** `GET /api/v1/gdpr/clientes/:id/consent-estado`
- **THEN** it returns `marketing.estado === 'withdrawn'` and `whatsapp_optin.estado === 'pendente'`, each with the corresponding `data`/`versao`/`actor` (nulls for `pendente`)
- **AND** a `granted` recorded by staff carries `actor: 'funcionario'` (so the UI can label "declaração assistida") while an F04-form grant carries `actor: 'titular'`.

## C3 — Opt-out records a withdrawal immediately and without evidence
- **GIVEN** an authenticated staff user and a client
- **WHEN** the record toggle posts `{ tipo, accao: 'withdrawn', origem: 'painel' }` with no `evidencia`
- **THEN** an entry is appended immediately (201) and `consent-estado` reflects `estado: 'withdrawn'` for that type — opting out is frictionless (Art. 7(3)).

## C4 — Withdrawal without prior opt-in is accepted
- **GIVEN** a client with no prior consent entries
- **WHEN** `POST /api/v1/gdpr/consent` with `{ accao: 'withdrawn' }`
- **THEN** it returns 201 (additive append-only) and `consent-estado` reads `withdrawn` for that type (never an error).

## C5 — Granular, independent types
- **GIVEN** a client
- **WHEN** a `whatsapp_optin` entry is recorded
- **THEN** the `marketing` state is unchanged, and vice-versa.

## C6 — Communications types only in the derivation
- **GIVEN** a client with `dados_saude` entries present
- **WHEN** `GET /api/v1/gdpr/clientes/:id/consent-estado`
- **THEN** the payload contains only `whatsapp_optin` and `marketing` keys (clinical consent is never exposed here), derived via F01's `estadoAtual` helper (R3 — no local re-implementation).

## C7 — Validation
- **GIVEN** an invalid `clienteId` (POST body) or invalid `:id` (param)
- **WHEN** the request is made
- **THEN** it returns 400; **AND** for a well-formed id of a client not in the tenant, 404 (never 403), creating/returning no data.

## C8 — Role gate (state read) with recording asymmetry
- **GIVEN** a `recepcionista` token
- **WHEN** `GET /api/v1/gdpr/clientes/:id/consent-estado`
- **THEN** it returns 403
- **AND GIVEN** an `admin`/`gerente` token, it returns 200 with the `{ whatsapp_optin, marketing }` state
- **AND** a `recepcionista` may still `POST /gdpr/consent` (recording is open to any authenticated staff, inherited from F01 — subject to C1's evidencia rule for grants).

## C9 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** reading `consent-estado` of, or recording consent against, a Tenant A client
- **THEN** Tenant A's data is never returned and the operation returns 404.

## C10 — Active policy version stamped (cross-feature with F01)
- **GIVEN** any F09 capture
- **WHEN** the entry is recorded
- **THEN** it is stamped with the active `POLICY_VERSION` and the current notice `textoHash`, both server-derived (F01 R6/R7 — a body `versao` is never honored).

## C11 — Transactional messages not gated
- **GIVEN** a client with `marketing`/`whatsapp_optin` set to `withdrawn`/`pendente`
- **WHEN** the system sends a transactional/service message (appointment reminder, F04 anamnesis form link)
- **THEN** sending is unaffected by communications-consent state (F09 adds no gating to the reminders/messaging path).

## C12 — Panel UI: no evidence, no grant (frontend)
- **GIVEN** the "Comunicações" section on `EditarCliente.jsx`
- **WHEN** a staff user turns a toggle **on** and cancels/leaves the `evidencia` modal empty
- **THEN** no request is made and the toggle reverts; turning it **off** posts the withdrawal immediately with no modal; a `funcionario`-granted state renders the "declaração assistida" badge.

## Prerequisites (the evaluator must ensure these exist)
- **F01 implemented (v2, R7)**: `src/modules/gdpr/` with `ConsentLog` (incl. `actor`/`evidencia`/`textoHash`), the staff-grant-requires-`evidencia` rule, `POST /gdpr/consent`, `GET /gdpr/consent`, the `estadoAtual` helper, `POLICY_VERSION`, dual-mount in `src/app.js`.
- `mongodb-memory-server` test environment (no replica set needed for F09).
- A seeded `Cliente` in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`) and a second tenant for isolation. To exercise C2's `actor: 'titular'` case, seed a `ConsentLog` entry directly via `record()` (the F04 form path).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
- Frontend touchpoint reachable for UI verification: `EditarCliente.jsx` → Dados tab (Comunicações toggles + evidencia modal). The F04 form checkboxes are verified in F04, not here.
