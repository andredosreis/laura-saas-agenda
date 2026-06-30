# F10 — Privacy Status & Note on Appointment — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F10)
**Complexity:** moderate
**Module:** frontend-first — `laura-saas-frontend/src/` (agenda, appointment detail, client record, lead-closing) + one lightweight read-only addition to `src/modules/gdpr/` (no new model, no schema change)
**Depends on:** F01 (Consent Logging Foundation — `ConsentLog`, latest `dados_saude` entry), F04 (Self-Service Form — `FichaToken` status = filled/pending), F05 (WhatsApp Form Link — `POST /gdpr/clientes/:id/enviar-ficha`)

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R3):** the `GET /gdpr/clientes/:id/estado-privacidade` (+ batch) endpoint must derive consent state via F01's canonical `estadoAtual` helper (single source of truth) — do **not** re-implement the latest-per-type reduction. Combine it with F04's `FichaToken` status for the form (filled/pending) signal.

**Consumes:**
- **Health-consent status (F01):** the latest `ConsentLog` entry of `tipo: 'dados_saude'` for a client → `granted | withdrawn | pendente`.
- **Anamnesis-form status (F04):** whether the client's form was **submitted** (`FichaToken.status === 'usado'`) or is **awaiting fill** (an `ativo` `FichaToken` exists) — the *filled vs pending* signal.
- **Form link send action (F05):** `POST /gdpr/clientes/:id/enviar-ficha` (re-invoked from the client record / lead-closing).
- **Existing data:** `GET /agendamentos` (already populates `cliente` incl. `nome`, `observacoes`); `PUT /clientes/:id` (persists `observacoes` — the existing field, **reused**).

**Included (this spec):**
- A **non-clinical** privacy status badge on the agenda (each appointment card / list row) and in the appointment detail modal: anamnesis form **✓ preenchida** / **⏳ pendente** (+ an alert *"ficha por preencher"* when missing) and the health-consent status. Safe for **all** staff roles, including `recepcionista`.
- The client's short **note** (`Cliente.observacoes`) shown alongside the badge on the appointment.
- At the **lead-closing / treatment-scheduling** moment and on the **client record**: a free-text **observation** that reuses `Cliente.observacoes` (persisted via the existing cliente update path) and a **"Enviar ficha de consentimento"** action that invokes F05.
- One **lightweight read-only endpoint** (single + batch) that returns the per-client privacy *status* (booleans + enum + date) — **never** clinical content — so the agenda can render badges efficiently without N+1. See §4 and the `[Auto-Accept]` rationale in §7.

**Provides (to later features):** nothing downstream consumes F10; it is a terminal, read/display feature (Wave 4).

