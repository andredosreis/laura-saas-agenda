# F10 — Panel Frontend: List, Detail & Usage · Plan

## Prerequisites
- F02, F03, F04, F09 (API endpoints) available; frontend `build` + `lint`.

## Phase 1 — routing + guard
1. Add a super-admin route guard (`useAuth().user.role === 'superadmin'`) and the `/admin/*` routes in `App.tsx`; hide the nav entry for non-super-admins.

## Phase 2 — data + pages
2. `src/types/admin.ts` + `useAdminTenants` / `useAdminAudit` hooks (via `api.js`).
3. `TenantsListPage` — paginated table + name/slug search.
4. `TenantDetailPage` — detail (F03) + usage (F04).
5. `AuditLogPage` — filterable table (F09).

## Phase 3 — verify
6. `npm run build` + `npm run lint` green; Playwright happy path (list → detail → usage → audit). Set F10 `status: "Implemented"` in `docs/produto/PRDProgress.json`.
