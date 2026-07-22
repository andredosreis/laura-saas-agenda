# F03 — Recovery CSV Export — Spec

**PRD:** `docs/produto/PRD-recuperacao-leads.md` (F03) · Design: `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` (§6.2, §6.5, §9)
**Complexity:** simple
**Module:** `src/modules/leads/` — backend, tenant-scoped

---

## 1. Scope

**Included:**
- `GET /api/v1/leads/recuperacao/export.csv` — same filter semantics as F02's `GET /leads/recuperacao` (`de`, `ate`, `grupo`, `motivoCodigo`, `origem`), **no pagination**, hard cap **5,000 rows**.
- New pure module `src/modules/leads/csvExport.js` — CSV serialization only (BOM, quoting, sanitization, truncation cap, filename). Unit-testable without HTTP, without Mongo.
- Injection-sanitization of every exported cell against formula execution (`=`, `+`, `-`, `@`, TAB, CR → prefixed with `'`) — lead names are WhatsApp display names, attacker-controlled.
- UTF-8 BOM + `;` separator + RFC-style quoting so the file opens correctly (readable accents) in Portuguese Excel.
- Explicit truncation signal (`X-Export-Truncated: true` header) when the result exceeds the cap — never a silent cut.
- An export processing-record log entry (user id, timestamp, applied filters) — GDPR-relevant even though this PRD is not the GDPR workstream (see `docs/produto/PRD-privacidade-consentimento.md` for the broader consent/retention programme; this is only a log line, not a consent record).

**Provides (to later features):**
- The downloadable CSV endpoint that F04's "Exportar CSV" button links to, honoring the page's active filters.

**Consumes (from F02 — prerequisite, not part of this feature):**
- The recoverable-lead row shape and filter semantics computed by `src/modules/leads/recuperacaoService.js` (name, phone digits, origin, stalled stage, reason code + note, first/last contact dates, days stalled, interest, qualification score, contacted flag). F03 reuses this service as the **single source of truth** for *which* leads qualify — it does not re-derive the cold-lead rule, the `nao_e_lead` exclusion, or the 30-day contacted cool-off. See §8 for the exact integration point assumed.