**Deferred / explicitly NOT in F10:**
- **No clinical content anywhere on the appointment/agenda surface.** Anamnese fields (allergies, medical history, etc.) stay only in the gated Clinical tab (F03 / F02 need-to-know). F10 shows a yes/no/pending indicator only.
- No new consent capture (F09 owns communications consent; F04 owns clinical consent). F10 only **reflects** existing state.
- Lead appointments (`tipo: 'Avaliacao'`, no `cliente`) have no client record yet → no badge (the form targets `Cliente` only, PRD §7). The badge appears once the lead is converted to a client.
- No durable per-appointment privacy snapshot; the status is always derived live from F01/F04.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `laura-saas-frontend/src/components/PrivacyStatusBadge.tsx` | new | **Pure presentational** badge (no fetching). Props: `{ fichaPreenchida, fichaEnviada, consentimentoSaude, size? }`. Renders **✓ preenchida** / **⏳ pendente** pill, the "ficha por preencher" alert when pending, and a consent indicator (Dado / Pendente / Retirado). Design system (indigo/purple/slate/glass); **renders no clinical data** |
| `laura-saas-frontend/src/hooks/usePrivacyStatus.ts` | new | Hook to fetch privacy status: `usePrivacyStatus(clienteIds[])` → batch map for the agenda; `usePrivacyStatusOne(clienteId)` → single for detail/record. Uses `api.js`; handles loading/empty; dedupes ids |
| `laura-saas-frontend/src/pages/Agendamentos.jsx` | edit | After loading appointments, collect unique `cliente._id`s, fetch the **batch** status once, render `<PrivacyStatusBadge>` + the client note (`ag.cliente.observacoes`) on each card. Only for appointments that have a `cliente` |
| `laura-saas-frontend/src/components/AppointmentDetailModal.jsx` | edit | Show `<PrivacyStatusBadge>` + the note in the detail overlay (client appointments only); add a quick "Enviar ficha de consentimento" affordance that calls F05 |
| `laura-saas-frontend/src/pages/EditarCliente.jsx` | edit | In the "Dados do Cliente" tab: show `<PrivacyStatusBadge>` near the existing `observacoes` textarea; keep the existing F05 **"Enviar ficha…"** button (reused, not duplicated). The `observacoes` save path already exists (`api.put('/clientes/:id')`) |
| `laura-saas-frontend/src/components/FunilAvaliacaoModal.jsx` | edit | At lead-closing (status `Compareceu` + lead → `POST /agendamentos/:id/fechar-pacote`): add a free-text observation that persists to the **converted client's** `Cliente.observacoes`, and a **"Enviar ficha de consentimento"** button (F05) enabled once the converted client id exists |
| `src/modules/gdpr/gdprController.js` | edit | add `estadoPrivacidade` (single) + `estadoPrivacidadeBatch` (map) — derive `fichaPreenchida`/`fichaEnviada` from `FichaToken` and `consentimentoSaude` from the latest `dados_saude` `ConsentLog`. **Returns no clinical fields** |
| `src/modules/gdpr/gdprRoutes.js` | edit | add `GET /clientes/:id/estado-privacidade` and `GET /estado-privacidade?clienteIds=` — `authorize('admin','gerente','recepcionista','terapeuta')` (all staff) + validation |
| `src/modules/gdpr/gdprSchemas.js` | edit | add `estadoPrivacidadeParamsSchema` (`:id` ObjectId) + `estadoPrivacidadeQuerySchema` (`clienteIds` CSV, ≤100, each ObjectId) |
| `tests/gdpr-estado-privacidade.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server) for the read endpoints |

Pattern references: F01 (`src/modules/gdpr/*`, `ConsentLog`, latest-by-type index `{ tenantId:1, tipo:1, createdAt:-1 }`), F04 (`src/models/FichaToken.js` status lifecycle), F05 (`POST /gdpr/clientes/:id/enviar-ficha`, the EditarCliente button), F09 (`GET /gdpr/clientes/:id/consent-estado` — the derivation idiom this mirrors), `laura-saas-frontend/src/pages/Agendamentos.jsx` (card + inline status-pill idiom), `src/components/AppointmentDetailModal.jsx`, `EditarCliente.jsx` (tabs + `observacoes`), `services/api.js`, `contexts/AuthContext` (`useAuth().user.role`), `.claude/rules/react-components.md` (design system, `.tsx` for new, luxon, no `alert()`).

---

## 3. Data Model

**N/A — no new model, no schema change.** F10 reuses, read-only:
- `ConsentLog` (F01, tenant DB) — latest `tipo: 'dados_saude'` entry per client → health-consent state.
- `FichaToken` (F04, tenant DB) — `status` (`ativo`/`usado`/`revogado`) per client → form filled (`usado`) vs awaiting fill (`ativo`).
- `Cliente.observacoes` (existing field, max 500 chars) — the short note. **No new field is added** (per the explicit decision: reuse the existing `observacoes`; the clinical free-text lives in the separate `observacoesAdicionaisAnamnese`, which F10 never touches).

**Derivation (read-only, no persistence):**
- `consentimentoSaude.estado` = latest `dados_saude` `ConsentLog` (by `createdAt` desc): `granted` / `withdrawn`; no entry → `pendente`.
- `fichaPreenchida` = a `FichaToken` with `status === 'usado'` exists for the client (the F04 submission signal). (Equivalent fallback: any `dados_saude` `granted` entry exists — see §7.)
- `fichaEnviada` = no `usado` token, but an `ativo` `FichaToken` exists (a link was sent and is awaiting fill).

The batch endpoint computes these with **two** tenant-scoped queries (one `ConsentLog` aggregation grouped per client, one `FichaToken` find), then reduces in memory — no `await` in a loop.

---

## 4. API Contracts

Mounted under `/api/gdpr` and `/api/v1/gdpr` (F01 dual-mount); all require `authenticate`, tenant-scoped. Both reads are gated `authorize('admin','gerente','recepcionista','terapeuta')` — **open to every staff role** (the payload is non-clinical status only), `superadmin` bypasses.

### GET /gdpr/clientes/:id/estado-privacidade — single client status (all staff) — **new**
- `:id` validated ObjectId; client must exist in `req.tenantId` (else 404, never 403).

Response `200`:
```json
{ "success": true, "data": {
  "clienteId": "665...",
  "fichaPreenchida": true,
  "fichaEnviada": false,
  "consentimentoSaude": { "estado": "granted", "data": "2026-06-20T10:00:00.000Z" },
  "observacoes": "Cliente prefere manhãs; fechou pacote 10 sessões."
} }
```
- `estado ∈ { "granted" | "withdrawn" | "pendente" }`; `data` is `null` when `pendente`.
- **Never** returns anamnese/clinical fields. `observacoes` is the non-clinical note (included here for the detail modal / record convenience).

### GET /gdpr/estado-privacidade?clienteIds=665a,665b — batch status map (all staff) — **new**
- `clienteIds` = comma-separated ObjectIds, **max 100**; any malformed id → 400.
- Returns a map keyed by `clienteId`. Ids that do **not** belong to the tenant are **silently omitted** (no enumeration, no 404 for the batch — unknown ids are simply absent from the map).

Response `200`:
```json
{ "success": true, "data": {
  "665a": { "fichaPreenchida": true,  "fichaEnviada": false, "consentimentoSaude": { "estado": "granted",  "data": "2026-06-20T..." } },
  "665b": { "fichaPreenchida": false, "fichaEnviada": true,  "consentimentoSaude": { "estado": "pendente", "data": null } }
} }
```
- The batch omits `observacoes` — the agenda already has `ag.cliente.observacoes` from the populated `GET /agendamentos` response (no duplication).

### Reused (no new endpoint)
- `PUT /clientes/:id` (existing) — persists the `observacoes` note (record + lead-closing).
- `POST /gdpr/clientes/:id/enviar-ficha` (F05) — sends the form link from the record / lead-closing.

---

## 5. Requirements / Business Rules

- **R1.** The appointment/agenda surface shows a **non-clinical** status only: form `✓ preenchida` / `⏳ pendente` (+ alert when pending) and the health-consent state (`Dado` / `Pendente` / `Retirado`) plus the short note. **No anamnese/clinical content is ever rendered or fetched here** (honors F02 need-to-know).
- **R2.** The badge is **safe for every staff role**, including `recepcionista`; the read endpoints return booleans/enums/date/note only and are role-gated to all staff.
- **R3.** `fichaPreenchida` is derived from F04's submission state (`FichaToken.status === 'usado'`); `fichaEnviada` (awaiting fill) from an `ativo` `FichaToken`; `consentimentoSaude` from the latest `dados_saude` `ConsentLog` (F01). A filled form whose consent was later withdrawn reads `fichaPreenchida: true` with `consentimentoSaude.estado: 'withdrawn'` (the two are independent).
- **R4.** The note **reuses the existing `Cliente.observacoes`** field — no new backend field. It is persisted through the existing `PUT /clientes/:id` path (record edit and lead-closing conversion).
- **R5.** At lead-closing, the observation is written to the **converted** client's `Cliente.observacoes`, and "Enviar ficha de consentimento" targets that converted client id (the action is enabled only once a client record exists).
- **R6.** "Enviar ficha de consentimento" invokes F05's `POST /gdpr/clientes/:id/enviar-ficha` — F10 adds no new send logic and writes no `ConsentLog` (the form link is transactional, not consent — F05 R1).
- **R7.** Lead-only appointments (no `cliente`) show no privacy badge; the badge applies to client appointments only.
- **R8.** All reads/writes are tenant-scoped; cross-tenant client → 404 (single) / silently omitted (batch). `tenantId` is server-derived; no mass assignment.
- **R9.** The agenda fetches the privacy status in **one batch call** per page load (no per-card N+1); the detail modal / record use the single read.

**UX flow:** Staff open the agenda → each client appointment shows the form/consent badge + note; a pending form shows the "ficha por preencher" alert. Opening an appointment shows the same badge in the detail modal. When closing a lead, staff fill the observation and click "Enviar ficha de consentimento". A `recepcionista` sees the badge and note but never any clinical detail.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Single: invalid `:id` ObjectId | 400 | `{ success:false, error:'ID inválido' }` |
| Single: client not in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| Batch: malformed/over-limit `clienteIds` (>100 or non-ObjectId) | 400 | `{ success:false, error:'<campo>: <msg>' }` |
| Batch: unknown / cross-tenant id | 200 | omitted from the map (no enumeration, no 404) |
| Forbidden (non-staff token) | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| No token / invalid token | 401 | handled by `authenticate` |
| Note save / send failure (frontend) | — | `react-toastify` toast; never `alert()`; form not lost |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

The reads degrade gracefully on the frontend: if the status fetch fails, the agenda still renders appointments (the badge shows a neutral "—"/loading state) — privacy status is supplementary, never blocking the agenda.

---

## 7. Assumptions / Decisions

- `[Auto-Accept]` **A new lightweight read endpoint is justified (not reusing F01/F09).** F01's `GET /gdpr/consent` is `admin/gerente`-gated, paginated *history* over *all* types — unusable for an all-role yes/no badge. F09's `GET /gdpr/clientes/:id/consent-estado` is `admin/gerente`-gated and returns **communications** types only. Neither exposes the clinical-form *filled/pending* signal to `recepcionista`. F10 adds `GET /gdpr/clientes/:id/estado-privacidade` (single) **and** `GET /gdpr/estado-privacidade?clienteIds=` (batch) — non-clinical status, all-staff gated.
- `[Auto-Accept]` **Batch endpoint for the agenda** to avoid N+1 across up to 100 cards: the agenda makes one call with the unique `clienteId`s; the detail modal and record use the single read. Max 100 ids per call (mirrors the project's pagination cap).
- `[Auto-Accept]` **`fichaPreenchida` source = `FichaToken.status === 'usado'`** (the truest "form submitted" signal, independent of later consent withdrawal). Equivalent fallback signal: existence of any `dados_saude` `granted` `ConsentLog`. `fichaEnviada` = an `ativo` token exists with no `usado` token.
- `[Auto-Accept]` **`consentimentoSaude` = latest `dados_saude` `ConsentLog`** (`granted`/`withdrawn`/`pendente`), mirroring F09's latest-by-type derivation but for the clinical type — displayed as a state only, never the clinical content.
- `[Auto-Accept]` **Badge placement** = on the agenda card and the list row in `Agendamentos.jsx`, in `AppointmentDetailModal.jsx`, and on `EditarCliente.jsx` (Dados tab). A reusable `PrivacyStatusBadge.tsx` keeps them consistent; the existing inline status-pill styling is the visual reference.
- `[Auto-Accept]` **The note reuses `Cliente.observacoes`** (no new field). The clinical free-text `observacoesAdicionaisAnamnese` is never surfaced here.
- `[Auto-Accept]` **Lead-closing host = `FunilAvaliacaoModal.jsx`** (the existing lead-conversion surface tied to `POST /agendamentos/:id/fechar-pacote`). The observation persists to the converted client's `observacoes` via `PUT /clientes/:id`; the send button targets the converted client id. If the conversion flow lives in a different component at build time, the same two affordances attach there instead.
- `[Auto-Accept]` **"Enviar ficha de consentimento" reuses F05's existing button/endpoint** — F10 does not re-implement sending; on the client record the F05 button is reused (possibly relabelled to the PRD wording).
- `[Auto-Accept]` **New files are `.tsx`/`.ts`** (`PrivacyStatusBadge.tsx`, `usePrivacyStatus.ts`); edited pages stay `.jsx` (convivência rule — existing files not converted).
- `[Auto-Accept]` **Batch omits `observacoes`** (already present in the populated agenda response); the single read includes it for the modal/record.
- `[Auto-Accept]` **Graceful degradation:** a failed status fetch never blocks the agenda; the badge shows a neutral/loading state.
- `[Auto-Accept]` **Dates via luxon, `Europe/Lisbon`** for any rendered consent date; no `new Date()` in display logic.

---

## 8. Testing Strategy

`tests/gdpr-estado-privacidade.test.js` (Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`). Frontend rendering/role behaviour is verified at the evaluator stage with Playwright per the harness method.

**Acceptance (from PRD §9 F10):**
- `appointment status shows form (✓ preenchida / ⏳ pendente) + health-consent + note` — seed a client with a `usado` `FichaToken` and a `dados_saude` `granted` `ConsentLog` → single read returns `fichaPreenchida:true`, `consentimentoSaude.estado:'granted'`, `observacoes` present; seed a client with only an `ativo` token → `fichaPreenchida:false`, `fichaEnviada:true`, `consentimentoSaude.estado:'pendente'`.
- `no clinical content is exposed to any role` — assert the response contains **no** anamnese keys (`alergias`, `historicoMedico`, `medicamentosEmUso`, `observacoesAdicionaisAnamnese`, …) for any role; a `recepcionista` token gets `200` with the status payload (badge is role-safe).
- `note persists to Cliente.observacoes` — `PUT /clientes/:id` with `observacoes` → single read reflects the saved note (covered via the existing clientes path; asserted as the F10 consumer).

**Derivation / negative:**
- `withdrawn consent after a filled form` — seed `usado` token + `dados_saude` `granted` then `withdrawn` → `fichaPreenchida:true`, `consentimentoSaude.estado:'withdrawn'` (independence).
- `batch returns a map and omits unknown/cross-tenant ids` — request a mix of valid + unknown ids → only valid tenant ids appear.
- `malformed/over-limit clienteIds → 400`; `invalid :id → 400`; `unknown client (single) → 404`.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot read Tenant A's client status` (single) → 404; (batch) → A's id omitted from B's map.
- `recepcionista is allowed` (200, status only) — the all-staff gate is verified; a non-staff/forbidden token → 403.

**Cross-feature note (PRD §9):** F10 reflects the health-consent status from F01 and the anamnesis-form status from F04, and triggers F05's send action — without exposing any clinical content. The F01/F04/F05 mechanics themselves are tested in those features.
