# F05 — Audited Mutation Foundation · Contract (GWT)

## C1 — Atomic success
- **GIVEN** a handler wrapped by `adminMutation('x.do', work)` where `work` updates a control-plane document
- **WHEN** a super-admin calls it successfully
- **THEN** the document change is committed AND exactly one `AuditLog` entry exists with `status: 'ok'`, `action: 'x.do'` and the actor's id
- **AND** the finish-middleware does NOT write a second (duplicate) entry.

## C2 — Atomic failure (work throws)
- **GIVEN** a wrapped mutation whose `work` throws
- **WHEN** it is called
- **THEN** no control-plane change is committed
- **AND** exactly one best-effort `AuditLog` entry with `status: 'error'` exists
- **AND** the request ends via the error middleware (non-2xx).

## C3 — Audit-failure rollback (atomicity)
- **GIVEN** a wrapped mutation where the `AuditLog` write inside the transaction fails
- **WHEN** it is called
- **THEN** the control-plane change is rolled back (not committed)
- **AND** the request ends in error.

## C4 — Structural enforcement (lint gate)
- **GIVEN** `src/modules/admin/`
- **WHEN** a raw `router.post/put/patch/delete(...)` is added (bypassing `adminMutation`)
- **THEN** `npm run lint` fails with the Gate 4 `no-restricted-syntax` error.

## C5 — Control-plane only
- **GIVEN** `adminMutation`
- **WHEN** `work` is implemented
- **THEN** it mutates only the shared `laura-saas` control plane (Tenant/User/UserSubscription); it does not write to a `tenant_<id>` database.

## Prerequisites (the evaluator must ensure these exist)
- A `MongoMemoryReplSet`-backed test environment (transactions require a replica set).
- The `AuditLog` model and `auditMiddleware` (F01) present.
