# F08 — Automated Retention Anonymization · Contract (GWT)

> F08 has no HTTP endpoint. Contracts are stated against the core routine
> (`processarTenantRetencao` / `executarRetencao`) and the scheduled job, verified
> with `mongodb-memory-server` and F07's real `anonimizarCliente` (no Redis needed).

## C1 — Retention anonymization (default 24 months)
- **GIVEN** an active tenant with `retencaoMeses` unset (default 24) and a non-anonymized client whose latest activity (most recent `Agendamento.dataHora` / `Transacao.createdAt`, else `Cliente.createdAt`) is older than 24 months
- **WHEN** the retention routine runs for that tenant
- **THEN** the client is anonymized via F07's `anonimizarCliente` (`anonimizado === true`)
- **AND** a client active within the window is left untouched.

## C2 — Per-tenant retention override
- **GIVEN** a tenant with `configuracoes.retencaoMeses = 6` and a client inactive for 7 months
- **WHEN** the routine runs
- **THEN** the client is anonymized (it would NOT be under the default 24).

## C3 — Erasure grace completion
- **GIVEN** a client with `pendingDeletion === true` and `deletionRequestedAt = now − (GRACE_PERIOD_DAYS + 1) days`
- **WHEN** the routine runs
- **THEN** the client is anonymized
- **AND** a client with `pendingDeletion === true` still within the grace period is NOT anonymized.

## C4 — Fiscal records & aggregated stats preserved
- **GIVEN** an eligible client with `Transacao`/`Pagamento` records
- **WHEN** the routine anonymizes the client
- **THEN** the fiscal documents still exist with amounts/dates intact (de-identified via F07), and no hard-delete of fiscal data occurs.

## C5 — Counts split by reason, no silent caps
- **GIVEN** a tenant with N retention-expired and M grace-elapsed clients
- **WHEN** `processarTenantRetencao` runs
- **THEN** it returns `{ anonimizadosRetencao: N, anonimizadosGraca: M, falhados: 0 }` (every eligible client processed; the candidate set is never truncated)
- **AND** the aggregate run logs these counts split by reason.

## C6 — Per-tenant failure isolation
- **GIVEN** several active tenants where one fails (e.g. its models reject)
- **WHEN** `executarRetencao()` runs
- **THEN** the other tenants are still processed and anonymized, the run completes, and the failing tenant is counted in `errosTenant` (retried on the next weekly run).

## C7 — Idempotency across runs
- **GIVEN** a tenant already processed once
- **WHEN** the routine runs again
- **THEN** it does not error and anonymizes 0 additional clients (F07's `anonimizarCliente` is a no-op on already-anonymized clients).

## C8 — No-activity fallback to createdAt
- **GIVEN** a non-anonymized client with no appointments and no transactions
- **WHEN** the routine runs
- **THEN** eligibility is decided by `Cliente.createdAt` vs the retention cutoff (old `createdAt` → anonymized; recent → untouched).

## C9 — Multi-tenant isolation
- **GIVEN** two tenants each with one eligible client in their own tenant DB
- **WHEN** the job iterates both
- **THEN** each client is anonymized only within its own tenant DB and neither tenant's data leaks into the other (all work via `getModels(getTenantDB(tenant._id))` + `{ _id, tenantId }`).

## C10 — Weekly repeatable scheduling
- **GIVEN** Redis is configured
- **WHEN** the server boots and `scheduleRetentionJob()` runs
- **THEN** exactly one repeatable `gdpr-retention` job is registered on the weekly cron (re-registering on redeploy does not stack duplicates)
- **AND GIVEN** Redis is absent, `startRetentionWorker()` / `scheduleRetentionJob()` no-op with a warning and the server still starts.

## Prerequisites (the evaluator must ensure these exist)
- **F07 merged:** `anonimizarCliente(models, tenantId, clienteId)`, `GRACE_PERIOD_DAYS` (`src/modules/gdpr/gdprConfig.js`), and `Cliente` flags `anonimizado` / `pendingDeletion` / `deletionRequestedAt`.
- `Tenant.configuracoes.retencaoMeses` (default 24) added; `Cliente` compound index for the candidate queries added.
- `mongodb-memory-server` test environment (no Redis / replica set needed — tests drive the core routine directly).
- Test helpers to seed multiple tenant DBs (`getTenantDB`/`getModels`) with clients, appointments and transactions at controlled dates; external services (WhatsApp/OpenAI/email) mocked per `.claude/rules/testing.md`.
