# F03 — Clinical Tab in Client Record — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F03)
**Complexity:** moderate
**Module:** `laura-saas-frontend/src/` — **frontend only** (React 19 + Vite + TypeScript). New `.tsx`/`.ts` files; one edit to the existing client-record page (`src/pages/EditarCliente.jsx`).
**Depends on:** F02 (`GET /clientes/:id/clinico` — clinical fields + `consentimentoSaude` + read audit; F02 itself uses the F01 helper). F03 makes **no direct F01 call** (R2/R3, consolidated 2026-07-19); it never replaces the backend gate.

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R2+R3+R4):** the Clinical tab consumes the **single** F02 endpoint `GET /clientes/:id/clinico`, which returns the clinical fields **and** `consentimentoSaude` (health-consent state) in one call. The earlier `[Auto-Accept]` of a dedicated `/clientes/:id/clinico` shape is correct, but the **client-side consent derivation from `GET /gdpr/consent` is superseded** — take the consent status from this endpoint's payload.
> **R4 (withdrawn state, 2026-07-07):** when `consentimentoSaude` is `withdrawn`, the endpoint returns **no clinical fields** — the tab renders the "Retirado" badge, no anamnesis content, and two CTAs: **"Reenviar ficha"** (F05, re-collect consent) and **"Apagar dados"** (F07). `pendente` renders normally (legacy data) with the "Pendente" badge.

**Included:**
- A gated **"Clínico"** tab on the client-record page (`src/pages/EditarCliente.jsx`), rendered **only** when `useAuth().user.role ∈ { admin, gerente, terapeuta, superadmin }`. `recepcionista` never sees the tab button nor its content.
- A new `ClinicalTab` component that, on open:
  - shows the sensitivity badge **"🔒 Dados clínicos sensíveis"**;
  - shows the consent-status indicator for `tipo: dados_saude` — **Pendente** / **Dado a DD-MM-AAAA** / **Retirado** — taken from the `consentimentoSaude` field of the F02 `/clinico` payload (R2/R3 — no client-side derivation);
  - fetches and renders the anamnesis/clinical fields **and** the consent state in **one call** to `GET /clientes/:id/clinico` (F02), which is what records the F02 read-audit entry;
  - renders the **withdrawn** state per R4: badge "Consentimento retirado", no clinical content, CTAs "Reenviar ficha" (F05) and "Apagar dados" (F07) — each rendered/enabled only where its feature exists (F05 is wave 3);
  - handles loading / empty / error states per the design system.
- New `.tsx` components, `.ts` hook(s) and `.ts` types; Vitest + React Testing Library unit tests co-located in `__tests__/`.

**Consumes (from earlier features):**
- **`GET /clientes/:id/clinico` (F02)** — the single call: anamnesis fields + `consentimentoSaude` (state + date, derived server-side via the F01 helper) + one `AcessoClinicoLog` entry per open. F03 consumes **nothing directly from F01** (that dependency is transitive through F02).

**Deferred (other features / out of scope here):**
- The backend gate, the projection that strips clinical fields for `recepcionista`, and the read-audit model live in **F02** — not built here.
- Recording/withdrawing consent (F01 `POST`, F04 form, F09 toggle) — F03 only **reads** consent state.
- Editing anamnesis fields from the tab — this tab is **read-only**; capture happens via the self-service form (F04). Editing in-panel is out of scope for F03 unless the existing record already supports it.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `laura-saas-frontend/src/types/clinical.ts` | new | TS interfaces: `AnamneseClinica`, `ConsentStatus` (`'pendente' \| 'dado' \| 'retirado'`), `ConsentStatusInfo` (`{ estado, data? }`), `ClinicoResponse` (payload of `GET /clientes/:id/clinico`) |
| `laura-saas-frontend/src/hooks/useClinicalRecord.ts` | new | Hook keyed by `clienteId`: **one call** to `GET /clientes/:id/clinico` (audit-triggering); maps the payload's `consentimentoSaude` → `ConsentStatusInfo` (pure mapping, no history reduction); returns `{ anamnese, consentStatus, isLoading, error, reload }` |
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

