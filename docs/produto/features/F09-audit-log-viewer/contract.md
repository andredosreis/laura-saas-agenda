# F09 — Audit Log Viewer · Contract (GWT)

## C1 — Paginated list
- **GIVEN** a super-admin and existing audit entries
- **WHEN** `GET /api/v1/admin/audit`
- **THEN** it returns the entries paginated (≤100) and sorted by `createdAt` descending, with a `pagination` block.

## C2 — Filters
- **GIVEN** audit entries for several tenants/actions/statuses
- **WHEN** `GET /api/v1/admin/audit` with `targetTenantId`, `action`, `status` or a `from/to` date range
- **THEN** only matching entries are returned.

## C3 — Read-only
- **GIVEN** the audit module
- **WHEN** any client attempts to update or delete an audit entry
- **THEN** there is no route to do so (the panel exposes only reads of `AuditLog`).

## C4 — Validation / hidden
- **GIVEN** an invalid filter (bad ObjectId/date, out-of-enum status) or a non-super-admin token
- **WHEN** the endpoint is called
- **THEN** it returns 400 (invalid filter) or 404 (non-super-admin).

## Prerequisites (the evaluator must ensure these exist)
- F01 `AuditLog` with seeded entries to filter over.
