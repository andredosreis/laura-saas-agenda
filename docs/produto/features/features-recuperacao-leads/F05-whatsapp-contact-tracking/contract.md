# F05 — WhatsApp Action & Contact Tracking · Contract (GWT)

> Derived from PRD-recuperacao-leads.md §9 (F05 acceptance criteria) + Cross-Feature Integration (F05 ← F02) + the F02-exclusion dependency on the `contactadoEm` field this feature writes.

## C1 — Phone normalization drives the WhatsApp button (E.164 rule)
- **GIVEN** a lead row with digits-only phone `912345678`
- **WHEN** the recovery list renders its "Chamar no WhatsApp" button
- **THEN** the button links to `https://wa.me/351912345678?text=<encoded default message>`
- **AND GIVEN** a lead with phone `5511987654321` (already carries a country code), the link uses it as-is: `https://wa.me/5511987654321?text=...`
- **AND GIVEN** a lead with an unnormalizable phone (e.g. a 7-digit value), the button is rendered `disabled` with tooltip/`title` `"Número sem indicativo — verificar na ficha"` and opens nothing when clicked.

## C2 — Suggested message is editable and URL-encoded
- **GIVEN** the WhatsApp popover open with the default suggested message
- **WHEN** the user edits the text before confirming
- **THEN** the edited text — not the original default — is URL-encoded into the `wa.me` link's `?text=` parameter (including accented characters, verified round-trip on decode).

## C3 — WhatsApp opens in a new tab, never navigating the list away
- **GIVEN** a normalizable phone and a confirmed (possibly edited) message
- **WHEN** "Chamar no WhatsApp" is triggered
- **THEN** the `wa.me` link opens in a new browser tab and the recovery list page remains open and interactive underneath.

## C4 — Marking as contacted: PATCH, server-derived fields, optimistic UI
- **GIVEN** a lead with no prior `recuperacao.contactadoEm` and an authenticated user with `verLeads`
- **WHEN** the user picks an outcome (default `pendente`) after "Marcar como contactado?"
- **THEN** `PATCH /api/v1/leads/:id/recuperacao` is sent with `{ resultado }` only (no `contactadoEm`/`contactadoPor` in the body)
- **AND** the server response carries `recuperacao.contactadoEm` set to the current time and `recuperacao.contactadoPor` set to the acting user's id — values the client never supplied
- **AND** the row is removed from the visible list immediately (optimistic), with a 5 s "Desfazer" (undo) toast shown.

## C5 — PATCH failure rolls back the optimistic removal
- **GIVEN** the optimistic removal from C4 has happened
- **WHEN** the underlying PATCH request fails (network error, 500, etc.)
- **THEN** the row is restored to the visible list and an error toast is shown — the list never silently loses a row that wasn't actually recorded server-side.

## C6 — Invalid `resultado` is rejected
- **GIVEN** a valid lead id in the caller's tenant
- **WHEN** `PATCH /api/v1/leads/:id/recuperacao` is sent with `{ resultado: 'foo' }`
- **THEN** it returns 400 naming the allowed values, and no field on the lead is modified.

## C7 — Mass-assignment attempt is rejected
- **GIVEN** a body that also includes `contactadoEm` and/or `contactadoPor` (e.g. `{ resultado: 'pendente', contactadoEm: '2000-01-01' }`)
- **WHEN** `PATCH /api/v1/leads/:id/recuperacao`
- **THEN** it returns 400 (unrecognized key) and creates/modifies no field — the server-derived values are never influenced by the body, confirmed by re-fetching the lead unchanged.

## C8 — Cross-tenant PATCH → 404, never 403
- **GIVEN** a Tenant B token and a lead id belonging to Tenant A
- **WHEN** `PATCH /api/v1/leads/:id/recuperacao`
- **THEN** it returns 404 and the Tenant A lead's `recuperacao` fields are unchanged (never 403 — do not reveal the lead's existence).

## C9 — Invalid ObjectId → 400
- **GIVEN** a syntactically invalid `:id` (not a 24-char hex ObjectId)
- **WHEN** `PATCH /api/v1/leads/:id/recuperacao`
- **THEN** it returns 400 `{ error: 'ID inválido' }` before any database query.

## C10 — Outcome re-edit during cool-off does NOT reset `contactadoEm`/`contactadoPor` (the key nuance)
- **GIVEN** a lead already marked contacted (`recuperacao.contactadoEm` set from a prior PATCH, e.g. 10 days ago, `resultado: 'pendente'`)
- **WHEN** `PATCH /api/v1/leads/:id/recuperacao` is sent again with `{ resultado: 'reagendou' }`
- **THEN** it returns 200, `recuperacao.resultado` is now `'reagendou'`
- **AND** `recuperacao.contactadoEm` and `recuperacao.contactadoPor` are **byte-identical** to their values before this second call — the cool-off clock does not restart just because the outcome was corrected.

## C11 — F05 ← F02: the phone used for the link is F02's digits-only row value, normalized
- **GIVEN** a recovery list row as returned by F02's `GET /api/v1/leads/recuperacao` (digits-only `telefone`)
- **WHEN** F05's action component builds the `wa.me` link for that row
- **THEN** the E.164 value used is `normalizeToE164(row.telefone)` applied to exactly the value F02 returned — no re-fetch, re-derivation, or alternate phone source.

## C12 — F05 → F02: a written `contactadoEm` is what F02's 30-day exclusion reads (integration boundary, verified from F05's side)
- **GIVEN** a lead successfully marked contacted via F05's PATCH (C4), with `recuperacao.contactadoEm` now set to "now"
- **WHEN** F02's report (or F03's CSV, same filters) is queried immediately after
- **THEN** that lead is absent from both, and remains absent until 30 days after the exact `contactadoEm` F05 wrote have elapsed — F05 does not implement this exclusion itself (owned by F02), but its write is the sole input the rule depends on, so this integration must hold end-to-end.

## Prerequisites (the evaluator must ensure these exist)
- **F01** merged: `Lead.recuperacao { contactadoEm, contactadoPor, resultado }` subdocument on the model, with the 5-value `resultado` enum.
- **F02** merged: `GET /api/v1/leads/recuperacao` implementing the 30-day `contactadoEm` exclusion rule (needed to verify C12 end-to-end; C1–C11 can be verified against F05 in isolation with a seeded `Lead` document).
- **F04** merged: `RecuperacaoLeads.tsx` page and route `/leads/recuperacao`, providing the mount point for `WhatsAppContactAction`.
- `mongodb-memory-server` test environment (backend); Vitest configured (frontend) — no replica set / transactions needed for this feature.
- JWT/auth test helpers for at least two tenants and a role/permission combination lacking `verLeads` (to verify the 403 case is exercised, even though it is not separately listed as a C above — covered by spec §7's backend test list).
- A seeded `Lead` per tenant, in an active stage, to exercise C4/C6–C10.