- **`GET /clientes/:id/clinico` payload (F02):** the anamnese block of `Cliente` with its **real field names** — `alergias`, `qualAlergia`, `historicoMedico`, `qualHistorico`, `medicamentosEmUso`, `qualMedicamento`, `antecedentesCirurgicos`, `qualCirurgia`, `temHipertensao`, `temDiabetes`, `temEpilepsia`, `temMarcapasso`, `temMetais`, `observacoesAdicionaisAnamnese`, … (full list = F02's `CLINICAL_FIELDS`) — **plus** `consentimentoSaude: { estado, data }`. Returned only to permitted roles; the request writes one `AcessoClinicoLog` entry. When `estado === 'withdrawn'` the payload carries **only** `consentimentoSaude` (R4).

Consent-status display mapping (pure, from the payload — no history reduction in the browser):
- `consentimentoSaude.estado === 'pendente'` → **Pendente**
- `estado === 'granted'` → **Dado a DD-MM-AAAA** (`data`, formatted in `Europe/Lisbon`)
- `estado === 'withdrawn'` → **Retirado** + R4 UI (no clinical content, CTAs)

---

## 4. API Contracts (consumed, not defined here)

F03 defines **no** new endpoints. It calls, via `src/services/api.js` (base URL already points at `/api/v1`):

### Clinical read + consent state (F02) — the single call, triggers the read audit
`GET /clientes/:id/clinico` *(consumed)* — returns, in one payload, the client's anamnesis fields **and** `consentimentoSaude`, and records exactly one `AcessoClinicoLog` entry per call. Cross-role/cross-tenant denial is enforced server-side (F02).

Expected `200` (granted or pendente):
```json
{ "success": true, "data": { "consentimentoSaude": { "estado": "granted", "data": "2026-06-25T10:00:00.000Z" },
  "alergias": "...", "historicoMedico": "...", "temDiabetes": false, "temHipertensao": false } }
```

Expected `200` (withdrawn — R4, zero clinical keys):
```json
{ "success": true, "data": { "consentimentoSaude": { "estado": "withdrawn", "data": "2026-07-05T09:00:00.000Z" } } }
```

~~Consent history (F01) `GET /gdpr/consent?clienteId=`~~ — **superseded by R2/R3 (consolidated 2026-07-19)**: F03 makes no direct F01 call. That endpoint is `admin`/`gerente`-gated and would 403 a `terapeuta` opening the tab — precisely why the consent state moved into the `/clinico` payload.

---

## 5. Requirements / Business Rules

- **R1.** The "Clínico" tab button and content render **only** when `canViewClinical(user.role)` is true (`admin`, `gerente`, `terapeuta`, `superadmin`). `recepcionista` (and any unknown role) never sees the tab — not even disabled.
- **R2.** The frontend gate is **defensive UX only** — it mirrors the F02 backend gate, never replaces it. Even if the tab were forced open, the F02 read path returns 404/no clinical fields for non-permitted roles; the UI handles that gracefully.
- **R3.** Opening the tab issues the F02 clinical read **once per open**, which is what writes the read-audit entry. Repeated re-renders must not spam the endpoint (fetch keyed by `clienteId`, guarded against double-fire).
- **R4.** The sensitivity badge **"🔒 Dados clínicos sensíveis"** is always visible on the tab when the user is permitted.
- **R5.** The consent-status indicator comes from the `consentimentoSaude` field of the `/clinico` payload (server-derived via the F01 helper — single source of truth, R3) and shows exactly one of Pendente / Dado a DD-MM-AAAA / Retirado. No client-side history reduction, no separate consent fetch.
- **R6.** Dates render as `DD-MM-AAAA` (zero-padded) in `Europe/Lisbon` via luxon.
- **R7.** Loading, empty (no anamnesis filled yet) and error states are all present; no frozen screen, no `alert()`. Errors surface inline and/or via `react-toastify`.
- **R8.** New component files are `.tsx`; pure logic/hooks are `.ts`. The existing `.jsx` page is edited minimally (one gated tab + render), not converted.
- **R9.** New components follow the design system (indigo/purple gradient, slate, glassmorphism), even though the host page (`EditarCliente.jsx`) is legacy blue/gray styled.
- **R10.** *(R4)* When `consentimentoSaude.estado === 'withdrawn'` the tab renders the "Consentimento retirado" badge, **no** anamnesis content, and the CTAs "Reenviar ficha" (F05) / "Apagar dados" (F07) — each CTA renders/enables only when its feature exists (F05 is wave 3). `pendente` renders normally with the "Pendente" badge (legacy data stays visible).

---

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| Clinical read returns 403/404 (role/tenant denied at backend) | Show a neutral "Sem acesso aos dados clínicos" state; never leak clinical content; do not crash the page |
| Clinical read network/500 error | Inline error block + retry affordance (`reload`); optional toast; tab stays usable |
| Payload lacks `consentimentoSaude` (unexpected) | Degrade gracefully: render clinical fields, show consent status as "—" rather than blocking the tab |
| `consentimentoSaude.estado === 'withdrawn'` (R4) | Not an error: render the "Consentimento retirado" badge + CTAs, zero anamnesis content (the payload carries none) |
| Anamnesis empty (permitted role, no data) | Empty state: badge + "Sem dados clínicos registados" + hint that the client can fill the self-service form (F04/F05) |
| Session expired (401) | Handled by the existing `api.js` interceptor (refresh/logout) — no special handling here |
| Non-permitted role somehow reaches the tab | Render nothing / redirect to the default tab; never request clinical data |

---

## 7. Testing Strategy

Runner: **Vitest + @testing-library/react** (unit, co-located `__tests__/`), with `src/services/api` mocked. E2E coverage of the gate + audit-trigger via **Playwright** is exercised by the evaluator.

**Acceptance (from PRD §9 F03):**
- `renders the Clinical tab for admin/gerente/terapeuta only` — mock `useAuth` per role; tab button present for permitted roles, absent for `recepcionista`.
- `shows the sensitivity badge and consent status (Pendente / Dado a DD-MM-AAAA / Retirado)` — given `/clinico` payload fixtures (`consentimentoSaude` pendente/granted/withdrawn), assert the correct badge text and a `DD-MM-AAAA` date for `granted`.
- `opening the tab records a read-audit entry (F02)` — assert the F02 clinical read endpoint is called exactly once on open (the call is what logs the read); assert it is **not** called for `recepcionista`.

**Component / hook tests:**
- `consent mapping`: payload `pendente` → Pendente; `granted` → Dado a <date>; `withdrawn` → Retirado + no anamnesis rendered + CTAs (R4/R10).
- `states`: loading spinner while pending; empty state when anamnesis blank; error state + retry on failed `/clinico` read; missing `consentimentoSaude` degrades to "—" without hiding clinical fields.
- `no double-fetch`: re-render does not re-issue the clinical read for the same `clienteId`.
- `date formatting`: uses luxon `Europe/Lisbon`, zero-padded `dd-MM-yyyy`.

**Cross-feature note (verified by evaluator, end-to-end):** the consent status shown equals what F01 produced; the gate matches F02; opening the tab produces the F02 read audit. Not unit-tested in F03 (backend mocked).

---

## 8. Assumptions / Decisions

- **[Auto-Accept] Tab, not accordion.** The client record (`EditarCliente.jsx`) already uses a horizontal tab pattern (`abaAtiva`: Dados / Histórico). F03 adds a third **tab** ("Clínico") for consistency, rather than an accordion.
- **[Auto-Accept] Host page = `src/pages/EditarCliente.jsx`.** There is no separate "client detail" page; `EditarCliente.jsx` is the de-facto client record (tabs + packages + history). The Clinical tab is added there.
- **[Auto-Accept] Clinical read endpoint = `GET /clientes/:id/clinico` (dedicated).** A dedicated endpoint makes "opening the tab triggers the read-audit" precise (audit fires on tab open, not on every base-record fetch). The path/response shape is **owned by F02** and, per R2, includes `consentimentoSaude`.
- ~~**[Auto-Accept] Consent status derived client-side from F01 `GET /gdpr/consent`.**~~ — **superseded by R2/R3 (consolidated 2026-07-19)**: the consent state arrives server-derived in the `/clinico` payload; F03 performs no history reduction and calls no F01 endpoint (which is `admin`/`gerente`-gated and would 403 a `terapeuta`).
- **[Auto-Accept] Date format `dd-MM-yyyy` in `Europe/Lisbon` via luxon** (already a frontend dependency), matching the PRD's "DD-MM-AAAA" and the project timezone rule.
- **[Auto-Accept] Allowed roles = `admin`, `gerente`, `terapeuta`, `superadmin`.** PRD lists admin/gerente/terapeuta; `superadmin` is included to match the project-wide convention that superadmin always has access (see `.claude/rules/express-middlewares.md`).
- **[Auto-Accept] Read-only tab.** F03 displays anamnesis; capture/editing is F04's self-service form. No edit UI is added in F03.
- **[Auto-Accept] New components on the design system.** `ClinicalTab`/badges use indigo/purple + slate + glassmorphism per `.claude/rules/react-components.md`, even though the surrounding legacy page uses blue/gray; the existing page styling is left untouched.
- **[Auto-Accept] Tests with Vitest + RTL, co-located in `__tests__/`**, mocking `api` and `useAuth`, matching the existing frontend test idiom (`src/hooks/__tests__`, `src/components/__tests__`).
