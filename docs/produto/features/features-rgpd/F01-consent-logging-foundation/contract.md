# F01 — Consent Logging Foundation · Contract (GWT)

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R6/R7 — proof model v2 (`actor`/`evidencia`/`textoHash`/`fichaTokenId`, `politica_privacidade` moved to `NoticeReceipt`).

## C1 — Record an immutable consent entry
- **GIVEN** an authenticated staff user and a valid body (`clienteId`, `tipo`, `accao`, `origem`, plus `evidencia` when required — C10)
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** exactly one `ConsentLog` entry is committed with all fields + `createdAt`, including `actor: 'funcionario'` and a server-computed `textoHash`
- **AND** it appears in `GET /api/v1/gdpr/consent?clienteId=...`.

## C2 — Append-only (no mutation)
- **GIVEN** an existing consent entry
- **WHEN** any update/delete is attempted on `/gdpr/consent*`
- **THEN** no such route exists (404/405) and the entry is never modified (`updatedAt` is not tracked).

## C3 — No mass assignment
- **GIVEN** a body that also includes `tenantId` / `registadoPor` / `ip` / `versao` / `actor` / `textoHash` / `fichaTokenId`
- **WHEN** the entry is recorded
- **THEN** those fields take server-derived values (tenant from JWT, `registadoPor` from `req.user`, `ip` from request, `versao` = server `POLICY_VERSION`, `actor` = `'funcionario'` on this authenticated path, `textoHash` = hash of the current notice), not the body values (Reconciliation R6/R7).

## C4 — Client must exist in the tenant
- **GIVEN** a `clienteId` that does not exist in the caller's tenant (including one belonging to another tenant)
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** it returns 404 and creates no entry (never 403).

## C5 — Enum and ObjectId validation
- **GIVEN** an out-of-enum `tipo`/`accao`/`origem`, or an invalid `clienteId`
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** it returns 400 with the offending field and creates no entry.

## C6 — Policy version stamped (server-derived)
- **GIVEN** any valid body — with or without a `versao` key
- **WHEN** the entry is recorded
- **THEN** the entry is stamped with the server's current `POLICY_VERSION`; a body `versao` is never honored (Reconciliation R6).

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

## C10 — Staff grant requires evidence; withdrawal does not (R7/R8)
- **GIVEN** an authenticated staff user
- **WHEN** `POST /api/v1/gdpr/consent` with `accao: 'granted'` and **no** `evidencia`
- **THEN** it returns 400 and creates no entry
- **AND GIVEN** the same body **with** `evidencia`, it returns 201 (`actor: 'funcionario'`, `evidencia` stored)
- **AND GIVEN** `accao: 'withdrawn'` without `evidencia`, it returns 201 (opting out is frictionless).

## C11 — `NoticeReceipt` exists, is append-only, and has no HTTP surface
- **GIVEN** the `NoticeReceipt` model registered in `getModels`
- **WHEN** any HTTP method is attempted on a notice path under `/gdpr`
- **THEN** no such route exists (404)
- **AND** `NoticeReceipt.record()` writes an entry with `versao`/`textoHash`/`canal` and `updatedAt` is not tracked (asserted directly at model level — its only writer is F04's submit).

## C12 — `politica_privacidade` is not a consent type (R7)
- **GIVEN** a body with `tipo: 'politica_privacidade'`
- **WHEN** `POST /api/v1/gdpr/consent`
- **THEN** it returns 400 (out of enum) — notice delivery is recorded as a `NoticeReceipt`, never as consent.

## Prerequisites (the evaluator must ensure these exist)
- `mongodb-memory-server` test environment (no replica set / transactions needed for F01).
- A seeded `Cliente` in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
