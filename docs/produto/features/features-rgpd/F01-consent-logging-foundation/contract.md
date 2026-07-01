# F01 — Consent Logging Foundation · Contract (GWT)

## C1 — Record an immutable consent entry
- **GIVEN** an authenticated staff user and a valid body (`clienteId`, `tipo`, `accao`, `origem`)
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** exactly one `ConsentLog` entry is committed with all fields + `createdAt`
- **AND** it appears in `GET /api/v1/gdpr/consent?clienteId=...`.

## C2 — Append-only (no mutation)
- **GIVEN** an existing consent entry
- **WHEN** any update/delete is attempted on `/gdpr/consent*`
- **THEN** no such route exists (404/405) and the entry is never modified (`updatedAt` is not tracked).

## C3 — No mass assignment
- **GIVEN** a body that also includes `tenantId` / `registadoPor` / `ip`
- **WHEN** the entry is recorded
- **THEN** those fields take server-derived values (tenant from JWT, `registadoPor` from `req.user`, `ip` from request), not the body values.

## C4 — Client must exist in the tenant
- **GIVEN** a `clienteId` that does not exist in the caller's tenant (including one belonging to another tenant)
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** it returns 404 and creates no entry (never 403).

## C5 — Enum and ObjectId validation
- **GIVEN** an out-of-enum `tipo`/`accao`/`origem`, or an invalid `clienteId`
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** it returns 400 with the offending field and creates no entry.

## C6 — Policy version stamped
- **GIVEN** a body without `versao`
- **WHEN** the entry is recorded
- **THEN** the entry is stamped with the current `POLICY_VERSION`.

## C7 — History role gate + shape
- **GIVEN** a `recepcionista` token
- **WHEN** `GET /api/v1/gdpr/consent`
- **THEN** it returns 403
- **AND GIVEN** an `admin`/`gerente` token, it returns 200 with tenant-scoped entries, paginated (`limit` capped at 100), sorted by `createdAt` desc.

## C8 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** reading history or recording consent against a Tenant A client
- **THEN** Tenant A's data is never returned and the write returns 404.

## C9 — Recording allowed for non-admin staff (asymmetry with C7)
- **GIVEN** a `recepcionista` token and a valid body
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** it returns 201 and records the entry (recording is open to any authenticated staff, even though reading history in C7 is not).

## Prerequisites (the evaluator must ensure these exist)
- `mongodb-memory-server` test environment (no replica set / transactions needed for F01).
- A seeded `Cliente` in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
