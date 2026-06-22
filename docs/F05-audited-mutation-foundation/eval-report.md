# F05 — Audited Mutation Foundation · Eval Report

**Evaluated:** 2026-06-22
**Branch:** `F05-audited-mutation-foundation`
**Evaluator:** evaluator agent (deterministic, no UI involved — F05 exposes no HTTP endpoint of its own, per spec.md scope)

## Summary

**5 passed · 0 failed · 0 indeterminate**

| ID | Criterion | Result |
|---|---|---|
| C1 | Atomic success | ✅ passed |
| C2 | Atomic failure (work throws) | ✅ passed |
| C3 | Audit-failure rollback | ✅ passed |
| C4 | Structural enforcement (lint gate) | ✅ passed |
| C5 | Control-plane only | ✅ passed (by construction, see note) |

## Gates

### `npm run lint`

```
✖ 4 problems (0 errors, 4 warnings)
```

0 errors. The 4 warnings are pre-existing, in `scripts/maintenance/*.js` (unused `eslint-disable` directives) — untouched by F05, not a regression. **Gate: pass.**

### `npm test` (full suite)

```
Test Suites: 47 passed, 47 total
Tests:       369 passed, 369 total
```

All 47 suites pass, including the new `tests/admin-mutation.test.js` (3/3). No regressions in the other 369 pre-existing tests. **Gate: pass.**

## Contract verification (`contract.md`)

### C1 — Atomic success
**GIVEN** `adminMutation('tenant.suspend', work)` where `work` updates `Tenant.plano.status`
**WHEN** called successfully
**THEN** verified via `tests/admin-mutation.test.js` → `C1 — sucesso atómico`:
- `Tenant.plano.status` is `'suspenso'` after the request (commit happened).
- Exactly **one** `AuditLog` document exists, `status: 'ok'`, `action: 'tenant.suspend'`, `actorUserId` matches the JWT's `userId`, `targetTenantId` matches the tenant.
- No duplicate entry from `auditMiddleware`'s `finish` handler (`req.audit.committed` short-circuits it) — asserted via `AuditLog.find({})` length === 1.

**Result: passed.**

### C2 — Atomic failure (work throws)
**GIVEN** a wrapped mutation whose `work` mutates a document then throws
**WHEN** called, verified via `C2 — falha atómica`:
- `Tenant.plano.status` remains `'ativo'` (the in-transaction `tenant.save()` was rolled back by `session.withTransaction` aborting on the thrown error).
- Exactly one best-effort `AuditLog` entry, `status: 'error'`, `action: 'tenant.fail'`.
- `res.status` ≥ 400 (request ended via `errorHandler`, non-2xx).

**Result: passed.**

### C3 — Audit-failure rollback (atomicity)
**GIVEN** a wrapped mutation where the in-transaction `AuditLog.create([...], { session })` call itself throws (forced via `jest.spyOn(AuditLog, 'create').mockImplementationOnce`)
**WHEN** called, verified via `C3 — falha do AuditLog`:
- `Tenant.plano.status` remains `'ativo'` — the control-plane change is rolled back, proving the `AuditLog` write and the document write share the same transaction (not committed independently).
- Exactly one best-effort `status: 'error'` entry exists, written **outside** the aborted transaction (the mocked implementation only intercepts the first, in-transaction call; the catch-block's error-audit call falls through to the real implementation).

**Result: passed.**

### C4 — Structural enforcement (lint gate)
**GIVEN** `src/modules/admin/`
**WHEN** a raw `router.post(...)` is introduced
**THEN** re-verified by temporarily dropping a throwaway file into `src/modules/admin/__lintcheck.js` containing a raw `router.post('/x', ...)` and running `npx eslint` against it directly:

```
error  Em src/modules/admin/ nenhuma mutação usa router.post/put/patch/delete cru —
       passa pela factory adminMutation (audit transacional, Fase 3).
       no-restricted-syntax
```

The file was deleted immediately after the check (not committed). **Result: passed** — gate #9 (pre-existing, F01) still rejects raw mutation verbs; `adminMutation.js` itself contains no `router.<verb>` calls.

### C5 — Control-plane only
**GIVEN** `adminMutation`
**WHEN** `work` is implemented
**THEN**: `adminMutation` itself performs no DB I/O — all reads/writes happen inside the caller-supplied `work(req, { session })`, bound to the `session` from `mongoose.startSession()` on the **default connection** (`laura-saas`). Both test `work` implementations in `tests/admin-mutation.test.js` only touch `Tenant` (control-plane). The factory does not import or expose `getTenantDBAdmin`.

**Result: passed, by construction** — with one carried-over caveat already flagged in `spec.md` (not a new finding): nothing inside `adminMutation` itself *statically* prevents a future `work` from also calling `getTenantDBAdmin` (cross-tenant DB) — that surface is constrained by the **separate read-only Mongo connection/credential** behind `getTenantDBAdmin` (infra-level, proven in staging per spec's `[Flag]`, not asserted in CI here). This is an accepted, pre-existing scope boundary — F06/F07/F08 (concrete mutation endpoints) are where this would actually be exercised with a real attempt to write cross-tenant, and is out of scope for F05.

### Prerequisites (contract.md)
- ✅ `MongoMemoryReplSet`-backed test environment — added in `tests/admin-mutation.test.js` (own `beforeAll`/`afterAll`, isolated from the shared standalone `tests/setup.js`, as `spec.md`'s Testing Strategy requires).
- ✅ `AuditLog` model and `auditMiddleware` (F01) — pre-existing, reused unchanged (only additive `before`/`after` Mixed fields added to the schema, no breaking change).

## Files involved

- `src/modules/admin/adminMutation.js` (new)
- `src/models/AuditLog.js` (modified — added `before`/`after` fields)
- `tests/admin-mutation.test.js` (new)
- `docs/PRDProgress.json` (status update)

## Pending manual checks

None. No UI surface for F05 (factory only — no HTTP endpoint, per spec.md scope), so no screenshots are applicable. All 5 contract criteria were verified deterministically.

## Verdict

**F05 is DONE.** All gates green, all 5 contract criteria verified with evidence, no regressions across the 369-test suite.
