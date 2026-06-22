# F09 — Audit Log Viewer · Plan

## Prerequisites
- F01 (`AuditLog`); standard `tests/setup.js`.

## Phase 1 — endpoint (TDD)
1. Test + impl: `GET /admin/audit` paginated, sorted by `createdAt` desc.
2. Test + impl: filters (`targetTenantId`, `actorUserId`, `action`, `status`, `from`/`to`); invalid filter → 400.

## Phase 2 — verify
3. Gates (`lint` + `test`) green; sweep test auto-covers the route's 404; confirm no audit-mutation route. Set F09 `status: "Implemented"` in `docs/PRDProgress.json`.