**Deferred (other features):**
- The report JSON endpoint and its `resumo` aggregation (F02).
- The export button, truncation warning toast, and page UI (F04).
- The `PATCH .../recuperacao` contact-tracking endpoint and WhatsApp deep link (F05).
- Per-tenant recovery message templates, cold-threshold configuration UI (out of scope per PRD §7).

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/leads/csvExport.js` | new | Pure CSV builder: `sanitizeCell()`, `quoteCsvField()`, `buildRecuperacaoCsv(rows)` → `{ csv, truncated, rowCount }`; `buildExportFilename()` (Luxon, `Europe/Lisbon`); exports `RECUPERACAO_CSV_COLUMNS` (the 12 header labels) and `MAX_EXPORT_ROWS = 5000`. No Mongoose, no `req`/`res` — takes plain row objects, returns strings. |
| `src/modules/leads/recuperacaoController.js` | edit *(created by F02)* | Add `exportRecuperacaoCsv(req, res)`: validate query (reused schema), call `recuperacaoService` for up to `MAX_EXPORT_ROWS + 1` rows (no pagination), build the CSV via `csvExport.js`, set headers, log the export, `res.send()`. Errors before the CSV is built still return the standard JSON envelope. |
| `src/modules/leads/recuperacaoService.js` | edit *(created by F02)* | Reused as-is for filtering/derivation. If F02's lister function hard-clamps `limit` to 100 for the paginated endpoint, F03 needs an unclamped entry point (see §8, Assumption A1) — implementer coordinates with F02's actual signature at build time. |
| `src/modules/leads/leadSchemas.js` | edit | Add `exportRecuperacaoQuerySchema` — the same filter fields as F02's report query schema (`de`, `ate`, `grupo`, `motivoCodigo`, `origem`), `.strict()`, **without** `page`/`limit` (this route has none). Reuse via `.omit()` if F02's schema is factored to allow it; otherwise duplicate the filter subset — do not import F02's full schema with page/limit still active. |
| `src/modules/leads/leadRoutes.js` | edit | Add `router.get('/recuperacao/export.csv', requirePermission('verLeads'), validate(exportRecuperacaoQuerySchema, 'query'), exportRecuperacaoCsv);` — declared **before** `router.get('/:id', ...)`, alongside F02's `/recuperacao` route (also before `/:id`). |
| `tests/lead-recuperacao-export.test.js` | new | Integration tests via supertest — headers, BOM, sanitization, truncation boundary, filename, JSON errors, tenant isolation, logging. |
| `tests/csv-export.test.js` | new | Pure unit tests for `csvExport.js` — no HTTP, no DB. |

Pattern references: `src/modules/leads/leadRoutes.js` (route order, `requirePermission('verLeads')`), `src/modules/leads/leadSchemas.js` (Zod `.strict()` idiom), `src/utils/logger.js` (pino), `laura-saas-frontend/src/pages/Transacoes.jsx:323-348` (`exportarCSV` — **anti-pattern reference, not to be copied**: client-side blob generation, no BOM, no sanitization, unquoted `join(';')` that breaks on any field containing `;` or a line break).

---

## 3. Data Model

No new schema. This feature is a serialization layer over F01/F02's `Lead` fields. Column → field mapping:

| # | CSV Column | Source | Notes |
|---|---|---|---|
| 1 | Nome | `lead.nome` | May be empty (IA hasn't captured a name yet) — exported as empty string, still sanitized |
| 2 | Telefone | `lead.telefone` | Digits-only, as stored (no `+`/spaces). **Not** forced into an Excel "text" cell — see §8 A2 |
| 3 | Origem | `lead.origem` | Raw enum value (`whatsapp`\|`manual`\|`import`\|`outro`) — no label table exists yet in the codebase; pass through as-is |
| 4 | Etapa onde parou | `lead.status` via `LEAD_STAGE_LABELS` | Human label (`Qualificado`, not `qualificado`) — same label map as the Kanban |
| 5 | Motivo | `lead.perdido.motivoCodigo` via `LEAD_MOTIVOS_PERDA` (lost) or fixed `"Parou de responder"` (derived-cold, design §5) | Cold leads never persist a `motivoCodigo`; the label is synthesized by F02's row derivation, not read from the document |
| 6 | Nota | `lead.perdido.motivo` | Free-text note (≤200 chars); empty for cold leads (no note exists) |
| 7 | 1º contacto | `lead.createdAt` | Formatted `dd/MM/yyyy`, Luxon `Europe/Lisbon` |
| 8 | Último contacto | `lead.ultimaInteracao` | Formatted `dd/MM/yyyy`, Luxon `Europe/Lisbon` |
| 9 | Dias parado | derived: days between `ultimaInteracao` and now | Integer, Luxon `Europe/Lisbon` — same figure F02 sorts by |
| 10 | Interesse | `lead.interesse` | Free text (≤200 chars), may be empty |
| 11 | Score | `lead.qualificacao.score` | Integer 0–100 |
| 12 | Já contactado | `lead.recuperacao.contactadoEm` presence | `"Sim"` if a contact record exists at all (even outside the 30-day window — signals a repeat cold lead), else `"Não"` — see §8 A3 |

Columns 1–6, 9–12 are computed/derived by F02's row shape; F03 only formats and sanitizes them. F03 does not read `Lead` documents directly — it consumes whatever row shape `recuperacaoService.js` returns.

---

## 4. API Contracts

### `GET /api/v1/leads/recuperacao/export.csv`

Query params — identical semantics to F02, no `page`/`limit`:

| Param | Type | Notes |
|---|---|---|
| `de` | ISO date string, optional | Period start |
| `ate` | ISO date string, optional | Period end |
| `grupo` | `perdidos` \| `esfriados` \| `todos`, optional (default `todos`) | Same enum as F02 |
| `motivoCodigo` | one of `LEAD_MOTIVO_VALUES`, optional | |
| `origem` | one of `ORIGEM_VALUES`, optional | |

Guarded by `requirePermission('verLeads')`. Every query includes `{ tenantId: req.tenantId }` (via `recuperacaoService.js`).

**Success response** — `200`, raw CSV body (declared exception to the `{ success, data }` contract — errors still use it, see §6):

Headers:
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="recuperacao-leads-2026-07-22.csv"
```
(`X-Export-Truncated: true` present only when the cap was hit — absent otherwise, never set to `false`.)

