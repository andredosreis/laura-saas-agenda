# F03 — Clinical Tab in Client Record — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F03)
**Complexity:** moderate
**Module:** `laura-saas-frontend/src/` — **frontend only** (React 19 + Vite + TypeScript). New `.tsx`/`.ts` files; one edit to the existing client-record page (`src/pages/EditarCliente.jsx`).
**Depends on:** F01 (consent records) + F02 (clinical access decision + read audit). F03 consumes their APIs; it never replaces the backend gate.

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R2+R3+R4):** the Clinical tab consumes the **single** F02 endpoint `GET /clientes/:id/clinico`, which returns the clinical fields **and** `consentimentoSaude` (health-consent state) in one call. The earlier `[Auto-Accept]` of a dedicated `/clientes/:id/clinico` shape is correct, but the **client-side consent derivation from `GET /gdpr/consent` is superseded** — take the consent status from this endpoint's payload.
> **R4 (withdrawn state, 2026-07-07):** when `consentimentoSaude` is `withdrawn`, the endpoint returns **no clinical fields** — the tab renders the "Retirado" badge, no anamnesis content, and two CTAs: **"Reenviar ficha"** (F05, re-collect consent) and **"Apagar dados"** (F07). `pendente` renders normally (legacy data) with the "Pendente" badge.

**Included:**
- A gated **"Clínico"** tab on the client-record page (`src/pages/EditarCliente.jsx`), rendered **only** when `useAuth().user.role ∈ { admin, gerente, terapeuta, superadmin }`. `recepcionista` never sees the tab button nor its content.
- A new `ClinicalTab` component that, on open:
  - shows the sensitivity badge **"🔒 Dados clínicos sensíveis"**;
  - shows the consent-status indicator for `tipo: dados_saude` — **Pendente** / **Dado a DD-MM-AAAA** / **Retirado** — derived from F01 consent records;
  - fetches and renders the anamnesis/clinical fields via the F02-gated read path, which is what records the F02 read-audit entry;
  - handles loading / empty / error states per the design system.
- New `.tsx` components, `.ts` hook(s) and `.ts` types; Vitest + React Testing Library unit tests co-located in `__tests__/`.

**Consumes (from earlier features):**
- **Consent records** — current consent status + date for `dados_saude` (from **F01** `GET /gdpr/consent?clienteId=`).
- **Clinical access decision + clinical fields** — the F02-gated client read path that returns anamnesis fields and writes one `AcessoClinicoLog` entry per open (from **F02**).

**Deferred (other features / out of scope here):**
- The backend gate, the projection that strips clinical fields for `recepcionista`, and the read-audit model live in **F02** — not built here.
- Recording/withdrawing consent (F01 `POST`, F04 form, F09 toggle) — F03 only **reads** consent state.
- Editing anamnesis fields from the tab — this tab is **read-only**; capture happens via the self-service form (F04). Editing in-panel is out of scope for F03 unless the existing record already supports it.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `laura-saas-frontend/src/types/clinical.ts` | new | TS interfaces: `AnamneseClinica`, `ConsentStatus` (`'pendente' \| 'dado' \| 'retirado'`), `ConsentStatusInfo` (`{ estado, data? }`), `ConsentLogEntry` |
| `laura-saas-frontend/src/hooks/useClinicalRecord.ts` | new | Hook keyed by `clienteId`: fetches clinical fields via F02 read path (audit-triggering) **and** the `dados_saude` consent history via F01; derives `ConsentStatusInfo`; returns `{ anamnese, consentStatus, isLoading, error, reload }` |
| `laura-saas-frontend/src/components/clientes/ClinicalTab.tsx` | new | Tab body: defensive role guard, sensitivity badge, consent-status badge, anamnesis read view, loading/empty/error states |
| `laura-saas-frontend/src/components/clientes/SensitivityBadge.tsx` | new | Presentational "🔒 Dados clínicos sensíveis" pill (design-system styling) |
| `laura-saas-frontend/src/components/clientes/ConsentStatusBadge.tsx` | new | Presentational badge mapping `ConsentStatusInfo` → Pendente / Dado a DD-MM-AAAA / Retirado, color-coded |
| `laura-saas-frontend/src/utils/clinicalAccess.ts` | new | Pure `canViewClinical(role?: string): boolean` (single source of the allowed-role set, reused by page + tab) |
| `laura-saas-frontend/src/pages/EditarCliente.jsx` | edit | Add a gated "Clínico" tab button (only when `canViewClinical`) and render `<ClinicalTab clienteId={id} />` when active |
| `laura-saas-frontend/src/components/clientes/__tests__/ClinicalTab.test.tsx` | new | Unit tests: role gate, badges, states, consent derivation, audit-trigger call |
| `laura-saas-frontend/src/hooks/__tests__/useClinicalRecord.test.ts` | new | Unit tests for consent derivation + data fetch (mocked `api`) |

