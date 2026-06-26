# F08 — Automated Retention Anonymization — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F08)
**Complexity:** moderate
**Module:** `src/jobs/` + `src/queues/` + `src/workers/` (new files) + `src/models/Tenant.js` (new config field) — backend, scheduled, multi-tenant
**Depends on:** F07 (Erasure & Anonymization — `anonimizarCliente(models, tenantId, clienteId)`, `Cliente.pendingDeletion`/`deletionRequestedAt`, `GRACE_PERIOD_DAYS` from `src/modules/gdpr/gdprConfig.js`). Transitively F01 (`ConsentLog` already written by F07).

---

## 1. Scope

**Included:**
- A **weekly BullMQ repeatable job** that iterates **every active tenant** and anonymizes two sets of clients, reusing F07's `anonimizarCliente`:
  - **(a) Retention-expired** — clients with no activity (no appointment, no transaction) beyond the tenant's configured retention period (default **24 months**).
  - **(b) Erasure-grace-elapsed** — clients with `pendingDeletion = true` whose grace period (counted from `deletionRequestedAt`) has elapsed (default `GRACE_PERIOD_DAYS = 30`, from F07).
- New per-tenant retention config field `Tenant.configuracoes.retencaoMeses` (default 24).
- New queue/worker/job files mirroring the existing BullMQ setup (`notificationQueue.js` / `notificationWorker.js`) and the existing job idiom (`lembreteParcelaJob.js`): a dedicated `gdpr-retention` queue with a registered repeatable job, a worker that runs the core routine, and the core routine itself (independently testable).
- Bootstrapping in `src/server.js`: start the retention worker and register the repeatable job (next to `startNotificationWorker()` / `startLembreteParcelaCron()`).

**Provides (to later features):** none — F08 is a terminal/leaf feature (Wave 3). It completes the erasure lifecycle started by F07 and enforces the retention policy described in PRD §2.