Body (rendered as text; the leading `﻿` is the UTF-8 BOM, byte sequence `EF BB BF`):
```
﻿Nome;Telefone;Origem;Etapa onde parou;Motivo;Nota;1º contacto;Último contacto;Dias parado;Interesse;Score;Já contactado
"Ana Sousa";"351912345678";"whatsapp";"Qualificado";"Achou caro";"Disse que noutra clínica é mais barato";"01/06/2026";"15/06/2026";"37";"Botox";"72";"Não"
"'=HYPERLINK(""http://evil"")";"351913000000";"whatsapp";"Em conversa";"Parou de responder";"";"10/07/2026";"10/07/2026";"12";"";"40";"Não"
```
Notes on the sample:
- Every field is quoted (RFC-style), including numeric-looking ones (`"37"`, `"72"`) — protects against `;`/CRLF appearing inside `Nome`/`Nota`/`Interesse`.
- Row 2's `Nome` demonstrates sanitization: the WhatsApp display name `=HYPERLINK("http://evil")` is exported as `'=HYPERLINK("http://evil")` (leading `'` added, internal `"` doubled per RFC quoting) — opens as inert text, never as a formula.
- Line ending is **CRLF** (`\r\n`) — see §5, R2.

**Empty result** — `200`, valid CSV with the header row only (12 columns, no data rows) — not an error.

**Truncated result** — `200`, first 5,000 data rows + `X-Export-Truncated: true`. 4,999 rows → same 200, header absent.

---

## 5. Requirements / Business Rules