Pattern references: `src/pages/EditarCliente.jsx` (existing `abaAtiva` tab pattern), `src/contexts/AuthContext.jsx` (`useAuth` → `user.role`), `src/services/api.js` (axios + interceptors), `src/hooks/useAdminTenants.ts` (hook + co-located `__tests__` idiom), `.claude/rules/react-components.md` (design system, `.tsx`, no `alert()`, toast).

---

## 3. Data Model

**N/A — frontend-only feature.** No Mongoose schema or migration. F03 consumes data already exposed by F01 and F02. The shapes it relies on:

- **Clinical fields (F02 read path):** anamnesis fields on `Cliente` (e.g. `alergias`, `historicoMedico`, `diabetes`, `hipertensao`, `medicacao`, `historicoCirurgico`, `dataNascimento` where clinical). Returned only to permitted roles; the request writes one `AcessoClinicoLog` entry.
- **Consent history (F01):** array of `{ _id, clienteId, tipo, accao: 'granted'|'withdrawn', origem, versao, createdAt }`, sorted `createdAt` desc. F03 filters `tipo === 'dados_saude'` and uses the most recent entry to derive status.

Consent-status derivation (client-side, pure):
- no `dados_saude` entry → **Pendente**
- latest `dados_saude` entry `accao === 'granted'` → **Dado a DD-MM-AAAA** (date = that entry's `createdAt`, formatted in `Europe/Lisbon`)
- latest `dados_saude` entry `accao === 'withdrawn'` → **Retirado**

---

## 4. API Contracts (consumed, not defined here)

F03 defines **no** new endpoints. It calls, via `src/services/api.js` (base URL already points at `/api/v1`):

### Clinical read (F02) — triggers the read audit
`GET /clientes/:id/clinico` *(consumed)* — returns the client's anamnesis/clinical fields for permitted roles and records exactly one `AcessoClinicoLog` entry per call. Cross-role/cross-tenant denial is enforced server-side (F02). See **Assumptions** — the exact path/shape is owned by F02; F03 calls whatever F02 exposes.

Expected `200`:
```json
{ "success": true, "data": { "alergias": "...", "historicoMedico": "...", "diabetes": false,
  "hipertensao": false, "medicacao": "...", "historicoCirurgico": "..." } }
```

### Consent history (F01) — derives consent status
`GET /gdpr/consent?clienteId=<id>&limit=100` *(consumed)* — paginated, tenant-scoped, sorted `createdAt` desc. F03 reads the array, filters `tipo === 'dados_saude'`, takes the latest.

Expected `200`:
```json
{ "success": true, "data": [ { "tipo": "dados_saude", "accao": "granted",
  "versao": "2026-06-25", "createdAt": "2026-06-25T10:00:00.000Z" } ],
  "pagination": { "total": 1, "page": 1, "pages": 1, "limit": 100 } }
```

---

## 5. Requirements / Business Rules

- **R1.** The "Clínico" tab button and content render **only** when `canViewClinical(user.role)` is true (`admin`, `gerente`, `terapeuta`, `superadmin`). `recepcionista` (and any unknown role) never sees the tab — not even disabled.
- **R2.** The frontend gate is **defensive UX only** — it mirrors the F02 backend gate, never replaces it. Even if the tab were forced open, the F02 read path returns 404/no clinical fields for non-permitted roles; the UI handles that gracefully.
- **R3.** Opening the tab issues the F02 clinical read **once per open**, which is what writes the read-audit entry. Repeated re-renders must not spam the endpoint (fetch keyed by `clienteId`, guarded against double-fire).
- **R4.** The sensitivity badge **"🔒 Dados clínicos sensíveis"** is always visible on the tab when the user is permitted.
- **R5.** The consent-status indicator is derived from F01 records and shows exactly one of Pendente / Dado a DD-MM-AAAA / Retirado, consistent with F01 (no independent source of truth).
- **R6.** Dates render as `DD-MM-AAAA` (zero-padded) in `Europe/Lisbon` via luxon.
- **R7.** Loading, empty (no anamnesis filled yet) and error states are all present; no frozen screen, no `alert()`. Errors surface inline and/or via `react-toastify`.
- **R8.** New component files are `.tsx`; pure logic/hooks are `.ts`. The existing `.jsx` page is edited minimally (one gated tab + render), not converted.
- **R9.** New components follow the design system (indigo/purple gradient, slate, glassmorphism), even though the host page (`EditarCliente.jsx`) is legacy blue/gray styled.

---

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| Clinical read returns 403/404 (role/tenant denied at backend) | Show a neutral "Sem acesso aos dados clínicos" state; never leak clinical content; do not crash the page |
| Clinical read network/500 error | Inline error block + retry affordance (`reload`); optional toast; tab stays usable |
| Consent history request fails | Degrade gracefully: render clinical fields, show consent status as "—" / unavailable rather than blocking the whole tab |
| Anamnesis empty (permitted role, no data) | Empty state: badge + "Sem dados clínicos registados" + hint that the client can fill the self-service form (F04/F05) |
| Session expired (401) | Handled by the existing `api.js` interceptor (refresh/logout) — no special handling here |
| Non-permitted role somehow reaches the tab | Render nothing / redirect to the default tab; never request clinical data |

---

## 7. Testing Strategy

Runner: **Vitest + @testing-library/react** (unit, co-located `__tests__/`), with `src/services/api` mocked. E2E coverage of the gate + audit-trigger via **Playwright** is exercised by the evaluator.

**Acceptance (from PRD §9 F03):**
- `renders the Clinical tab for admin/gerente/terapeuta only` — mock `useAuth` per role; tab button present for permitted roles, absent for `recepcionista`.
- `shows the sensitivity badge and consent status (Pendente / Dado a DD-MM-AAAA / Retirado)` — given F01 history fixtures, assert the correct badge text and a `DD-MM-AAAA` date for `granted`.
- `opening the tab records a read-audit entry (F02)` — assert the F02 clinical read endpoint is called exactly once on open (the call is what logs the read); assert it is **not** called for `recepcionista`.

**Component / hook tests:**
- `consent derivation`: no entry → Pendente; latest granted → Dado a <date>; latest withdrawn → Retirado; ignores non-`dados_saude` types.
- `states`: loading spinner while pending; empty state when anamnesis blank; error state + retry on failed clinical read; consent failure degrades without hiding clinical fields.
- `no double-fetch`: re-render does not re-issue the clinical read for the same `clienteId`.
- `date formatting`: uses luxon `Europe/Lisbon`, zero-padded `dd-MM-yyyy`.

**Cross-feature note (verified by evaluator, end-to-end):** the consent status shown equals what F01 produced; the gate matches F02; opening the tab produces the F02 read audit. Not unit-tested in F03 (backend mocked).

---

## 8. Assumptions / Decisions

- **[Auto-Accept] Tab, not accordion.** The client record (`EditarCliente.jsx`) already uses a horizontal tab pattern (`abaAtiva`: Dados / Histórico). F03 adds a third **tab** ("Clínico") for consistency, rather than an accordion.
- **[Auto-Accept] Host page = `src/pages/EditarCliente.jsx`.** There is no separate "client detail" page; `EditarCliente.jsx` is the de-facto client record (tabs + packages + history). The Clinical tab is added there.
- **[Auto-Accept] Clinical read endpoint = `GET /clientes/:id/clinico` (dedicated).** A dedicated endpoint makes "opening the tab triggers the read-audit" precise (audit fires on tab open, not on every base-record fetch). The exact path/response shape is **owned by F02**; F03 calls whatever F02 exposes and should be re-pointed if F02 instead returns clinical fields inline on `GET /clientes/:id`.
- **[Auto-Accept] Consent status derived client-side from F01 `GET /gdpr/consent`.** F01's list endpoint does not filter by `tipo`; F03 fetches the history (`limit=100`, already sorted desc) and selects the latest `dados_saude` entry. If F01 later adds a `?tipo=` filter or a "latest-by-type" helper, switch to it.
- **[Auto-Accept] Date format `dd-MM-yyyy` in `Europe/Lisbon` via luxon** (already a frontend dependency), matching the PRD's "DD-MM-AAAA" and the project timezone rule.
- **[Auto-Accept] Allowed roles = `admin`, `gerente`, `terapeuta`, `superadmin`.** PRD lists admin/gerente/terapeuta; `superadmin` is included to match the project-wide convention that superadmin always has access (see `.claude/rules/express-middlewares.md`).
- **[Auto-Accept] Read-only tab.** F03 displays anamnesis; capture/editing is F04's self-service form. No edit UI is added in F03.
- **[Auto-Accept] New components on the design system.** `ClinicalTab`/badges use indigo/purple + slate + glassmorphism per `.claude/rules/react-components.md`, even though the surrounding legacy page uses blue/gray; the existing page styling is left untouched.
- **[Auto-Accept] Tests with Vitest + RTL, co-located in `__tests__/`**, mocking `api` and `useAuth`, matching the existing frontend test idiom (`src/hooks/__tests__`, `src/components/__tests__`).
