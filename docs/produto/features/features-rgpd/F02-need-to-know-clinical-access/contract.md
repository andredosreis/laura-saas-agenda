# F02 — Need-to-Know Clinical Access Control · Contract (GWT)

> Consolidated 2026-07-19 with [../RECONCILIATION.md](../RECONCILIATION.md) R1 (pointer corrected), R2 and R4 — the previous version of this contract still encoded the pre-reconciliation architecture (clinical fields on the base read).

## C1 — Base detail read never serves clinical fields (any role)
- **GIVEN** a token of **any** role (`recepcionista`, `terapeuta`, `gerente`, `admin`) and a client in the tenant
- **WHEN** `GET /api/v1/clientes/:id`
- **THEN** it returns 200 with the base record and **every** `CLINICAL_FIELDS` key absent from `data` (verified server-side, not just hidden in UI — R2)
- **AND** no `AcessoClinicoLog` entry is written.

## C2 — `/clinico` serves clinical + consent state and produces exactly one audit entry
- **GIVEN** an `admin`/`gerente`/`terapeuta` token and a client in the tenant whose `dados_saude` state is `granted` or `pendente`
- **WHEN** `GET /api/v1/clientes/:id/clinico`
- **THEN** it returns 200 with the `CLINICAL_FIELDS` block **and** `consentimentoSaude: { estado, data }` (from the F01 `estadoAtual` helper — R3)
- **AND** exactly one `AcessoClinicoLog` entry exists for that `{ clienteId, userId }` (`origem: 'ficha_clinica'`, `ip` set).

## C2b — `recepcionista` is denied on `/clinico`
- **GIVEN** a `recepcionista` token
- **WHEN** `GET /api/v1/clientes/:id/clinico`
- **THEN** it returns 403 (role-based, per the error-code table)
- **AND** no `AcessoClinicoLog` entry is written.

## C2c — Withdrawn consent blocks clinical serving and writes (R4)
- **GIVEN** a permitted token and a client whose latest `dados_saude` entry is `withdrawn`
- **WHEN** `GET /api/v1/clientes/:id/clinico`
- **THEN** it returns 200 with **only** `consentimentoSaude: { estado: 'withdrawn', data }` — zero `CLINICAL_FIELDS` keys for every role
- **AND** the `AcessoClinicoLog` entry is still written (the read attempt is meaningful)
- **AND WHEN** a panel update writes any anamnese field for that client, **THEN** it returns 400 with a clear message (blocked until a new F04 grant or F07 erasure). A `pendente` state does **not** block reads or writes (legacy data).

## C3 — List never exposes clinical fields
- **GIVEN** any authenticated role
- **WHEN** `GET /api/v1/clientes`
- **THEN** every item omits all `CLINICAL_FIELDS` (list minimization)
- **AND** no `AcessoClinicoLog` entries are written for the list read.

## C4 — AI paths return no clinical data (R1)
- **GIVEN** a valid `X-Service-Token`
- **WHEN** any `GET /api/internal/clientes/*` endpoint returns a client
- **THEN** the payload contains zero `CLINICAL_FIELDS` keys (nothing anamnesis-related is ever sent toward `ia-service`).
- **AND** the direct `db.clientes` read in `ia-service/src/ia_service/services/client_orchestrator.py` (~line 287) projects no clinical field (today `{_id, observacoes}`), asserted by a regression test in the ia-service pytest suite. *(`mongo_reader.py` has no `Cliente` read — pointer corrected 2026-07-19.)*

## C5 — Read audit is append-only
- **GIVEN** an existing `AcessoClinicoLog` entry
- **WHEN** any update/delete is attempted via the API
- **THEN** no such route exists (404/405) and the entry is never modified (`updatedAt` is not tracked); the only write path is `statics.record()`.

## C6 — Superadmin bypass
- **GIVEN** a `superadmin` token
- **WHEN** `GET /api/v1/clientes/:id/clinico`
- **THEN** clinical fields are present (superadmin bypasses the role gate, as with `authorize`), subject to the same R4 withdrawn rule as every role.

## C7 — Tenant isolation
- **GIVEN** a Tenant B token
- **WHEN** `GET /api/v1/clientes/:id` or `GET /api/v1/clientes/:id/clinico` for a Tenant A client
- **THEN** both return 404 (never 403), write no `AcessoClinicoLog`, and Tenant A's audit entries are never returned to Tenant B.

## C8 — Audit failure does not break the read
- **GIVEN** a permitted role and an `AcessoClinicoLog.record()` that fails
- **WHEN** `GET /api/v1/clientes/:id/clinico`
- **THEN** the read still returns 200 with the clinical fields and the failure is logged (best-effort audit, R9).

## C9 — Bounded retention
- **GIVEN** the `AcessoClinicoLog` collection
- **WHEN** its indexes are inspected
- **THEN** a TTL index on `createdAt` (~12 months) exists, so entries expire automatically without any delete route (preserving C5).

## Prerequisites (the evaluator must ensure these exist)
- `mongodb-memory-server` test environment (no replica set / transactions needed for F02; note `mongodb-memory-server` does not enforce TTL expiry in real time — C9 verifies index presence, not live deletion).
- **F01 in place** (functional dependency since R2/R3): the `ConsentLog` model and the `estadoAtual` helper that `/clinico` uses for `consentimentoSaude`. Seed `dados_saude` entries to produce the `granted`/`pendente`/`withdrawn` states for C2/C2c.
- Seeded `Cliente` documents in the acting tenant with the anamnese block populated; JWT/auth test helper for roles (`admin`, `gerente`, `terapeuta`, `recepcionista`, `superadmin`) and an `X-Service-Token` helper for the internal path.
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
- `clinicalFields.js` `CLINICAL_FIELDS` available to tests as the assertion source of truth.
