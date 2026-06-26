# F09 — Communications Consent Capture · Contract (GWT)

## C1 — Opt-in capture writes a stamped communications entry
- **GIVEN** an authenticated staff user and a client in the tenant
- **WHEN** `POST /api/v1/gdpr/consent` with `{ tipo: 'whatsapp_optin' | 'marketing', accao: 'granted', origem: 'booking' }` and no `versao`
- **THEN** exactly one `ConsentLog` entry is committed with `accao: granted`, the communications `tipo`, and `versao === POLICY_VERSION`
- **AND** the booking checkbox that triggers it is rendered **not pre-checked** (off by default).

## C2 — Record reflects current state from latest entry per type
- **GIVEN** a client with, for `marketing`, a `granted` then a later `withdrawn` entry, and no `whatsapp_optin` entry
- **WHEN** `GET /api/v1/gdpr/clientes/:id/consent-estado`
- **THEN** it returns `marketing.estado === 'withdrawn'` and `whatsapp_optin.estado === 'pendente'`, each with the corresponding `data`/`versao` (null for `pendente`).

## C3 — Opt-out toggle records a withdrawal immediately
- **GIVEN** an authenticated staff user and a client
- **WHEN** the record toggle posts `{ tipo, accao: 'withdrawn', origem: 'painel' }`
- **THEN** an entry is appended immediately and `consent-estado` reflects `estado: 'withdrawn'` (opted-out) for that type.

## C4 — Withdrawal without prior opt-in is accepted
- **GIVEN** a client with no prior consent entries
- **WHEN** `POST /api/v1/gdpr/consent` with `{ accao: 'withdrawn' }`
- **THEN** it returns 201 (additive append-only) and `consent-estado` reads `withdrawn` for that type (never an error).

## C5 — Granular, independent types
- **GIVEN** a client
- **WHEN** a `whatsapp_optin` entry is recorded
- **THEN** the `marketing` state is unchanged, and vice-versa.

## C6 — Communications types only in the derivation
- **GIVEN** a client with `dados_saude` / `politica_privacidade` entries present
- **WHEN** `GET /api/v1/gdpr/clientes/:id/consent-estado`
- **THEN** the payload contains only `whatsapp_optin` and `marketing` keys (clinical consent is never exposed here).

## C7 — Validation
- **GIVEN** an invalid `clienteId` (POST body) or invalid `:id` (param)
- **WHEN** the request is made
- **THEN** it returns 400; **AND** for a well-formed id of a client not in the tenant, 404 (never 403), creating/returning no data.

## C8 — Role gate (state read) with recording asymmetry
- **GIVEN** a `recepcionista` token
- **WHEN** `GET /api/v1/gdpr/clientes/:id/consent-estado`
- **THEN** it returns 403
- **AND GIVEN** an `admin`/`gerente` token, it returns 200 with the `{ whatsapp_optin, marketing }` state
- **AND** a `recepcionista` may still `POST /gdpr/consent` (recording is open to any authenticated staff, inherited from F01).

## C9 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** reading `consent-estado` of, or recording consent against, a Tenant A client
- **THEN** Tenant A's data is never returned and the operation returns 404.

## C10 — Active policy version stamped (cross-feature with F01)
- **GIVEN** any F09 capture that omits `versao`
- **WHEN** the entry is recorded
- **THEN** it is stamped with the active `POLICY_VERSION` provided by F01.

## C11 — Transactional messages not gated
- **GIVEN** a client with `marketing`/`whatsapp_optin` set to `withdrawn`/`pendente`
- **WHEN** the system sends a transactional/service message (appointment reminder, F04 anamnesis form link)
- **THEN** sending is unaffected by communications-consent state (F09 adds no gating to the reminders/messaging path).

## Prerequisites (the evaluator must ensure these exist)
- **F01 implemented**: `src/modules/gdpr/` with `ConsentLog`, `POST /gdpr/consent`, `GET /gdpr/consent`, `POLICY_VERSION`, dual-mount in `src/app.js`.
- `mongodb-memory-server` test environment (no replica set / transactions needed).
- A seeded `Cliente` in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`) and a second tenant for isolation.
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
- Frontend touchpoints reachable for UI verification: `CriarAgendamento.jsx` (booking checkbox) and `EditarCliente.jsx` → Dados tab (Comunicações toggles).