- **R1.** Body starts with the UTF-8 BOM (`﻿`), immediately followed by the header row — no blank line, no comment line before it.
- **R2.** Line ending is **CRLF** (`\r\n`) *[Auto-Accept — see §8 A4 for justification]*. Separator is `;`. Every field is wrapped in double quotes; a literal `"` inside a field value is escaped by doubling (`""`), per RFC 4180 §2.5–2.7, adapted to `;` as the delimiter (Portuguese/Excel locale convention, matching the design doc and the legacy `Transacoes.jsx` separator choice).
- **R3.** Sanitization: any field whose **first character** is `=`, `+`, `-`, `@`, TAB (`\t`) or CR (`\r`) is prefixed with a leading `'` before quoting. Applied uniformly to every one of the 12 columns (simpler and safer than special-casing "string columns only" — numeric columns in this row shape never naturally start with these characters, so the uniform pass is a no-op for them).
- **R4.** Hard cap: at most `MAX_EXPORT_ROWS = 5000` data rows are ever written to the body. If the underlying filtered set has more than 5,000 matching rows, the response still carries the first 5,000 (sorted the same way F02 sorts — days stalled desc) **and** the `X-Export-Truncated: true` header. Never a silent cut — the header is the only signal, so it must never be omitted when truncation occurred.
- **R4b.** *(orchestrator reconciliation with F04)* The export response must also set `Access-Control-Expose-Headers: X-Export-Truncated, Content-Disposition`. Verified in `src/app.js`: the production `cors()` config has only `origin` + `credentials` — without this per-response header, the browser hides `X-Export-Truncated` from JS and F04's truncation toast silently never fires. Set it in the export controller (scoped to this route; no global CORS change).
- **R5.** `nao_e_lead`-coded leads are excluded — reusing F02's exclusion rule (never re-implemented here); they never appear in a CSV row under any filter combination.
- **R6.** Filename is `recuperacao-leads-YYYY-MM-DD.csv`, where the date is **today's date** (export moment, not the `de`/`ate` filter range), computed via Luxon in `Europe/Lisbon`.
- **R7.** No pagination params are accepted on this route — a caller-supplied `page`/`limit` is either rejected by `.strict()` validation (400) or silently ignored, per the schema decision in §2 (reject — `.strict()` is the project-wide convention for Zod schemas in this module, so an unexpected `page` key returns 400, not a silent ignore).
- **R8.** Every successful export writes exactly one log entry via `src/utils/logger.js`: `userId` (`req.user._id`), `tenantId` (`req.tenantId`), the applied filters (query params as received, before defaulting), timestamp (implicit in the pino log line), row count, and whether truncation occurred. No PII (lead names/phones) is put in the log line — filters and counts only.
- **R9.** Filters are validated before any Mongo query executes (fail fast, matching F02).

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Malformed `de`/`ate` (not a parseable date) | 400 | `{ success:false, error:'de: data inválida' }` (or `ate`) — **JSON**, never a broken/partial CSV |
| Out-of-enum `grupo`/`motivoCodigo`/`origem` | 400 | `{ success:false, error:'<campo>: valor inválido' }` |
| Unexpected query key (e.g. `page`) | 400 | `{ success:false, error:'...' }` via `.strict()` |
| Missing `verLeads` permission | 403 | `{ success:false, error:'Sem permissão para executar esta acção', requiredPermission:'verLeads' }` (via `requirePermission`) |
| No token / invalid token | 401 | handled by `authenticate` |
| DB/unexpected error while fetching rows | 500 | `{ success:false, error:'Erro interno' }` — thrown **before** `res.set()`/`res.send()` for the CSV body, so no partial CSV is ever sent with a 500 status |
| Result set empty | 200 | Valid CSV, header row only — **not** an error |
| Result set > 5,000 | 200 | First 5,000 rows + `X-Export-Truncated: true` — **not** an error |

---

## 7. Testing Strategy

`tests/csv-export.test.js` (pure unit — no HTTP, no DB, no Jest ESM DB setup needed):
- `BOM assertion` — `buildRecuperacaoCsv([])` (or any row set) returns a string whose first character is `﻿`.
- `header-only for empty input` — `buildRecuperacaoCsv([])` returns exactly the header row (12 columns) + CRLF, no data rows.
- `=HYPERLINK prefix` — a row with `nome: '=HYPERLINK("http://x")'` serializes with `'=HYPERLINK("http://x")` as the `Nome` cell; same assertion repeated for leading `+`, `-`, `@`, TAB, CR.
- `quoting escapes embedded double quotes` — a field containing `"` is doubled and the whole field remains quoted.
- `5001/4999 truncation boundary` — 5,001 input rows → `{ csv, truncated: true, rowCount: 5000 }` with exactly 5,000 data lines; 4,999 input rows → `{ truncated: false, rowCount: 4999 }`.
- `filename date` — `buildExportFilename()` returns `recuperacao-leads-YYYY-MM-DD.csv` matching `DateTime.now().setZone('Europe/Lisbon').toISODate()`.
- `column order` — `RECUPERACAO_CSV_COLUMNS` has exactly the 12 names in the PRD-specified order.

