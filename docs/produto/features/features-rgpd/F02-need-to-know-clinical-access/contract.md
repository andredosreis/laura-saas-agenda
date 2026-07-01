# F02 — Need-to-Know Clinical Access Control · Contract (GWT)

## C1 — Receptionist never receives clinical fields (server-side)
- **GIVEN** a `recepcionista` token and a client in the tenant
- **WHEN** `GET /api/v1/clientes/:id`
- **THEN** it returns 200 with the base record and **every** `CLINICAL_FIELDS` key absent from `data` (verified server-side, not just hidden in UI)
- **AND** no `AcessoClinicoLog` entry is written.

## C2 — Permitted role reads clinical and produces exactly one audit entry
- **GIVEN** an `admin`/`gerente`/`terapeuta` token and a client in the tenant
- **WHEN** `GET /api/v1/clientes/:id`
- **THEN** it returns 200 with the clinical fields present
- **AND** exactly one `AcessoClinicoLog` entry exists for that `{ clienteId, userId }` (`origem: 'detalhe'`, `ip` set).

## C3 — List never exposes clinical fields
- **GIVEN** any authenticated role
- **WHEN** `GET /api/v1/clientes`
- **THEN** every item omits all `CLINICAL_FIELDS` (list minimization)
- **AND** no `AcessoClinicoLog` entries are written for the list read.

## C4 — AI internal path returns no clinical data
- **GIVEN** a valid `X-Service-Token`
- **WHEN** any `GET /api/internal/clientes/*` endpoint returns a client
- **THEN** the payload contains zero `CLINICAL_FIELDS` keys (nothing anamnesis-related is ever sent toward `ia-service`).

## C5 — Read audit is append-only
- **GIVEN** an existing `AcessoClinicoLog` entry
- **WHEN** any update/delete is attempted via the API
- **THEN** no such route exists (404/405) and the entry is never modified (`updatedAt` is not tracked); the only write path is `statics.record()`.

## C6 — Superadmin bypass
- **GIVEN** a `superadmin` token
- **WHEN** `GET /api/v1/clientes/:id`
- **THEN** clinical fields are present (superadmin bypasses the role gate, as with `authorize`).

## C7 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** `GET /api/v1/clientes/:id` for a Tenant A client
- **THEN** it returns 404, writes no `AcessoClinicoLog`, and Tenant A's audit entries are never returned to Tenant B.

## C8 — Audit failure does not break the read
- **GIVEN** a permitted role and an `AcessoClinicoLog.record()` that fails
- **WHEN** `GET /api/v1/clientes/:id`
- **THEN** the read still returns 200 with the clinical fields and the failure is logged (best-effort audit, R9).

## C9 — Bounded retention
- **GIVEN** the `AcessoClinicoLog` collection
- **WHEN** its indexes are inspected
- **THEN** a TTL index on `createdAt` (~12 months) exists, so entries expire automatically without any delete route (preserving C5).

## Prerequisites (the evaluator must ensure these exist)
- `mongodb-memory-server` test environment (no replica set / transactions needed for F02; note `mongodb-memory-server` does not enforce TTL expiry in real time — C9 verifies index presence, not live deletion).
- Seeded `Cliente` documents in the acting tenant with the anamnese block populated; JWT/auth test helper for roles (`admin`, `gerente`, `terapeuta`, `recepcionista`, `superadmin`) and an `X-Service-Token` helper for the internal path.
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
- `clinicalFields.js` `CLINICAL_FIELDS` available to tests as the assertion source of truth.
