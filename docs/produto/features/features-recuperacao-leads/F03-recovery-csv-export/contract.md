# F03 — Recovery CSV Export · Contract (GWT)

> Source: `docs/produto/PRD-recuperacao-leads.md` §9 (F03 acceptance criteria) + Cross-Feature Integration (F03 ← F02). Design reference: `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` §6.2.

## C1 — BOM, separator, accents
- **GIVEN** any valid, authorized request to `GET /api/v1/leads/recuperacao/export.csv`
- **WHEN** the response is received
- **THEN** the body starts with the UTF-8 BOM (`EF BB BF`), fields are separated by `;`, and a lead name containing accented characters (e.g. `José Álvares`) renders correctly when the file is opened in Portuguese Excel.

## C2 — Formula-injection sanitization
- **GIVEN** a recoverable lead whose `nome` is `=HYPERLINK("http://x")`
- **WHEN** it is exported
- **THEN** the `Nome` cell is `'=HYPERLINK("http://x")` (leading `'` prefix) — never a raw formula
- **AND** the same prefixing applies to fields starting with `+`, `-`, `@`, TAB or CR.

## C3 — 5,000-row cap with explicit truncation signal
- **GIVEN** a filter set matching 5,001 recoverable leads
- **WHEN** exported
- **THEN** the body contains exactly 5,000 data rows and the response carries `X-Export-Truncated: true`
- **AND GIVEN** a filter set matching 4,999 recoverable leads, the response carries no `X-Export-Truncated` header at all (never present with value `false`).

## C4 — Filename with today's date
- **GIVEN** any successful export, regardless of the `de`/`ate` filter values used
- **WHEN** the response is received
- **THEN** `Content-Disposition` is `attachment; filename="recuperacao-leads-YYYY-MM-DD.csv"`, where the date is **today's** date computed in `Europe/Lisbon` (not derived from the filter range).

## C5 — Row set matches F02 for identical filters; `nao_e_lead` excluded
- **GIVEN** the same filter query string sent to both `GET /leads/recuperacao` (F02) and `GET /leads/recuperacao/export.csv` (F03)
- **WHEN** both responses are compared
- **THEN** the CSV's rows equal the F02 list's rows (modulo pagination and the 5,000 cap)
- **AND** no lead coded `motivoCodigo: 'nao_e_lead'` appears in the CSV under any filter combination.

## C6 — Malformed filter and missing permission fail as JSON, never as CSV
- **GIVEN** a malformed `de` query value (not a parseable date)
- **WHEN** `GET /api/v1/leads/recuperacao/export.csv?de=<malformed>`
- **THEN** it returns 400 with the standard JSON error envelope (`Content-Type: application/json`), not a CSV body
- **AND GIVEN** a valid request from a user without `verLeads`, it returns 403 with the standard JSON error envelope.

## C7 — Tenant isolation
- **GIVEN** a Tenant B token used to call the export endpoint with the exact filter values that would match Tenant A's leads
- **WHEN** the export runs
- **THEN** only Tenant B's leads appear in the CSV (Tenant A's rows never leak in; an empty CSV is valid, never a 403).

## C8 — Every export is logged
- **GIVEN** a successful export (truncated or not)
- **WHEN** the response is sent
- **THEN** exactly one log entry is written recording the acting user's id, the tenant id, the applied filters, and the resulting row count — a GDPR-relevant processing record.

## C9 — Empty result is a valid CSV, not an error
- **GIVEN** a filter set matching zero recoverable leads
- **WHEN** exported
- **THEN** the response is 200 with a CSV containing only the 12-column header row (BOM present, no data rows, no truncation header).

## Cross-Feature Integration — F03 ← F02
- **GIVEN** F02's `recuperacaoService.js` row derivation (cold-lead 14-day rule, `convertido` exclusion, `nao_e_lead` exclusion, 30-day contacted cool-off exclusion) for a given filter set
- **WHEN** F03 exports the same filter set
- **THEN** the CSV row set is identical to what F02 would list for those filters (up to the 5,000 cap) — F03 never re-implements or diverges from F02's derivation logic; it only serializes the rows F02's service already computed.

## Prerequisites (the evaluator must ensure these exist)
- F01 merged: `Lead.perdido.motivoCodigo`, `Lead.recuperacao.{contactadoEm,contactadoPor,resultado}`, `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES`.
- F02 merged: `GET /api/v1/leads/recuperacao` functional; `recuperacaoService.js` importable and reusable by F03 without pagination clamping (see spec §8 A1).
- `mongodb-memory-server` test environment (no replica set / transactions needed).
- A seeded set of recoverable (`perdido`/derived-cold) leads per tenant, including at least one with a formula-injection-shaped `nome` and one coded `nao_e_lead`, for the sanitization and exclusion checks.
- JWT/auth test helper for a `verLeads`-holding role and one without it.
