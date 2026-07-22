# F02 — Recovery Report API — Plan

**Spec:** `./spec.md` · **Complexity:** medium · **Phases:** 3

## Prerequisites
- **F01 (Standardized Loss Reasons Foundation) is implemented and merged.** Concretely, before starting Phase 1, confirm in the codebase:
  - `src/modules/leads/pipelineConstants.js` exports `LEAD_MOTIVOS_PERDA` and `LEAD_MOTIVO_VALUES` (8 codes including `nao_e_lead`).
  - `src/models/Lead.js`'s `perdido` sub-document has `motivoCodigo` (enum, not `required`); a `recuperacao` sub-document exists with `contactadoEm` (Date), `contactadoPor` (ObjectId ref User), `resultado` (enum).
  - The two new indexes from F01 exist: `{ tenantId: 1, createdAt: -1 }` and `{ tenantId: 1, 'perdido.motivoCodigo': 1 }`.
  - If any of the above is missing, stop and implement/merge F01 first — F02 has no meaningful fallback (see spec §1).
- Project running locally (backend per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/modules/leads/leadController.js` (`listLeads` — pagination clamp, `Promise.all`), `src/modules/leads/leadService.js` (pure-service idiom), `src/middlewares/validate.js` (Express 5 query-getter quirk — already handled, no new handling needed), `src/controllers/analyticsController.js` (`aggregate`/date-bound pipelines), `src/modules/financeiro/transacaoController.js` (`de`/`ate`-shaped Luxon date parsing).

## Phase 1 — Constants & pure service
1. **Cold-lead constants** — Add `LEAD_COLD_THRESHOLD_DAYS = 14` and `LEAD_COLD_STAGES = Object.freeze(['novo', 'em_conversa', 'qualificado'])` to `src/modules/leads/pipelineConstants.js` (spec §3.1).
2. **`recuperacaoService.js` — resumo** — Create `src/modules/leads/recuperacaoService.js` with `getResumo({ Lead, tenantId, de, ate })`: builds the `de`/`ate` → `createdAt` range with Luxon (`Europe/Lisbon`, `startOf('day')`/`endOf('day')`), runs the single `$facet` aggregation from spec §3.2, and post-processes into `{ contactosRecebidos, leadsReais, descartados, convertidos, perdidos, esfriados, taxaConversao, porMotivo }` (7 fixed codes, `nao_e_lead` excluded — spec R8/A4/A5).
3. **`recuperacaoService.js` — leads list** — In the same file, add `buildRecoverableFilter({ tenantId, grupo, motivoCodigo, origem, de, ate, coldCutoff, contactCutoff })` (spec §3.3) and `listRecoverableLeads({ Lead, tenantId, filters, page, limit })` (find + countDocuments via `Promise.all`, sorted `ultimaInteracao asc`, clamped `page`/`limit` per R9).
4. **Row serialization** — Add `serializeLeadRow(leadDoc, { now })` (spec §3.4) computing `etapaLabel`, `grupo`, `motivoCodigo`/`motivoLabel`, `nota`, `diasParado`, `jaContactado`.

## Phase 2 — API surface
5. **Query schema** — Add `recuperacaoQuerySchema` to `src/modules/leads/leadSchemas.js` (spec §4): `de`/`ate` as `AAAA-MM-DD` strings, `grupo` enum defaulting to `'todos'`, `motivoCodigo`/`origem` optional enums (reusing `LEAD_MOTIVO_VALUES`/`ORIGEM_VALUES`), `page`/`limit` with **no upper `.max()` on `limit`** (clamped downstream per A3) `.strict()` + `.refine` for `de <= ate`.
6. **Controller** — Add `getRecuperacaoReport` to `src/modules/leads/leadController.js`: reads validated `req.query`, calls `recuperacaoService.getResumo` and `listRecoverableLeads` in parallel (`Promise.all` — never serial per CLAUDE.md), maps rows through `serializeLeadRow`, returns `{ success:true, data:{ resumo, leads }, pagination }`.
7. **Route wiring** — In `src/modules/leads/leadRoutes.js`, insert `router.get('/recuperacao', requirePermission('verLeads'), validate(recuperacaoQuerySchema, 'query'), getRecuperacaoReport)` **immediately before** the existing `router.get('/:id', ...)` line (spec R13) — verify by reading the file after the edit that no `:id`-matching route precedes it.

## Phase 3 — Tests & gates
8. **Tests** — Create `tests/lead-recuperacao-report.test.js` covering: resumo bucket math, 13/14-day cold boundary, cold-lead-replies-and-disappears, `nao_e_lead` exclusion (list + resumo denominators), 10-day/40-day contact cool-off boundary, `grupo` filter isolation, `porMotivo` correctness, `limit=500` clamp (not 400), `verLeads` permission gate, `motivoCodigo`/`origem`/`de`/`ate` filters, route-order regression, and the mandatory multi-tenant isolation test (per spec §7).
9. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
