# F01 — Standardized Loss Reasons Foundation — Plan

**Spec:** `./spec.md` · **Complexity:** medium · **Phases:** 4

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/modules/leads/pipelineConstants.js` (frozen-map idiom), `src/modules/leads/leadService.js` (`transitionStage`), `src/migrations/seedScheduleFromAgentRules.js` (per-tenant-DB migration loop + prod-URI guard), `scripts/migrations/2026-05-04-set-default-evolution-instance.js` (dry-run/`--apply` CLI convention).
- No feature dependencies (F01 is Wave 1 of this PRD — nothing to wait on).
- ⚠️ Local `.env` points to the production Atlas cluster (per `CLAUDE.md`) — the backfill script must default to dry-run and require an explicit `--apply` flag; never run `--apply` against it without an explicit decision.

## Phase 1 — Constants & data model
1. **Loss-reason constants** — Add `LEAD_MOTIVOS_PERDA` (frozen code→label map, 8 entries) and `LEAD_MOTIVO_VALUES` (`Object.keys(...)`) to `src/modules/leads/pipelineConstants.js`, following the existing `LEAD_STAGE_LABELS`/`LEAD_STAGES` idiom in the same file.
2. **`Lead` model fields** — In `src/models/Lead.js`, add `perdido.motivoCodigo` (enum `LEAD_MOTIVO_VALUES`, no `required`) and the new `recuperacao { contactadoEm, contactadoPor, resultado }` subdocument, importing `LEAD_MOTIVO_VALUES` from `pipelineConstants.js`.
3. **New indexes** — Add `{ tenantId: 1, createdAt: -1 }` and `{ tenantId: 1, 'perdido.motivoCodigo': 1 }` to `leadSchema` alongside the three existing indexes; verify no existing index is removed or altered.

## Phase 2 — Service, schema & controller validation
4. **Service validation** — Rewrite the `perdido` branch of `transitionStage()` (`src/modules/leads/leadService.js`): require a valid `motivoCodigo` (member of `LEAD_MOTIVO_VALUES`) to enter `perdido`; when `motivoCodigo === 'outro'`, additionally require a non-empty trimmed `motivo` (note); persist `perdido = { motivoCodigo, motivo, em: new Date() }`; keep the existing `iaAtiva = false` side effect. Remove the old "bare non-empty `motivo` is sufficient" rule entirely.
5. **Zod schema** — Add `motivoCodigo: z.enum(LEAD_MOTIVO_VALUES).optional()` to `moveStageSchema` in `src/modules/leads/leadSchemas.js`, importing `LEAD_MOTIVO_VALUES`; keep `motivo` as-is (still optional at this layer, conditional requirement enforced in the service).
6. **Controller pass-through** — Update `moveStage` in `src/modules/leads/leadController.js` to pass `req.body.motivoCodigo` into `transitionStage()` alongside the existing `motivo`.

## Phase 3 — Kanban modal & frontend types
7. **Frontend types** — Mirror the constants in `laura-saas-frontend/src/types/lead.ts` (`LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES`), extend `Lead.perdido` with `motivoCodigo?: string`, add `Lead.recuperacao?: {...}`, extend `MoveStageDTO` with `motivoCodigo?: string`.
8. **Perdido modal rebuild** — In `laura-saas-frontend/src/pages/LeadsKanban.tsx`, replace `PerdidoModal`'s free-text-only textarea with 8 single-select reason buttons (labels from `LEAD_MOTIVOS_PERDA`) plus an optional note field that becomes required (inline validation) when `outro` is selected; disable confirm until a reason is chosen. Update `handlePerdidoConfirm`/`doMoveStage` to carry `motivoCodigo` (and drop the `'sem motivo'` string fallback entirely).

## Phase 4 — Backfill script & tests
9. **Backfill script** — Create `scripts/migrations/2026-07-22-backfill-lead-motivo-codigo.js`: enumerate tenants from the shared `Tenant` collection, connect to each tenant DB via `getTenantDB`/`getModels`, classify `status:'perdido'` leads with no `motivoCodigo` into the three buckets from spec §3.4, print per-tenant counts, and write only when `--apply` is passed (default dry-run). Print the resolved (credential-masked) MongoDB target before doing anything.
10. **Tests** — Create `tests/lead-loss-reasons.test.js` covering the acceptance list in spec §7 (motivoCodigo required/enum-checked, "outro" note requirement, legacy-doc-still-saves, both indexes present, backfill dry-run/apply/idempotency) plus the multi-tenant isolation case for the new payload shape. Update the now-outdated assertion in `tests/lead-crud.test.js` (`'exige motivo ao mover para "perdido"'`) to match the new contract.
11. **Gates** — Run `npm run lint` and `npm test` (backend) until green, then `cd laura-saas-frontend && npm run build && npm run lint` until green; then ready for `/implement-evaluate`.
