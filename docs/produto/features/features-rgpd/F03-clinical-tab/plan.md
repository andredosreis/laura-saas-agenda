# F03 — Clinical Tab in Client Record — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 4 · **Layer:** frontend only

> Consolidated 2026-07-19 with [../RECONCILIATION.md](../RECONCILIATION.md) R2/R3/R4 — the previous plan still fetched the F01 consent history separately and derived the state in the browser; that is superseded (single `/clinico` call).

## Prerequisites
- Frontend running locally (`cd laura-saas-frontend && npm run dev`, port 5173 per `CLAUDE.md`).
- **F02** available: `GET /clientes/:id/clinico` returns, in one payload, the anamnesis fields **and** `consentimentoSaude: { estado, data }` (server-derived via the F01 helper), writes one `AcessoClinicoLog` per call, 403 for `recepcionista`, 404 cross-tenant, and the R4 withdrawn shape (consent state only, zero clinical keys). F03 calls **no** F01 endpoint.
- Patterns confirmed: `src/pages/EditarCliente.jsx` (tab pattern), `src/contexts/AuthContext.jsx` (`useAuth().user.role`), `src/services/api.js`, `src/hooks/useAdminTenants.ts` (hook + `__tests__` idiom), `.claude/rules/react-components.md`.
- luxon already a frontend dependency (`luxon@^3.7.2`).

## Phase 1 — Types & access helper
1. **Types** — Create `src/types/clinical.ts`: `AnamneseClinica`, `ConsentStatus` (`'pendente'|'dado'|'retirado'`), `ConsentStatusInfo` (`{ estado, data? }`), `ClinicoResponse` (the `/clinico` payload: `consentimentoSaude` + optional anamnese block — absent when withdrawn).
2. **Access helper** — Create `src/utils/clinicalAccess.ts` exporting pure `canViewClinical(role?: string): boolean` over `{ admin, gerente, terapeuta, superadmin }`. Single source for the gate, reused by page and tab.

## Phase 2 — Data hook
3. **`useClinicalRecord(clienteId)`** — Create `src/hooks/useClinicalRecord.ts`. On mount (keyed by `clienteId`, guarded against double-fire): **one** `api` call to `GET /clientes/:id/clinico` (audit-triggering); map the payload's `consentimentoSaude` → `ConsentStatusInfo` (pure mapping — no history reduction) with luxon `Europe/Lisbon` `dd-MM-yyyy` formatting; degrade to "—" if `consentimentoSaude` is unexpectedly absent. Return `{ anamnese, consentStatus, isLoading, error, reload }` per spec §5–§6 (`anamnese` is `null`/empty when the state is `withdrawn` — R4).

## Phase 3 — Presentational components & page wiring
4. **Badges** — Create `src/components/clientes/SensitivityBadge.tsx` ("🔒 Dados clínicos sensíveis") and `src/components/clientes/ConsentStatusBadge.tsx` (maps `ConsentStatusInfo` → Pendente / Dado a DD-MM-AAAA / Retirado, color-coded), design-system styled.
5. **`ClinicalTab.tsx`** — Create `src/components/clientes/ClinicalTab.tsx`: defensive `canViewClinical` guard; uses `useClinicalRecord`; renders sensitivity badge + consent badge + read-only anamnesis; **withdrawn state (R4/R10)**: "Consentimento retirado" badge, no anamnesis content, CTAs "Reenviar ficha" (F05) / "Apagar dados" (F07) rendered/enabled only where those features exist (F05 is wave 3); loading / empty / error states; no `alert()`, toast/inline for errors.
6. **Wire into the page** — Edit `src/pages/EditarCliente.jsx`: add a "Clínico" tab button **only** when `canViewClinical(user.role)` (from `useAuth`), and render `<ClinicalTab clienteId={id} />` when `abaAtiva === 'clinico'`. Minimal edit; do not convert the `.jsx` page.

## Phase 4 — Tests & gates
7. **Hook tests** — `src/hooks/__tests__/useClinicalRecord.test.ts`: payload mapping cases (pendente/granted/withdrawn), single call (no consent fetch), missing-`consentimentoSaude` degradation, no double-fetch (mock `api`).
8. **Component tests** — `src/components/clientes/__tests__/ClinicalTab.test.tsx`: role gate (tab hidden for `recepcionista`), badges, loading/empty/error states, withdrawn state (badge + CTAs + zero anamnesis), and that the `/clinico` read is called exactly once on open and not at all for `recepcionista` (mock `api` + `useAuth`).
9. **Gates** — Run `npm run lint`, `npm run build` (tsc + Vite) and `npm run test:run` until green; then ready for `/implement-evaluate`.
