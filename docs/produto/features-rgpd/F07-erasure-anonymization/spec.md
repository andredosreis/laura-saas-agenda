# F07 — Data Subject Erasure & Anonymization — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F07)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extends F01) + `src/models/Cliente.js` (new fields) — backend, tenant-scoped
**Depends on:** F01 (Consent Logging Foundation — `gdpr` module scaffolding, `ConsentLog` model + `ConsentLog.record()`)

---

## 1. Scope

**Included:**
- New `Cliente` fields (tenant DB): `anonimizado` (bool), `pendingDeletion` (bool), `deletionRequestedAt` (date).
- New reusable service `src/modules/gdpr/gdprService.js` exporting **`anonimizarCliente(models, tenantId, clienteId)`** — replaces PII + ALL clinical/anamnese fields with anonymized tokens/empty, sets `anonimizado = true`, and **preserves financial records** (`Transacao`/`Pagamento`) de-identified (fiscal retention overrides erasure).
- `POST /gdpr/clientes/:id/apagar` (admin only) — registers an erasure request: marks `pendingDeletion`/`deletionRequestedAt` and writes a `ConsentLog (accao: 'withdrawn')` entry. On explicit admin confirmation (`confirmar: true`), runs `anonimizarCliente` **immediately**.
- Extends the existing `gdpr` module from F01 (controller + routes + Zod schemas); the route is mounted via the F01 `['/gdpr', gdprRoutes]` entry already in `apiResources` (dual-mount `/api` + `/api/v1`), behind `authenticate`, tenant-scoped.

**Provides (to later features):**
- `anonimizarCliente(models, tenantId, clienteId)` — the anonymization service consumed by **F08** (Automated Retention Anonymization) to anonymize retention-expired and grace-elapsed clients.

**Deferred (other features):**
- The **weekly BullMQ job** that processes path (b) — clients with `pendingDeletion = true` whose grace period elapsed, plus retention-expired clients — is **F08**. F07 only stamps `pendingDeletion`/`deletionRequestedAt` and exposes the service; it never schedules a job.
- Frontend "Apagar cliente" confirmation UI is out of scope for this backend feature.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/Cliente.js` | edit | Add `anonimizado` (Boolean, default false), `pendingDeletion` (Boolean, default false), `deletionRequestedAt` (Date, default null). |
| `src/modules/gdpr/gdprService.js` | new | `anonimizarCliente(models, tenantId, clienteId)` — single write point for anonymization; idempotent; preserves fiscal records. **Provided to F08.** |
| `src/modules/gdpr/gdprConfig.js` | new | `export const GRACE_PERIOD_DAYS = 30` (configurable default grace period; consumed by F08). `[Auto-Accept]` |
| `src/modules/gdpr/gdprController.js` | edit | Add `apagarCliente` (request erasure: validate client, write `ConsentLog withdrawn`, mark fields or anonymize immediately on `confirmar`). |
| `src/modules/gdpr/gdprRoutes.js` | edit | Add `POST /clientes/:id/apagar` with `authorize('admin')` + `validate`. |
| `src/modules/gdpr/gdprSchemas.js` | edit | Add `apagarClienteSchema` (body: `{ confirmar?: boolean }`). |
| `tests/gdpr-erasure.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server). |

Pattern references: `src/models/Cliente.js` (PII + clinical/anamnese fields), `src/models/{Transacao,Pagamento}.js` (fiscal — preserved), `src/models/ConsentLog.js` + `ConsentLog.record()` (from F01), `src/modules/gdpr/` (F01 module to extend), `src/middlewares/auth.js` (`authenticate`/`authorize`), `src/middlewares/validate.js`.

---

## 3. Data Model — `Cliente` additions (tenant DB)

```js
// appended to clienteSchema in src/models/Cliente.js
anonimizado:         { type: Boolean, default: false },
pendingDeletion:     { type: Boolean, default: false },
deletionRequestedAt: { type: Date,    default: null  },
```

- No new index required for F07 reads (lookup is by `_id` + `tenantId`). F08 will add `{ tenantId, pendingDeletion, deletionRequestedAt }` when it queries grace-elapsed clients — out of scope here.
- All three default to a "not requested / not anonymized" state for existing documents; no backfill migration needed.

