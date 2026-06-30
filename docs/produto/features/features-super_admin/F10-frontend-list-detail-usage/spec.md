# F10 — Panel Frontend: List, Detail & Usage · Spec

## Component Overview
- `laura-saas-frontend/src/pages/admin/` (**NEW**): `TenantsListPage.tsx`, `TenantDetailPage.tsx`, `AuditLogPage.tsx`.
- `laura-saas-frontend/src/hooks/useAdminTenants.ts` + `useAdminAudit.ts` (logic via `api.js`).
- `laura-saas-frontend/src/types/admin.ts` — response types.
- Routing in `App.tsx`: protected `/admin/*` routes, **super-admin only**.
- Depends on **F02, F03, F04, F09** (the API endpoints).

## Scope
**Included:** read-only pages — tenant list (paginated, search by name/slug), tenant detail (plan/limits/config/user count + usage), audit log view (filterable). Panel nav entry shown only to a super-admin.
**Out of scope:** the management forms (F11).

## Requirements / Business Rules
- New files in **TypeScript** (`.tsx`/`.ts`) per the TS-migration rule. Logic in custom hooks, not in pages.
- All HTTP through `src/services/api.js` against `/api/v1/admin/*` (never `fetch`). Use `useAuth()` — the panel routes render only when `user.role === 'superadmin'`; otherwise redirect away and hide the nav entry.
- Every view has **loading** (Spinner), **empty**, and **error** (inline + toast) states.
- Design system: indigo-500/purple-500, slate-900 background, glassmorphism cards, gradient primary button.
- List: paginated table (≤100), search box (name/slug), row click → detail.
- Detail: plan, limits, configuration, user count (F03) + usage counts (F04).
- Audit: filterable table (F09) — tenant, action, status, date range.

## API Contracts
Consumes (no new endpoints): `GET /admin/tenants` (F02), `GET /admin/tenants/:id` (F03), `GET /admin/tenants/:id/uso` (F04), `GET /admin/audit` (F09).

## Data Model
Front-end types in `src/types/admin.ts` mirroring the API responses (Tenant summary, Tenant detail + user count, usage counts, audit entry).

## Error Handling
- 401 → handled by the existing `api.js` interceptor (auto-logout).
- 404 on an admin route → the session is not super-admin → redirect away from `/admin`.
- Network/server error → toast + inline message; never `alert()`.

## Testing Strategy
- Gates: `npm run build` (tsc) + `npm run lint` in `laura-saas-frontend`.
- E2E (Playwright, run by the evaluator): log in as super-admin → see the tenant list → open a tenant → see its usage → open the audit log. A non-super-admin cannot reach `/admin`.

## Assumptions / Decisions
- **[Auto-Accept]** Super-admin gating done in routing via `useAuth()` (consistent with the existing `ProtectedLayout`).
- **[Auto-Accept]** Reuse `api.js`, the design system, and the custom-hook pattern (`.claude/rules/react-*`).
- **[Decision]** New files in TypeScript (`.tsx`).
