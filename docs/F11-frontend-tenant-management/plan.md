# F11 — Panel Frontend: Tenant Management UI · Plan

## Prerequisites
- F03, F06, F07, F08 (API) + F10 (host pages); frontend `build` + `lint`.

## Phase 1 — schemas + create
1. `src/schemas/admin.ts` (Zod) for create + configure.
2. `CreateTenantForm` → `POST /admin/tenants`; inline validation; success toast; 409 handling; new tenant appears in the list.

## Phase 2 — edit + suspend
3. `EditPlanLimitsForm` (pre-filled from F03) → `PUT .../plano` + `.../limites`.
4. `SuspendReactivateControls` → confirmation dialog (suspend, optional motivo) → `POST .../suspender` / `.../reactivar`; status reflected.

## Phase 3 — verify
5. `npm run build` + `npm run lint` green; Playwright flow (create → edit → suspend → reactivate). Set F11 `status: "Implemented"` in `docs/PRDProgress.json`.
