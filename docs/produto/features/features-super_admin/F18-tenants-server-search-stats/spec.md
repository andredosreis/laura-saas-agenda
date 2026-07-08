# F18 — Server-Side Tenant Search, Filters & Stats · Spec

The console loads at most 100 tenants in one fetch (`useAdminTenants.ts:15`) and does search, KPIs and plan distribution client-side — all silently wrong past the 100th tenant (a warning banner admits it). Move search/filter/pagination and stats to the server.

## Mandatory reading
- `src/modules/admin/adminController.js` — `listarTenants` (`:17-38`)
- `src/modules/admin/adminSchemas.js` (Zod style, `listarAuditSchema` as the query-validation example)
- `laura-saas-frontend/src/hooks/useAdminTenants.ts`, `src/pages/admin/TenantsListPage.tsx`, `src/components/admin/adminStats.ts`
- `.claude/rules/mongoose-queries.md` (note: `Tenant` is control-plane — no `tenantId` filter applies, same rationale as the existing comment at `adminController.js:43-46`)

## Component Overview
- Backend: `listarTenants` gains `search`/`plano`/`status` params (new `listarTenantsSchema` validated on `query`); new `obterTenantStats` handler + `GET /tenants/stats` route.
- Frontend: `useAdminTenants` becomes server-driven; new `useAdminTenantStats`; `TenantsListPage` drops `computeTenantStats` + the ceiling banner; `adminStats.ts` deleted.

## Scope
**Included:** server search (nome/slug), filters (plano.tipo, plano.status), server pagination in the UI, stats endpoint + KPIs, plan-distribution data from the server.
**Out of scope:** column sorting (keep `createdAt DESC`), full-text indexes, caching.

## Requirements / Business Rules

### Backend
- `listarTenantsSchema` (validate as `'query'`, mirroring `listarAuditSchema`): `page`/`limit` coerced (limit ≤ 100), `search` optional string (trim, max 100 chars), `plano` optional enum (the plan-tipo enum used in `adminSchemas.js` — reuse the existing const), `status` optional enum (reuse the plano.status enum).
- Filter build in `listarTenants`:
  - `search` → **escape regex metacharacters** (`search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`) then `{ $or: [{ nome: rx }, { slug: rx }] }` with `new RegExp(escaped, 'i')`.
  - `plano` → `{ 'plano.tipo': plano }`; `status` → `{ 'plano.status': status }`.
  - Keep `Promise.all([find, countDocuments])` with the same filter for both; keep the existing `select` and sort.
- New handler `obterTenantStats` + route `router.get('/tenants/stats', obterTenantStats)` — **declared BEFORE `router.get('/tenants/:id')`** in `adminRoutes.js`, otherwise Express matches `stats` as an `:id` (and ObjectId validation would 400 it — still declare it first; do not rely on that accident).
  - One aggregation on `Tenant`: `[{ $facet: { total: [{ $count: 'n' }], porStatus: [{ $group: { _id: '$plano.status', n: { $sum: 1 } } }], porTipo: [{ $group: { _id: '$plano.tipo', n: { $sum: 1 } } }] } }]`, reshaped to `{ total, porStatus: { ativo: n, trial: n, suspenso: n, ... }, porTipo: { ... } }` with zeros for absent keys.
  - `req.audit.set({ action: 'tenant.stats' })`.
  - Collection scan is fine — control-plane `Tenant` counts in the hundreds at most; note it in a comment. Same for the search regex (no index needed now; add `{ nome: 1 }` only if the collection ever grows past ~10k).

### Frontend
- `useAdminTenants(page, limit, filters)` refetches on server params (model it on `useAdminAudit`'s server-driven shape, minus its toast bug): query string `page/limit/search/plano/status`; expose `refetch`.
- `TenantsListPage`:
  - Search input debounced (300 ms — small local `useEffect` timer; no new dependency) and reset to page 1 on any filter change.
  - Add two selects (Plano, Estado) beside the search input, console-styled.
  - Pagination footer switches to server `pagination` (same component shape as `AuditLogPage`; F22 will extract the shared component later).
  - KPI strip + `PlanDistributionBar` consume `useAdminTenantStats` (`GET /admin/tenants/stats`); delete `computeTenantStats`, `adminStats.ts` and the `total > tenants.length` warning banner (`TenantsListPage.tsx:66-70`).
- Update `src/types/admin.ts` with the `TenantStats` response type.

## API Contracts
- `GET /api/v1/admin/tenants?page=&limit=&search=&plano=&status=` → `200 { success, data: [...], pagination }` (shape unchanged; filters narrow it) · invalid enum/limit → 400 (Zod)
- `GET /api/v1/admin/tenants/stats` → `200 { success, data: { total, porStatus: Record<string, number>, porTipo: Record<string, number> } }`

## Error Handling
- Regex metacharacters in `search` are escaped — `search=a+b(` must not 500 (test it).
- Unknown `plano`/`status` values → 400 via Zod, contract body.

## Testing Strategy
- Extend `tests/admin-tenants.test.js`:
  1. Seed 120 tenants → default list returns 20 with `pagination.total = 120`; `search` matches by nome AND by slug, case-insensitive; regex-metachar search returns 200 with empty results.
  2. `plano`/`status` filters narrow correctly; combined filters AND together.
  3. `GET /tenants/stats` with a seeded mix returns exact counts per status/tipo and total; route resolves (not swallowed by `/:id`); audit entry `tenant.stats` recorded; non-superadmin → 404 (sweep covers it).
- Frontend: hook test asserting the query string; page test: KPI values come from the stats mock, not from the page of 20.

## Assumptions / Decisions
- **[Key]** Stats via one `$facet` aggregation instead of N `countDocuments`: single round-trip, and the shape is exactly what the KPI strip needs.
- **[Auto-Accept]** Debounce implemented locally (no lodash) — the project has no debounce util and one 5-line effect beats a dependency.
- **[Auto-Accept]** `adminStats.ts` and its unit test (if any) are deleted, not deprecated — the guard here is the seeded >100 backend test.
