# F09 — Audit Log Viewer · Spec

## Component Overview
- `src/modules/admin/adminController.js` — `listarAudit` (the `work`). `src/modules/admin/adminRoutes.js` — `GET /audit`.
- Depends on **F01** (the `AuditLog` model). Read-only.

## Scope
**Included:** read the `AuditLog`, paginated and filtered, over the shared `laura-saas`.
**Out of scope:** the UI (F10 surfaces this); export; any mutation of audit entries.

## Requirements / Business Rules
- `GET /admin/audit` over `AuditLog`, paginated (`page`, `limit ≤ 100`), sorted by `createdAt` descending.
- Filters (query params, all optional): `targetTenantId`, `actorUserId`, `action`, `status` (`ok|denied|error`), `from`/`to` (date range on `createdAt`).
- Response `{ success, data: [entries], pagination }`. `req.audit.set({ action: 'audit.view', metadata: { filters } })`.
- The panel exposes **no** route that updates or deletes audit entries.

## API Contracts
`GET /api/v1/admin/audit?targetTenantId&actorUserId&action&status&from&to&page&limit`
→ `200 { success, data: [ … ], pagination: { total, page, pages, limit } }` · `400` invalid filter · `404` non-super-admin

## Data Model
Reads the existing `AuditLog`. The filter + sort are already covered by its indexes (`createdAt`, `{targetTenantId,createdAt}`, `{actorUserId,createdAt}`, `{action,createdAt}`).

## Error Handling
- Invalid `targetTenantId`/`actorUserId` (bad ObjectId), bad date, or out-of-enum `status` → 400 with the field.

## Testing Strategy
- Standard `tests/setup.js` (no transaction needed — read path).
- Tests: returns entries paginated + sorted desc; filtering by tenant / actor / action / status / date range works; invalid filter → 400; non-super-admin → 404 (sweep); confirm no audit-mutation route exists.

## Assumptions / Decisions
- **[Auto-Accept]** Uses the standard standalone test setup (no replica set — reads only).
- **[Auto-Accept]** Existing `AuditLog` indexes cover the filters and sort.