**Deferred (other features):**
- The `anonimizarCliente` service, the `pendingDeletion`/`deletionRequestedAt` flags and the immediate-confirmation erasure path are **F07** — F08 only consumes them.
- Any admin UI to configure `retencaoMeses` per tenant is out of scope (the field exists; the panel control is a later/non-PRD task). The default (24) applies until set.
- Pruning of `AcessoClinicoLog` access logs (PRD F02 note) is a separate concern, not part of this job.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/Tenant.js` | edit | Add `configuracoes.retencaoMeses` (Number, default 24) — per-tenant retention period in months. |
| `src/jobs/retentionAnonymizationJob.js` | new | Core routine: `executarRetencao()` (iterate active tenants, bounded concurrency, `Promise.allSettled`) + `processarTenantRetencao(tenant)` (resolve tenant DB/models, find both sets, anonymize via F07, return per-tenant counts split by reason). Single source of truth for the logic; testable without Redis. |
| `src/queues/retentionQueue.js` | new | `getRetentionQueue()` (lazy `Queue('gdpr-retention')` on the shared Redis connection) + `scheduleRetentionJob()` which registers the **repeatable** job (weekly). Mirrors `notificationQueue.js`. |
| `src/workers/retentionWorker.js` | new | `startRetentionWorker()` — `Worker('gdpr-retention')` whose processor calls `executarRetencao()`; concurrency 1 (one global sweep at a time). Graceful no-op if Redis absent. Mirrors `notificationWorker.js`. |
| `src/server.js` | edit | After DB connect: `startRetentionWorker()` + `scheduleRetentionJob()` (guarded by env, like the existing cron). |
| `tests/gdpr-retention.test.js` | new | integration tests of the core routine (Jest + supertest-less; `mongodb-memory-server`), exercising both reasons, isolation and failure isolation. |

Pattern references: `src/jobs/lembreteParcelaJob.js` (per-tenant iteration + `Promise.allSettled` + env-guarded scheduling + structured logging), `src/queues/notificationQueue.js` + `src/queues/redisConnection.js` (BullMQ queue + lazy Redis), `src/workers/notificationWorker.js` (worker idiom + graceful Redis-absent), `src/config/tenantDB.js` + `src/models/registry.js` (per-tenant DB/models), `src/models/Tenant.js` (`Tenant.find({ ativo })` for the shared tenant list; `configuracoes` block), `src/modules/gdpr/gdprService.js` + `gdprConfig.js` (F07 — `anonimizarCliente`, `GRACE_PERIOD_DAYS`).

---

## 3. Data Model

No new collection. Two touch points only:

**Tenant (shared `laura-saas` DB) — new config field:**
```js
// appended to configuracoes in src/models/Tenant.js
retencaoMeses: { type: Number, default: 24 }, // GDPR retention window (months of inactivity)
```
- Default 24 applies to all existing tenants without backfill.
- Read per tenant inside `processarTenantRetencao`; falls back to 24 if missing/invalid (`> 0`).

**Cliente (tenant DB) — reused from F07 (no change here):**
- `anonimizado`, `pendingDeletion`, `deletionRequestedAt` already exist (F07).
- F08 **adds the index** that makes set (b) and set (a) efficient (queries introduce it, per `.claude/rules/mongoose-models.md`):
```js
clienteSchema.index({ tenantId: 1, anonimizado: 1, pendingDeletion: 1, deletionRequestedAt: 1 });
```
  `[Auto-Accept]` — F07's spec explicitly defers this index to F08 ("F08 will add `{ tenantId, pendingDeletion, deletionRequestedAt }` when it queries grace-elapsed clients"). Set (a) (retention) is resolved by joining last-activity from `Agendamento`/`Transacao`, so it relies on the existing `{ tenantId, cliente }` indexes on those collections plus `{ tenantId, anonimizado }` to skip already-anonymized clients.

---

## 4. Job Contract (no HTTP API)

F08 has **no HTTP endpoint** — it is a background sweep. Its "contract" is the repeatable job + the routine's return shape.

### Schedule
- Repeatable BullMQ job on queue `gdpr-retention`, cron `0 3 * * 1` (Mondays 03:00 Europe/Lisbon). `[Auto-Accept]`
- Registered idempotently at boot via `scheduleRetentionJob()` (BullMQ de-duplicates a repeatable by its repeat key, so re-registering on every deploy does not stack duplicates).
- Overridable/disable via env (`GDPR_RETENTION_CRON`=`off`, `GDPR_RETENTION_CRON_SCHEDULE`), mirroring `LEMBRETE_PARCELA_CRON*`.

### `processarTenantRetencao(tenant)` → per-tenant result
```js
{ tenantId, anonimizadosRetencao: <n>, anonimizadosGraca: <n>, falhados: <n> }
```

### `executarRetencao()` → aggregate log (no return value needed)
```
[Retencao] Job concluído { tenantsProcessados, anonimizadosRetencao, anonimizadosGraca, falhados, errosTenant, duracaoMs }
```
- Per tenant, an INFO line is logged with the two counts split by reason. **No silent caps** — every eligible client is processed (the routine logs counts, never truncates the candidate set).

---

## 5. Requirements / Business Rules

- **R1.** A weekly repeatable BullMQ job iterates **all active tenants** (`Tenant.find({ ativo: { $ne: false } })` on the shared DB) and processes each with its own tenant DB/models via `getTenantDB` + `getModels`.
- **R2.** **Set (a) — retention:** a client is eligible when it is **not yet anonymized** and its **last activity** is older than `now − retencaoMeses`. "Last activity" = the latest of: most recent `Agendamento.dataHora` for that client and most recent `Transacao.createdAt` for that client; if the client has **no** appointment and **no** transaction, fall back to `Cliente.createdAt`. `[Auto-Accept]` (precise definition below).
- **R3.** **Set (b) — erasure grace:** a client is eligible when `pendingDeletion === true` and `deletionRequestedAt <= now − GRACE_PERIOD_DAYS` (F07's constant). Already-anonymized clients are skipped.
- **R4.** Both sets are anonymized by calling F07's **`anonimizarCliente(models, tenantId, clienteId)`** — F08 never re-implements anonymization and never hard-deletes. The service is idempotent (F07 R4), so overlap between sets or a re-run is safe.
- **R5.** **Fiscal records and aggregated statistics are preserved** — guaranteed by F07's service (Transacao/Pagamento kept, de-identified). F08 adds nothing that deletes them.
- **R6.** The job logs, **per tenant**, the count anonymized **split by reason** (retention vs erasure-grace) and an aggregate summary. No silent caps; the candidate set is never truncated.
- **R7.** **Per-tenant failure isolation:** one tenant throwing does not stop the others (`Promise.allSettled` over tenants; rejected results counted as `errosTenant` and logged). Failed tenants are simply retried on the next weekly run (the data state is unchanged for them).
- **R8.** **Multi-tenant isolation:** all anonymization happens through tenant-scoped models (`getModels(getTenantDB(tenant._id))`) and `anonimizarCliente`'s `{ _id, tenantId }` queries (F07 R9). The job never crosses tenants.
- **R9.** **No `await` in a loop across tenants where avoidable**, but bounded — tenants are processed with a concurrency cap (default 5) to avoid opening unbounded tenant DB work at once. `[Auto-Accept]` Within a tenant, candidate clients are anonymized with `Promise.all` (bounded by the per-tenant candidate count, which is small in practice).
- **R10.** Retention period is **configurable per tenant** via `Tenant.configuracoes.retencaoMeses`; default 24 months when unset/invalid.
- **R11.** Graceful degradation: if Redis is not configured the worker/scheduler no-op with a warning (mirroring the notification worker) — startup is never blocked.

**UX flow:** none (system-initiated background job; no user interaction).

---

## 6. Error Handling

| Scenario | Handling |
|---|---|
| One tenant's processing throws (DB error, bad data) | Isolated via `Promise.allSettled`; logged as `errosTenant`; other tenants continue; retried next weekly run. |
| `anonimizarCliente` throws for one client | Caught per client; counted as `falhados` for that tenant; remaining candidates continue; retried next run. |
| Redis not configured (`REDIS_URL` absent) | `startRetentionWorker()` / `scheduleRetentionJob()` log a warning and return `null`; no crash. |
| Tenant has `retencaoMeses` missing/invalid | Falls back to default 24. |
| Already-anonymized client matches a set | `anonimizarCliente` is idempotent → no-op; not double-counted. |
| Whole job throws unexpectedly | Caught at `executarRetencao` top level; logged; BullMQ marks the job failed and retries per `defaultJobOptions` (no partial-state corruption — each client is independent and idempotent). |

No HTTP responses (no endpoint). No stack traces leak (system logs only, via `logger`).

---

## 7. Testing Strategy

`tests/gdpr-retention.test.js` (Jest ESM + `mongodb-memory-server`; external services — WhatsApp/OpenAI/email — mocked per `.claude/rules/testing.md`). Tests exercise the **core routine** (`processarTenantRetencao` / `executarRetencao`) directly with seeded tenant DBs — **no Redis required** (BullMQ wiring is thin and excluded; `[Auto-Accept]`). `anonimizarCliente` (F07) is used for real, not mocked, so the integration is verified end-to-end.

**Acceptance (from PRD §9 F08):**
- `anonymizes clients inactive beyond the tenant's configured period (default 24 months) via F07's service` — seed a client whose last appointment/transaction is >24 months old → after the routine, `anonimizado === true`; a client active within the window is untouched.
- `respects a per-tenant retencaoMeses override` — set `retencaoMeses = 6`; a client inactive 7 months is anonymized; with default 24 it would not be.
- `anonymizes clients with pendingDeletion=true whose grace period elapsed` — seed `pendingDeletion=true`, `deletionRequestedAt = now − (GRACE_PERIOD_DAYS+1)d` → anonymized; one within grace → untouched.
- `fiscal records and aggregated stats are preserved` — seed `Transacao`/`Pagamento` for the client; after anonymization the fiscal docs still exist with amounts/dates intact (delegated to F07's guarantee, asserted here).
- `logs the count anonymized per tenant split by reason` — assert the returned `{ anonimizadosRetencao, anonimizadosGraca }` counts are correct and distinct.
- `a failure for one tenant does not stop processing of others` — make one tenant throw (e.g. stub its models to reject); assert other tenants still get anonymized and the run completes with `errosTenant >= 1`.

**Service/edge:**
- `is idempotent across runs` — running the routine twice does not error and does not double-process (counts on second run are 0).
- `a client with no appointments and no transactions uses createdAt as last activity` — old `createdAt` → eligible; recent → not.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `the job never anonymizes a client of a tenant under another tenant's DB` — two tenants each with one eligible client; assert each tenant's client is anonymized only within its own DB and the other's data is untouched.