**Fields anonymized by `anonimizarCliente` (PII + clinical):**
- PII: `nome` → `'[anonimizado]'`, `telefone` → `'ANON-<clienteId>'` (preserves `{tenantId, telefone}` unique index), `email` → `null` (sparse unique), `dataNascimento` → `null`, `observacoes` → `''`.
- Clinical/anamnese (all fields in the `--- CAMPOS DA FICHA DE ANAMNESE ---` block): string fields → `''`, boolean fields → `false`, enum strings → `''`. Also clears `historicoMensagens` (free-text conversation history holds PII).
- Flags: `anonimizado = true`. (`pendingDeletion` cleared to `false`, `deletionRequestedAt` left as-is for audit.)

**Preserved (fiscal — never anonymized/hard-deleted):**
- `Transacao` documents: kept as-is. `Transacao.cliente` is a plain ObjectId ref → automatically de-identified because the referenced `Cliente` is now anonymized. Amounts, dates and references retained for fiscal retention.
- `Pagamento` documents: kept. Embedded direct PII `dadosMBWay.telefone` is scrubbed (set to `''`/undefined) — `[Auto-Accept]`; amounts/dates/references retained.

---

## 4. API Contracts

Mounted at `/api/gdpr` and `/api/v1/gdpr` (via the F01 `gdpr` router); requires `authenticate`. Tenant context via `req.tenantId` / `req.models`.

### POST /gdpr/clientes/:id/apagar — request erasure (admin only)
- `authorize('admin')` (PRD: "the action bundles/affects clinical data" — admin only; `superadmin` bypasses).
- `:id` validated as ObjectId; client must exist in `req.tenantId`.

Request body (optional):
```json
{ "confirmar": false }
```
- `confirmar: false` (default) → **path (b)**: set `pendingDeletion = true`, `deletionRequestedAt = now`, write `ConsentLog (accao: 'withdrawn')`. Anonymization happens later via F08 after the grace period.
- `confirmar: true` → **path (a)**: write `ConsentLog (accao: 'withdrawn')`, then run `anonimizarCliente` **immediately** (erasure works without F08).

Response `200`:
```json
{ "success": true, "data": {
  "_id": "665...", "anonimizado": true,
  "pendingDeletion": false, "deletionRequestedAt": "2026-06-26T..."
} }
```
- For path (b) the same shape returns `anonimizado: false`, `pendingDeletion: true`.

**Notes**
- Server derives `tenantId`/`registadoPor`/`ip` for the `ConsentLog` (never from body), reusing F01's `ConsentLog.record()`.
- The withdrawal entry uses `tipo: 'politica_privacidade'` and `origem: 'painel'` (`[Auto-Accept]`).

---

## 5. Requirements / Business Rules

- **R1.** `POST /gdpr/clientes/:id/apagar` always writes exactly one `ConsentLog (accao: 'withdrawn')` entry (immutable, via F01 `record()`).
- **R2.** Path (b) — without `confirmar`: sets `pendingDeletion = true` and `deletionRequestedAt = now`; does **not** anonymize. The F08 job (deferred) completes it after `GRACE_PERIOD_DAYS`.
- **R3.** Path (a) — `confirmar: true`: anonymizes immediately via `anonimizarCliente`; erasure does not depend on F08.
- **R4.** `anonimizarCliente(models, tenantId, clienteId)` replaces all PII + clinical/anamnese fields with anonymized tokens/empty and sets `anonimizado = true`. It is the single write point and is **idempotent** (already-anonymized client → no-op, no duplicate work).
- **R5.** `telefone` is set to a per-client unique token (`ANON-<clienteId>`) so the `{tenantId, telefone}` unique index is never violated; `email` is set to `null` (sparse unique).
- **R6.** Fiscal records (`Transacao`, `Pagamento`) are **never hard-deleted** and **never lose fiscal data** (amounts/dates/references); they are de-identified via the anonymized `Cliente` ref (+ scrubbing embedded `dadosMBWay.telefone`). Fiscal retention overrides erasure.
- **R7.** The client must exist within `req.tenantId`; otherwise 404 (cross-tenant client also → 404, never 403). Invalid ObjectId → 400.
- **R8.** Erasure request/anonymization is restricted to `admin` (`superadmin` bypasses via `authorize`); other roles → 403.
- **R9.** `anonimizarCliente` operates only on tenant-scoped queries (`{ _id, tenantId }`); it never touches another tenant's data.

**UX flow:** triggered from the client record ("Apagar cliente" → confirm). F07 is the backend; the panel button/modal is deferred. Cross-tenant access returns 404.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Invalid ObjectId in `:id` | 400 | `{ success:false, error:'ID inválido' }` |
| Client not found in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| `apagar` by non-admin role | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| Attempt to hard-delete fiscal data | n/a | Not exposed — only anonymization of PII is performed; fiscal records retained. |
| No token / invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

