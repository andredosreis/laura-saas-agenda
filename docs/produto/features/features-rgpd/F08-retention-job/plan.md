# F08 — Automated Retention Anonymization — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 4

## Prerequisites
- **F07 implemented and merged** — `src/modules/gdpr/gdprService.js` exporting `anonimizarCliente(models, tenantId, clienteId)`, `src/modules/gdpr/gdprConfig.js` exporting `GRACE_PERIOD_DAYS`, and `Cliente` fields `anonimizado` / `pendingDeletion` / `deletionRequestedAt`.
- Patterns confirmed: `src/jobs/lembreteParcelaJob.js` (per-tenant iteration, `Promise.allSettled`, env-guarded scheduling, structured logging), `src/queues/notificationQueue.js` + `redisConnection.js` (BullMQ + lazy Redis), `src/workers/notificationWorker.js` (worker idiom + graceful Redis-absent), `src/config/tenantDB.js` + `src/models/registry.js` (tenant DB/models), `src/models/Tenant.js` (`configuracoes` block, `Tenant.find({ ativo })`).
- Project running locally (backend per `CLAUDE.md` → Environment). Redis optional for tests.

## Phase 1 — Config & index
1. **Tenant retention config** — Add `retencaoMeses: { type: Number, default: 24 }` to `configuracoes` in `src/models/Tenant.js`.
2. **Cliente index** — Add `clienteSchema.index({ tenantId: 1, anonimizado: 1, pendingDeletion: 1, deletionRequestedAt: 1 })` in `src/models/Cliente.js` (supports both candidate queries; F07 deferred this index to F08).

## Phase 2 — Core routine (the testable heart)
3. **Job logic** — Create `src/jobs/retentionAnonymizationJob.js`:
   - `processarTenantRetencao(tenant)` — resolve `getModels(getTenantDB(tenant._id))`; read `retencaoMeses` (default 24); compute cutoffs with Luxon (Europe/Lisbon).
     - **Set (a) retention:** find non-anonymized clients whose last activity (latest of most-recent `Agendamento.dataHora`, most-recent `Transacao.createdAt`, else `Cliente.createdAt`) is older than `now − retencaoMeses`.
     - **Set (b) grace:** find non-anonymized clients with `pendingDeletion === true` and `deletionRequestedAt <= now − GRACE_PERIOD_DAYS`.
     - Anonymize each via F07's `anonimizarCliente(models, tenant._id, clienteId)` with `Promise.all` (per-client errors caught → `falhados`).
     - Return `{ tenantId, anonimizadosRetencao, anonimizadosGraca, falhados }`.
   - `executarRetencao()` — `Tenant.find({ ativo: { $ne: false } })` on shared DB; process in **bounded chunks** (concurrency from `GDPR_RETENTION_CONCURRENCY`, default 5) with `Promise.allSettled`; aggregate + log summary split by reason; never throw out (top-level try/catch).

## Phase 3 — BullMQ wiring & bootstrap
4. **Queue + scheduler** — Create `src/queues/retentionQueue.js`: `getRetentionQueue()` (lazy `Queue('gdpr-retention')` on `getRedisConnection()`) and `scheduleRetentionJob()` registering the **repeatable** job (cron from `GDPR_RETENTION_CRON_SCHEDULE` default `0 3 * * 1`, tz Europe/Lisbon; skip when `GDPR_RETENTION_CRON=off` or Redis absent). Mirror `notificationQueue.js`.
5. **Worker** — Create `src/workers/retentionWorker.js`: `startRetentionWorker()` → `Worker('gdpr-retention', () => executarRetencao(), { concurrency: 1 })`; graceful `null` + warn when Redis absent; `completed`/`failed` log handlers. Mirror `notificationWorker.js`.
6. **Bootstrap** — In `src/server.js`, after `startLembreteParcelaCron()`, call `startRetentionWorker()` and `scheduleRetentionJob()`.

## Phase 4 — Tests & gates
7. **Tests** — Create `tests/gdpr-retention.test.js` (Jest ESM + `mongodb-memory-server`; WhatsApp/OpenAI/email mocked). Drive `processarTenantRetencao`/`executarRetencao` directly (no Redis). Cover: retention default 24 + per-tenant override; grace elapsed vs within-grace; fiscal preserved; counts split by reason; per-tenant failure isolation; idempotency on re-run; no-activity → `createdAt` fallback; multi-tenant isolation across DBs. (See spec §7.)
8. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
