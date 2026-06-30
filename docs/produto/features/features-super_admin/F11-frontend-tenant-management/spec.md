# F11 — Panel Frontend: Tenant Management UI · Spec

## Component Overview
- `laura-saas-frontend/src/components/admin/` (**NEW**): `CreateTenantForm.tsx`, `EditPlanLimitsForm.tsx`, `SuspendReactivateControls.tsx`.
- `laura-saas-frontend/src/schemas/admin.ts` — Zod schemas mirroring the API validation.
- Hosted within the F10 pages (a "New tenant" action on the list; edit/suspend controls on the detail page).
- Depends on **F03** (pre-fill), **F06** (create), **F07** (configure), **F08** (suspend/reactivate), **F10** (host pages).

## Scope
**Included:** forms to create a tenant, edit its plan/limits/flags, and suspend/reactivate it — with inline validation, confirmation for destructive actions, and toast feedback.
**Out of scope:** the backend rules (owned by F06/F07/F08) — the UI reflects them, never replaces them.

## Requirements / Business Rules
- All writes via `api.js`: `POST /admin/tenants` (create), `PUT /admin/tenants/:id/plano` + `/limites` (configure), `POST /admin/tenants/:id/suspender` + `/reactivar`.
- **Create form:** `nomeEmpresa`, `slug?`, `planoTipo`, `adminNome`, `adminEmail`; Zod-validated client-side mirroring F06.
- **Edit form:** plan (tipo, expiry) and limits (numbers, flags), pre-filled from F03; mirrors F07 validation.
- **Suspend/Reactivate:** buttons; suspend opens a **confirmation dialog** with an optional `motivo`; reactivate is a single confirm.
- Inline field errors (under each field), `react-toastify` toast on success, **never `alert()`**.
- Forms reflect current state (limits/plan controls pre-filled); destructive actions require explicit confirmation.

## API Contracts
Consumes F06/F07/F08 endpoints (above). No new endpoints.

## Data Model
Zod schemas in `src/schemas/admin.ts` for the create and configure forms.

## Error Handling
- API `400` → inline field message, form not cleared.
- `409` (duplicate slug/e-mail on create) → specific message, no partial state.
- `404` on an admin route → the session is no longer super-admin; `401` → existing auto-logout.

## Testing Strategy
- Gates: `npm run build` + `npm run lint`.
- E2E (Playwright, evaluator): super-admin creates a tenant → it appears in the list; edits its plan → change reflected; suspends it (with confirmation) → status shows suspended; reactivates → active again.

## Assumptions / Decisions
- **[Auto-Accept]** Forms reuse Zod (`src/schemas/`) + `react-toastify` + the design system; a confirmation dialog guards the destructive suspend.
- **[Auto-Accept]** Management controls live inside the F10 pages (list + detail), not a separate route tree.