`tests/lead-recuperacao-export.test.js` (Jest ESM + supertest + `mongodb-memory-server`, mirroring `.claude/rules/testing.md`):
- `GET .../export.csv returns text/csv with BOM and CRLF` — response body starts with the BOM byte sequence; `Content-Type`/`Content-Disposition` headers match §4.
- `accented names round-trip` — a lead named `"José Álvares"` (with `perdido.motivo` containing accents) appears unescaped/undamaged in the raw body bytes.
- `JSON error on bad filter` — `?de=not-a-date` → 400, `Content-Type: application/json`, standard error envelope, no CSV bytes in the body.
- `missing permission → 403 JSON` — a token without `verLeads` gets 403 JSON, not a CSV.
- `5001/4999 truncation boundary (integration)` — seed 5,001 recoverable leads → response has `X-Export-Truncated: true` and exactly 5,000 data rows; seed 4,999 → header absent, 4,999 data rows.
- `empty CSV` — filters matching zero leads → 200, header-only CSV, no truncation header.
- `nao_e_lead never exported` — seed a `nao_e_lead` lost lead alongside recoverable ones → its `nome`/`telefone` never appear in the body.
- `isolation` — Tenant B's export using Tenant A's exact filter values returns only Tenant B's rows (never Tenant A's, never a 403 — an empty/own-tenant-only CSV).
- `filename date` — `Content-Disposition` carries today's date in `Europe/Lisbon` regardless of the `de`/`ate` filter range used.
- `same filters → same row set as F02 (F03 ← F02 integration)` — call `GET /leads/recuperacao?<filters>` and `GET /leads/recuperacao/export.csv?<filters>` with identical query strings; the CSV's name+phone pairs equal the JSON list's name+phone pairs (mod the 5,000 cap and column formatting).
- `export is logged` — spy/mock `logger.info`; assert one call with `userId`, `tenantId`, the applied filters, and a row count after a successful export.

---

## 8. Assumptions / Decisions

- **A1. `recuperacaoService.js` exposes an unclamped internal lister.** *[Resolved — orchestrator reconciliation]* Confirmed with F02's spec (§8 A3): the 100-row clamp lives in F02's **controller** only; the service lister accepts any `limit` unclamped. F03 calls it directly with `MAX_EXPORT_ROWS + 1`. No second entry point, no page looping.
- **A2. Phone column is not forced into Excel "text" format.** *[Auto-Accept]* Excel's `General` cell format can render very long digit strings (12+ digits, e.g. a `351`-prefixed number) in scientific notation. The PRD/design do not ask for a text-coercion trick (e.g. a leading formula quote), and doing so would conflict with the sanitization rule's own use of a leading `'`. Left as-is; recorded as known behavior, not a defect, consistent with the design doc's stated scope (BOM + injection-sanitization only).
- **A3. "Já contactado" reflects contact history, not the current cool-off window.** *[Auto-Accept]* Since a lead within the active 30-day cool-off is excluded from the list entirely (F02's rule), a row present in this export was, by definition, not contacted in the last 30 days. "Já contactado = Sim" is therefore read as "this lead was contacted before, cool-off has since elapsed" (`recuperacao.contactadoEm` is set, regardless of how long ago) rather than "currently in cool-off" (which would always be false for exported rows and make the column meaningless).
- **A4. Line ending: CRLF, not LF.** *[Auto-Accept]* RFC 4180 specifies CRLF, and the target reader (Portuguese Excel, per the PRD's own success metric) is Windows-first; CRLF avoids any edge-case Excel version treating bare LF rows as a single unbroken line. LF is not used anywhere in this file.
- **A5. Filter schema reuse with F02 is coordinated at build time.** *[Auto-Accept]* This spec assumes F02 factors its query-filter fields (`de`/`ate`/`grupo`/`motivoCodigo`/`origem`) separately from its pagination fields (`page`/`limit`) in `leadSchemas.js`, so F03 can reuse the filter subset via `.omit()` instead of duplicating five field definitions. If F02 ships a single monolithic schema instead, F03's implementer duplicates the filter fields locally rather than blocking on a schema refactor.
- **A6. Sanitization applies uniformly to all 12 columns**, not only "string" columns — simpler, and harmless for numeric columns (Score, Dias parado) since none of the source values can naturally start with `=`/`+`/`-`/`@`/TAB/CR in this domain (scores are 0–100, days-stalled is a non-negative integer).
- **A7. `Origem` is exported as the raw enum value** (`whatsapp`, `manual`, `import`, `outro`) — no human-label mapping exists yet anywhere in the codebase for this field (checked: no `ORIGEM_LABELS` constant). Introducing one is out of scope for this feature; the enum values are already legible in Portuguese/English mixed usage across the product.
