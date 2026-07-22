# F01 — Standardized Loss Reasons Foundation · Contract (GWT)

> Derived from `docs/produto/PRD-recuperacao-leads.md` §9 (F01 acceptance criteria) and the two Cross-Feature Integration rows where F01 is the provider (F02 ← F01).

## C1 — Kanban confirm disabled with no reason selected
- **GIVEN** the "Perdido" modal is open for a dragged lead and no reason button has been tapped
- **WHEN** the user looks at the confirm button
- **THEN** it is disabled and no `PATCH /leads/:id/stage` request is sent.

## C2 — "Outro" requires a note (UI)
- **GIVEN** the "Perdido" modal with "Outro" selected and the note field empty
- **WHEN** the user attempts to confirm
- **THEN** an inline validation error is shown and confirmation is blocked — no request is sent.

## C3 — API rejects missing `motivoCodigo`
- **GIVEN** an authenticated user with `editarLeads` and a lead in an active stage
- **WHEN** `PATCH /api/v1/leads/:id/stage` is sent with `{ stage: 'perdido' }` (no `motivoCodigo`)
- **THEN** it returns 400 with the standard error envelope (`code: 'motivo_required'`) and the lead's `status` is unchanged.

## C4 — API rejects out-of-enum `motivoCodigo`
- **GIVEN** the same setup as C3
- **WHEN** `PATCH .../stage` is sent with `{ stage: 'perdido', motivoCodigo: 'inexistente' }`
- **THEN** it returns 400 and the lead's `status` is unchanged.

## C5 — API rejects `motivoCodigo: 'outro'` without a note
- **GIVEN** the same setup as C3
- **WHEN** `PATCH .../stage` is sent with `{ stage: 'perdido', motivoCodigo: 'outro' }` (no `motivo`)
- **THEN** it returns 400 and the lead's `status` is unchanged.

## C6 — Valid `motivoCodigo` persists the full loss record
- **GIVEN** the same setup as C3
- **WHEN** `PATCH .../stage` is sent with `{ stage: 'perdido', motivoCodigo: 'preco', motivo: 'Achou caro' }`
- **THEN** it returns 200 with `perdido.motivoCodigo === 'preco'`, `perdido.motivo === 'Achou caro'`, and a server-set `perdido.em` timestamp
- **AND** a valid `motivoCodigo` other than `'outro'` persists successfully even when `motivo` is omitted.

## C7 — Legacy lost lead without `motivoCodigo` stays valid (schema not required)
- **GIVEN** a `Lead` document seeded directly with `status: 'perdido'`, `perdido.motivo` set, and no `perdido.motivoCodigo`
- **WHEN** the document is loaded and re-saved (e.g., via an unrelated field update)
- **THEN** no Mongoose validation error occurs — the document loads and saves exactly as before this feature.

## C8 — Both new indexes exist after model load
- **GIVEN** the `Lead` model is loaded
- **WHEN** `Lead.collection.getIndexes()` is inspected
- **THEN** an index covering `{ tenantId: 1, createdAt: -1 }` and an index covering `{ tenantId: 1, 'perdido.motivoCodigo': 1 }` are both present, alongside the three pre-existing indexes (none removed).

## C9 — Backfill: dry-run, apply, and idempotency
- **GIVEN** a tenant DB with legacy `status: 'perdido'` leads — some with free-text `perdido.motivo`, some with the literal `'sem motivo'`, none with `motivoCodigo`
- **WHEN** the backfill script runs with no flag (default)
- **THEN** it prints the target cluster and per-tenant counts and writes nothing
- **AND WHEN** it runs with `--apply`
- **THEN** free-text leads get `motivoCodigo: 'outro'` with the text preserved as the note, and `'sem motivo'` leads get `motivoCodigo: 'outro'` with the note cleared to `null`
- **AND WHEN** `--apply` is run a second time
- **THEN** it modifies 0 documents (every candidate already carries `motivoCodigo`).

## C10 — Tenant isolation on the changed validation path
- **GIVEN** a Tenant B token and a lead belonging to Tenant A
- **WHEN** `PATCH /api/v1/leads/:id/stage` is sent with a valid `{ stage: 'perdido', motivoCodigo: 'preco' }` body against Tenant A's lead id
- **THEN** it returns 404 (never 403) and Tenant A's lead is unmodified.

## C11 — Provider contract: F02 can read `motivoCodigo` + note per tenant+reason (Cross-Feature, F02 ← F01)
- **GIVEN** a lead marked lost via the Kanban with `motivoCodigo: 'preco'` and a note
- **WHEN** the `Lead` collection is queried filtering `{ tenantId, 'perdido.motivoCodigo': 'preco' }` (the shape F02's `porMotivo` aggregation will use)
- **THEN** the lead is returned with its `motivoCodigo` and note intact, backed by the `{tenantId,'perdido.motivoCodigo'}` index from C8 — this is the foundation F02 builds its per-reason breakdown on.

## C12 — Provider contract: `recuperacao.contactadoEm` is a queryable, unconstrained field (Cross-Feature, F02 ← F01)
- **GIVEN** a `Lead` document updated directly with `recuperacao.contactadoEm` set to a `Date` (simulating what F05's future `PATCH /:id/recuperacao` will do)
- **WHEN** the document is read back and queried filtering `{ tenantId, 'recuperacao.contactadoEm': { $gte: <30 days ago> } }` (the shape F02's 30-day exclusion rule will use)
- **THEN** the field persists and is queryable exactly as written — no F01 validation or default blocks a partial write to only this field, confirming the schema is ready for F02/F05 to build on.

## Prerequisites (the evaluator must ensure these exist)
- `mongodb-memory-server` test environment (no replica set / transactions needed for F01).
- A seeded `Lead` per tenant in an active stage (`novo`/`em_conversa`/`qualificado`/`agendado`) for the `moveStage` tests; JWT/auth test helper for roles (`admin`, `recepcionista` with `editarLeads`).
- No external services to mock for F01 (no OpenAI/Evolution/email calls on this path).
- The backfill script must be invocable as a plain function (not only as a CLI subprocess) so C9 can be exercised directly against `mongodb-memory-server` in Jest.
