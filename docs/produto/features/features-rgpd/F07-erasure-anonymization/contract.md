# F07 — Data Subject Erasure & Anonymization · Contract (GWT)

## C1 — Erasure request (grace path) writes a withdrawal entry and marks the client
- **GIVEN** an authenticated `admin` and a valid client in the tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar` with no body (or `{ "confirmar": false }`)
- **THEN** it returns 200 with `pendingDeletion: true` and `deletionRequestedAt` set
- **AND** exactly one `ConsentLog` entry with `accao: 'withdrawn'` is appended for that client
- **AND** the client is **not** yet anonymized (`anonimizado: false`).

## C2 — Immediate anonymization on explicit confirmation
- **GIVEN** an authenticated `admin` and a valid client in the tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar` with `{ "confirmar": true }`
- **THEN** it returns 200 with `anonimizado: true`
- **AND** a `ConsentLog (withdrawn)` entry is appended
- **AND** erasure completes without any F08 job running.

## C3 — Anonymization clears PII and clinical fields
- **GIVEN** a client with name, phone, email, birth date and anamnesis fields populated
- **WHEN** anonymization runs (via `confirmar: true` or `anonimizarCliente`)
- **THEN** `nome` becomes `'[anonimizado]'`, `telefone` becomes `'ANON-<clienteId>'`, `email` is `null`, `dataNascimento` is `null`, every anamnese/clinical field is empty/false, and `anonimizado` is `true`.

## C4 — Fiscal records preserved (de-identified), never hard-deleted
- **GIVEN** a client with `Transacao` and `Pagamento` records
- **WHEN** the client is anonymized
- **THEN** all `Transacao`/`Pagamento` records still exist with their amounts, dates and references intact
- **AND** they are de-identified (the `Cliente` they reference is anonymized; embedded `Pagamento.dadosMBWay.telefone` is scrubbed)
- **AND** no fiscal document is deleted.

## C5 — Reusable, idempotent anonymization service (Provided to F08)
- **GIVEN** the `anonimizarCliente(models, tenantId, clienteId)` service
- **WHEN** it is called twice for the same client
- **THEN** the first call anonymizes and the second is a no-op (no error, single anonymized state, no duplicate work).

## C6 — Unique telefone index respected
- **GIVEN** two distinct clients in the same tenant
- **WHEN** both are anonymized
- **THEN** each gets a distinct `ANON-<clienteId>` token and no duplicate-key error occurs against `{tenantId, telefone}`.

## C7 — ObjectId and existence validation
- **GIVEN** an invalid `:id`, or a `clienteId` that does not exist in the caller's tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar`
- **THEN** invalid id → 400, unknown client → 404, and no `ConsentLog` entry and no anonymization occur.

## C8 — Admin-only role gate
- **GIVEN** a `recepcionista`, `gerente` or `terapeuta` token
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar`
- **THEN** it returns 403
- **AND GIVEN** an `admin` (or `superadmin`) token, the request is accepted.

## C9 — Tenant isolation
- **GIVEN** a Tenant B token (or `anonimizarCliente` called with Tenant B's id)
- **WHEN** requesting erasure / anonymization of a Tenant A client
- **THEN** it returns 404 (never 403), Tenant A's client is never modified, and no entry is written.

## Prerequisites (the evaluator must ensure these exist)
- **F01 implemented**: `gdpr` module mounted, `ConsentLog` model + `ConsentLog.record()` available in the tenant registry.
- `mongodb-memory-server` test environment (no replica set / transactions needed for F07).
- A seeded `Cliente` (with anamnesis fields) plus `Transacao`/`Pagamento` records in the acting tenant; JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`, `terapeuta`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