---

## 7. Testing Strategy

`tests/gdpr-erasure.test.js` (Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F07):**
- `requesting erasure sets pendingDeletion/deletionRequestedAt and writes a ConsentLog (withdrawn)` — `POST .../apagar` (no `confirmar`) → 200, flags set, exactly one `withdrawn` entry appended.
- `on explicit admin confirmation, anonymization runs immediately` — `confirmar: true` → `anonimizado = true`, PII + clinical fields cleared.
- `anonymization replaces PII and clinical fields and sets anonimizado = true` — assert `nome`, `telefone` (now `ANON-<id>`), `email` (null), `dataNascimento` (null), and every anamnese field cleared.
- `Transacao/Pagamento records are preserved (de-identified)` — seed fiscal docs; after anonymize they still exist with amounts/dates intact; `Pagamento.dadosMBWay.telefone` scrubbed.
- `a hard-delete of fiscal data is never performed` — fiscal counts unchanged after anonymize.
- `invalid id → 400` and `unknown client → 404`.

**Service-level (`anonimizarCliente`):**
- `is idempotent` — calling twice does not error and leaves a single anonymized state.
- `respects the unique telefone index` — two anonymized clients in the same tenant get distinct `ANON-<id>` tokens; no duplicate-key error.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot request erasure of Tenant A's client` → 404 (never 403), no entry written.
- `anonimizarCliente never anonymizes a client from another tenant` (wrong `tenantId` → no-op/404-equivalent).
- `recepcionista/gerente/terapeuta are blocked from POST .../apagar` → 403; `admin` allowed.

**Cross-feature note (verified in F08):** F08 consumes `anonimizarCliente` and the `pendingDeletion`/`deletionRequestedAt` flags to complete grace-elapsed erasures and retention anonymization. Not tested in F07.

---

## 8. Assumptions / Decisions

- **`[Auto-Accept]` Erasure endpoint role = `admin` only.** PRD F07 says "authenticated, admin"; the action affects clinical data, so `authorize('admin')` (not `gerente`). `superadmin` bypasses.
- **`[Auto-Accept]` Two-path trigger = `confirmar` boolean in body.** PRD describes "explicit admin confirmation" (immediate) vs default grace path but doesn't name the parameter. Chosen: `{ confirmar?: boolean }`, default `false` → grace path; `true` → immediate `anonimizarCliente`.
- **`[Auto-Accept]` Anonymization token format.** `nome = '[anonimizado]'`, `telefone = 'ANON-<clienteId>'` (per-client unique to satisfy `{tenantId, telefone}` index), `email = null`, `dataNascimento = null`, clinical strings → `''`, clinical booleans → `false`, `historicoMensagens` cleared. Chosen for human-readable, collision-free, index-safe tokens.
- **`[Auto-Accept]` Grace-period config location.** `GRACE_PERIOD_DAYS = 30` lives in `src/modules/gdpr/gdprConfig.js` (module-level constant, consumed by F08). The per-tenant retention/grace override belongs to F08 (`Tenant.configuracoes`), so F07 only stamps `deletionRequestedAt` and does not evaluate elapsed time.
- **`[Auto-Accept]` No DB transaction for the erasure request.** Mirrors F01's "no replica set / transactions needed" stance for `mongodb-memory-server`. Ordering: append `ConsentLog (withdrawn)` first (audit guaranteed), then mark/anonymize. `anonimizarCliente` is a single-document `Cliente` update + idempotent, so atomicity across documents is not required.
- **`[Auto-Accept]` Fiscal de-identification depth.** `Transacao`/`Pagamento` are preserved with all fiscal fields. `Transacao.cliente` (ObjectId ref) is de-identified automatically via the anonymized `Cliente`. Embedded direct PII `Pagamento.dadosMBWay.telefone` is scrubbed (no longer needed post-payment); amounts/dates/references retained for tax-retention law.
- **`[Auto-Accept]` Idempotency over conflict.** Re-running erasure on an already-`anonimizado` client returns `200` with current state and does **not** append a second `withdrawn` entry nor re-scrub — chosen over `409` to keep the operation safe to retry (and safe for the F08 job to reuse).
- **`[Auto-Accept]` Withdrawal entry `tipo`/`origem`.** The `ConsentLog (withdrawn)` written on erasure uses `tipo: 'politica_privacidade'`, `origem: 'painel'` (admin-initiated from the panel), reusing F01's enums.
