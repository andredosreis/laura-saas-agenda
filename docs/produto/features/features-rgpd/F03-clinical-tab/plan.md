# F03 — Clinical Tab in Client Record — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 4 · **Layer:** frontend only

## Prerequisites
- Frontend running locally (`cd laura-saas-frontend && npm run dev`, port 5173 per `CLAUDE.md`).
- **F01** available: `GET /gdpr/consent?clienteId=` returns tenant-scoped, `createdAt`-desc consent history including `dados_saude` entries.
- **F02** available: a role-gated clinical read path that returns anamnesis fields and writes one `AcessoClinicoLog` per call (assumed `GET /clientes/:id/clinico` — confirm against F02 and re-point if it differs).
- Patterns confirmed: `src/pages/EditarCliente.jsx` (tab pattern), `src/contexts/AuthContext.jsx` (`useAuth().user.role`), `src/services/api.js`, `src/hooks/useAdminTenants.ts` (hook + `__tests__` idiom), `.claude/rules/react-components.md`.
- luxon already a frontend dependency (`luxon@^3.7.2`).

## Phase 1 — Types & access helper
1. **Types** — Create `src/types/clinical.ts`: `AnamneseClinica`, `ConsentStatus` (`'pendente'|'dado'|'retirado'`), `ConsentStatusInfo` (`{ estado, data? }`), `ConsentLogEntry`.
2. **Access helper** — Create `src/utils/clinicalAccess.ts` exporting pure `canViewClinical(role?: string): boolean` over `{ admin, gerente, terapeuta, superadmin }`. Single source for the gate, reused by page and tab.

## Phase 2 — Data hook
3. **`useClinicalRecord(clienteId)`** — Create `src/hooks/useClinicalRecord.ts`. On mount (keyed by `clienteId`, guarded against double-fire): fetch the F02 clinical read (audit-triggering) and the F01 consent history in parallel via `api`; derive `ConsentStatusInfo` (latest `dados_saude` entry → pendente/dado+date/retirado) with luxon `Europe/Lisbon` `dd-MM-yyyy` formatting; degrade gracefully if the consent call fails. Return `{ anamnese, consentStatus, isLoading, error, reload }` per spec §5–§6.

## Phase 3 — Presentational components & page wiring
4. **Badges** — Create `src/components/clientes/SensitivityBadge.tsx` ("🔒 Dados clínicos sensíveis") and `src/components/clientes/ConsentStatusBadge.tsx` (maps `ConsentStatusInfo` → Pendente / Dado a DD-MM-AAAA / Retirado, color-coded), design-system styled.
5. **`ClinicalTab.tsx`** — Create `src/components/clientes/ClinicalTab.tsx`: defensive `canViewClinical` guard; uses `useClinicalRecord`; renders sensitivity badge + consent badge + read-only anamnesis; loading / empty / error states; no `alert()`, toast/inline for errors.
6. **Wire into the page** — Edit `src/pages/EditarCliente.jsx`: add a "Clínico" tab button **only** when `canViewClinical(user.role)` (from `useAuth`), and render `<ClinicalTab clienteId={id} />` when `abaAtiva === 'clinico'`. Minimal edit; do not convert the `.jsx` page.

## Phase 4 — Tests & gates
7. **Hook tests** — `src/hooks/__tests__/useClinicalRecord.test.ts`: consent derivation cases, parallel fetch, consent-failure degradation, no double-fetch (mock `api`).
8. **Component tests** — `src/components/clientes/__tests__/ClinicalTab.test.tsx`: role gate (tab hidden for `recepcionista`), badges, loading/empty/error states, and that the F02 clinical read is called exactly once on open and not at all for `recepcionista` (mock `api` + `useAuth`).
9. **Gates** — Run `npm run lint`, `npm run build` (tsc + Vite) and `npm run test:run` until green; then ready for `/implement-evaluate`.
