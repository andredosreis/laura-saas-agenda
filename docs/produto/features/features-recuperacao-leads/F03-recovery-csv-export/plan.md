# F03 — Recovery CSV Export — Plan

**Spec:** `./spec.md` · **Complexity:** simple · **Phases:** 3

## Prerequisites
- **F01 (Standardized Loss Reasons Foundation)** implemented and merged: `Lead.perdido.motivoCodigo`, `Lead.recuperacao.{contactadoEm,contactadoPor,resultado}`, and `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES` exist in `src/modules/leads/pipelineConstants.js` / `src/models/Lead.js`.
- **F02 (Recovery Report API)** implemented and merged: `GET /api/v1/leads/recuperacao` works, and `src/modules/leads/recuperacaoService.js` + `src/modules/leads/recuperacaoController.js` exist with the row/summary shape described in spec §3. Confirm at build time whether the service's lister accepts an unclamped `limit` (spec §8 A1) and whether filter fields are factored separately from pagination fields in `leadSchemas.js` (spec §8 A5) — adjust Phase 2 steps 5/6 accordingly if not.
- Project running locally per `CLAUDE.md` → Environment.
- Patterns confirmed: `src/modules/leads/leadRoutes.js` (route order — new route goes before `/:id`), `src/utils/logger.js` (pino), `laura-saas-frontend/src/pages/Transacoes.jsx:323-348` (anti-pattern to avoid, not to copy).

## Phase 1 — Pure CSV module
1. **`csvExport.js` skeleton** — Create `src/modules/leads/csvExport.js`. Define `RECUPERACAO_CSV_COLUMNS` (the 12 Portuguese headers, in PRD order) and `MAX_EXPORT_ROWS = 5000`.
2. **Sanitization + quoting** — Implement `sanitizeCell(value)` (prefix `'` when the first character is `=`, `+`, `-`, `@`, TAB or CR — spec R3) and `quoteCsvField(value)` (RFC-style: wrap in `"`, double any internal `"`).
3. **Row mapping** — Implement the function that maps one F02 lead-row object to the 12 ordered, sanitized, quoted cell values, per the column mapping table in spec §3 (label lookups via `LEAD_STAGE_LABELS` / `LEAD_MOTIVOS_PERDA`, cold-lead fixed label, date formatting via Luxon `Europe/Lisbon`, `Já contactado` derivation per spec §8 A3).
4. **Cap + assemble** — Implement `buildRecuperacaoCsv(rows)`: slice to `MAX_EXPORT_ROWS`, compute `truncated`, prepend the UTF-8 BOM + header row, join rows with CRLF (spec R2, R4). Returns `{ csv, truncated, rowCount }`.
5. **Filename helper** — Implement `buildExportFilename()` using Luxon `Europe/Lisbon`, today's date, per spec R6.
6. **Unit tests first (TDD)** — Write `tests/csv-export.test.js` per spec §7 (BOM, header-only-empty, `=HYPERLINK` and other injection-char prefixes, quote-doubling, 5001/4999 boundary, filename format, column order) before/alongside the implementation; iterate until green.

## Phase 2 — API wiring
7. **Query schema** — In `src/modules/leads/leadSchemas.js`, add `exportRecuperacaoQuerySchema` covering `de`/`ate`/`grupo`/`motivoCodigo`/`origem` only (`.strict()`, no `page`/`limit`) — reuse F02's filter schema via `.omit()` if factored separately (spec §8 A5), otherwise duplicate the five fields.
8. **Controller** — In `src/modules/leads/recuperacaoController.js`, add `exportRecuperacaoCsv(req, res)`: call `recuperacaoService` for up to `MAX_EXPORT_ROWS + 1` rows (tenant-scoped, same filters as F02, no pagination — spec §8 A1), build the CSV via `csvExport.js`, set `Content-Type`/`Content-Disposition` (+ `X-Export-Truncated` when applicable), log the export via `src/utils/logger.js` (`userId`, `tenantId`, filters, row count, truncated — spec R8, no PII), and `res.send(csv)`. Wrap the fetch/build step in try/catch so any thrown error still returns the standard JSON envelope (spec §6) — never a partial CSV with a 5xx status.
9. **Route** — In `src/modules/leads/leadRoutes.js`, add `router.get('/recuperacao/export.csv', requirePermission('verLeads'), validate(exportRecuperacaoQuerySchema, 'query'), exportRecuperacaoCsv);` immediately after F02's `/recuperacao` route, both still before `router.get('/:id', ...)`.

## Phase 3 — Integration tests & gates
10. **Integration tests** — Create `tests/lead-recuperacao-export.test.js` per spec §7: headers/BOM/CRLF, accented-name round-trip, JSON error on malformed `de`, 403 on missing `verLeads`, 5001/4999 truncation boundary (seeded), empty CSV, `nao_e_lead` never exported, tenant isolation, filename date independent of `de`/`ate`, F03↔F02 same-filters-same-rows equivalence, export-is-logged (mock `logger.info`).
11. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