**Cross-feature note:** F08 consumes F07's `anonimizarCliente` and flags, and (transitively) F01's `ConsentLog` is written by F07's immediate path — F08 does not write consent entries itself.

---

## 8. Assumptions / Decisions

- **`[Auto-Accept]` Scheduling mechanism = BullMQ repeatable job (not node-cron).** PRD F08 explicitly says "weekly **BullMQ** repeatable job". The existing `lembreteParcelaJob` uses `node-cron`, but the PRD mandates BullMQ here, so F08 introduces a `gdpr-retention` queue + worker + repeatable registration. The job is registered idempotently at boot (BullMQ de-dupes by repeat key).
- **`[Auto-Accept]` Cron expression = `0 3 * * 1` (Mondays 03:00 Europe/Lisbon).** PRD says "weekly" without a day/time. Chosen: off-peak, start of week. Overridable via `GDPR_RETENTION_CRON_SCHEDULE`; disable via `GDPR_RETENTION_CRON=off` (mirrors `LEMBRETE_PARCELA_CRON*`).
- **`[Auto-Accept]` Retention config location = `Tenant.configuracoes.retencaoMeses` (Number, default 24).** PRD says "configurable per tenant, default 24 months". The `configuracoes` sub-doc already holds per-tenant operational settings; a months integer fits the existing style. No admin UI in this feature.
- **`[Auto-Accept]` "Inactivity" definition.** Last activity = latest of (most recent `Agendamento.dataHora`, most recent `Transacao.createdAt`) for the client; if the client has neither, fall back to `Cliente.createdAt`. A client is retention-expired when last activity `< now − retencaoMeses` (Luxon, Europe/Lisbon). `Transacao.createdAt` is used (the record's existence marks activity) rather than `dataPagamento` (nullable). Both collections key on `cliente` (verified). Already-`anonimizado` clients are excluded from set (a).
- **`[Auto-Accept]` Grace period source = F07's `GRACE_PERIOD_DAYS` (30).** F08 reuses F07's constant from `src/modules/gdpr/gdprConfig.js` rather than redefining it, so the two-path erasure lifecycle stays consistent.
- **`[Auto-Accept]` Tenant concurrency = 5 (bounded).** "Never await in a loop" but also "be careful iterating many tenants". Tenants are processed in chunks of 5 with `Promise.allSettled`; within a tenant, eligible clients are anonymized with `Promise.all`. Cap overridable via `GDPR_RETENTION_CONCURRENCY`.
- **`[Auto-Accept]` Worker concurrency = 1.** Only one global retention sweep should run at a time (it already fans out internally); a single repeatable job + `concurrency: 1` worker avoids overlapping sweeps.
- **`[Auto-Accept]` New compound index `{ tenantId, anonimizado, pendingDeletion, deletionRequestedAt }` on `Cliente`** is added here (F07 deferred it to F08), supporting set (b)'s query and skipping already-anonymized clients in set (a).
- **`[Auto-Accept]` Tests target the core routine, not the BullMQ wiring.** The queue/worker layer is a thin, well-trodden mirror of `notificationWorker`/`notificationQueue` and needs Redis; the business logic lives in `retentionAnonymizationJob.js` and is fully tested with `mongodb-memory-server`. This matches F01/F07's "no replica set / Redis needed in tests" stance.
- **`[Auto-Accept]` Failure handling = retry next run, no dead-letter.** A failed tenant/client leaves its data unchanged (idempotent service), so the next weekly run naturally retries. No bespoke DLQ beyond BullMQ's `removeOnFail`/`attempts` defaults.
