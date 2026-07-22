# F01 — Standardized Loss Reasons Foundation — Spec

**PRD:** `docs/produto/PRD-recuperacao-leads.md` (F01)
**Design:** `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` (§3, §4, §10 W1.1-3)
**Complexity:** medium
**Module:** `src/modules/leads/` (existing) + `src/models/Lead.js` (existing) — backend, tenant-scoped; `laura-saas-frontend/src/pages/LeadsKanban.tsx` (existing) — frontend

---

## 1. Scope

**Included:**
- New frozen map `LEAD_MOTIVOS_PERDA` (8 codes) + `LEAD_MOTIVO_VALUES` in `src/modules/leads/pipelineConstants.js`.
- `Lead` model gains `perdido.motivoCodigo` (enum, **not** Mongoose `required` — legacy lost leads must keep loading/saving without validation errors) and a new `recuperacao { contactadoEm, contactadoPor, resultado }` subdocument (consumed later by F02/F05; F01 only adds the fields).
- `perdido.motivo` is repurposed as the free-text note (unchanged 200-char cap, already enforced in Zod).
- Two new indexes on `Lead`: `{ tenantId: 1, createdAt: -1 }` and `{ tenantId: 1, 'perdido.motivoCodigo': 1 }`.
- `transitionStage()` (`src/modules/leads/leadService.js`) validation rewritten: moving to `perdido` requires a valid `motivoCodigo`; `motivoCodigo: 'outro'` additionally requires a non-empty note; the old "any non-empty `motivo` string is enough" rule is removed.
- `moveStageSchema` (`src/modules/leads/leadSchemas.js`) gains `motivoCodigo` (optional at the Zod layer — conditional requirement stays in the service, matching where `transitionStage` already lives).
- Backfill script in `scripts/migrations/`, idempotent, per-tenant DB, `--dry-run` (default)/`--apply`, printing the target cluster and per-tenant counts before writing.
- Kanban "Perdido" modal (`LeadsKanban.tsx`) rebuilt: 8 tappable reason buttons (single-select) + optional note (required only for "Outro"); confirm disabled until a reason is picked. The `'sem motivo'` string fallback is deleted.

**Provides (to later features):**
- Loss reason code, free-text note, loss timestamp (`perdido.motivoCodigo`, `perdido.motivo`, `perdido.em`) — used by F02's `porMotivo` breakdown and F03's CSV column.
- Recovery contact record shape (`recuperacao.contactadoEm`, `recuperacao.contactadoPor`, `recuperacao.resultado`) — the field F02 reads for the 30-day exclusion rule and F05 writes via its `PATCH /:id/recuperacao`. F01 only declares the schema; no route writes to it yet.
- The `{ tenantId, createdAt }` and `{ tenantId, 'perdido.motivoCodigo' }` indexes F02's aggregation (`resumo`, `porMotivo`) relies on.

**Deferred (other features):** the recovery report/aggregation (F02), the CSV export (F03), the recovery page (F04), the WhatsApp button + `PATCH /:id/recuperacao` that actually writes to `recuperacao` (F05). F01 is only the data foundation + the Kanban capture flow that produces clean `motivoCodigo` data going forward.

### Assumptions/Decisions

Every choice below is not fully dictated by the PRD/design/codebase and is called out per the batch-mode Auto-Accept policy:

- **[Auto-Accept]** Backfill script filename: `scripts/migrations/2026-07-22-backfill-lead-motivo-codigo.js` (dated to today, following the `YYYY-MM-DD-<slug>.js` convention already used by `2026-05-04-set-default-evolution-instance.js` / `2026-05-05-enable-leads-all-tenants.js`).
- **[Auto-Accept]** New integration test file: `tests/lead-loss-reasons.test.js` (mirrors the existing `tests/lead-crud.test.js` / `tests/lead-multitenant.test.js` naming pattern; PRD does not name a file).
- **[Auto-Accept]** Error message for `motivoCodigo: 'outro'` without a note: `'Nota é obrigatória quando o motivo é "Outro"'`. The PRD only specifies the missing-`motivoCodigo` message verbatim (`'Motivo é obrigatório ao marcar como "perdido"'` — reused as-is, it already exists in the codebase); the "Outro" message text is our choice.
- **[Auto-Accept]** The new `{ tenantId: 1, 'perdido.motivoCodigo': 1 }` index is **not** `sparse`. Most leads will have `motivoCodigo: undefined`; a non-sparse index still works correctly for F02's per-code aggregation and keeps the index definition simple. Revisit only if index size becomes a measured problem.
- **[Auto-Accept]** Legacy backfill treats **any** falsy/missing `perdido.motivo` on a `status: 'perdido'` document (not just the exact literal `'sem motivo'`) the same way: `motivoCodigo: 'outro'`, note set to `null`. The design doc only names the literal string explicitly, but a lost lead with a genuinely empty note is the same case in substance.
- **[Auto-Accept]** The literal-string match for `'sem motivo'` is done on `String(motivo).trim().toLowerCase()`, not a strict `===`, to absorb incidental whitespace/case drift in old free-text data without under- or over-matching.
- **[Auto-Accept]** Reopening a `perdido` lead (`perdido` → `em_conversa`/`qualificado`, both already-allowed transitions in `ALLOWED_TRANSITIONS`) does **not** clear `perdido.motivoCodigo`/`motivo`/`em`. This matches pre-existing behavior (the current code never clears `perdido` on reopen either) and preserves the historical record; F01 does not change this.
- **[Auto-Accept]** The backfill script does not add a `--tenant=<id>` scoping flag. It always enumerates every tenant from the shared `Tenant` collection (mirroring `src/migrations/seedScheduleFromAgentRules.js`'s loop), matching the PRD's "runs per tenant DB ... prints counts" requirement without extra surface.
- **[Auto-Accept]** Dry-run output reports three buckets per tenant: `toOutroWithNote` (has free text, no `motivoCodigo`), `toOutroNullNote` (literal/empty `'sem motivo'`, no `motivoCodigo`), and `alreadyMigrated` (has `motivoCodigo` already — skipped, proves idempotency on re-run). Not specified verbatim by the PRD, but needed to satisfy "prints target cluster + counts."
- **[Auto-Accept]** Kanban modal reason-button layout: a 2-column grid on mobile widths (matching the existing `PerdidoModal`'s `max-w-sm` card and the design system's mobile-first rule), 4 columns from `sm:` up. Pure visual detail, not specified by PRD/design.
- **[Auto-Accept]** `LeadsKanban.tsx`'s `handlePerdidoConfirm` signature changes from `(motivo: string)` to `(motivoCodigo: string, nota?: string)`; `doMoveStage`'s optional third parameter follows the same shape. Internal-only signature choice, not observable from the API contract.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/leads/pipelineConstants.js` | edit | Add `LEAD_MOTIVOS_PERDA` (frozen code→label map) + `LEAD_MOTIVO_VALUES` (frozen array of the 8 codes, `Object.keys(...)`, mirroring the existing `LEAD_STAGES`/`ORIGEM_VALUES` idiom) + `RECUPERACAO_RESULTADO_VALUES` (frozen array `['pendente','sem_resposta','respondeu','reagendou','recusou']` — the `recuperacao.resultado` enum is born here so F05's Zod schema and the Mongoose model share one source of truth; *orchestrator reconciliation with F05's spec*) |
| `src/models/Lead.js` | edit | Add `perdido.motivoCodigo` (enum `LEAD_MOTIVO_VALUES`, no `required`) and `recuperacao { contactadoEm, contactadoPor, resultado }`; add the two new indexes; import `LEAD_MOTIVO_VALUES` |
| `src/modules/leads/leadService.js` | edit | `transitionStage()`: when `toStage === 'perdido'`, require a valid `motivoCodigo` (enum-checked); if `motivoCodigo === 'outro'`, additionally require a non-empty trimmed note (`motivo`); persist `perdido = { motivoCodigo, motivo, em }` |
| `src/modules/leads/leadSchemas.js` | edit | `moveStageSchema`: add `motivoCodigo: z.enum(LEAD_MOTIVO_VALUES).optional()` alongside the existing `motivo` field (still optional at this layer — conditional requirement enforced in the service, consistent with where the current `motivo_required` check already lives) |
| `src/modules/leads/leadController.js` | edit | `moveStage`: pass `req.body.motivoCodigo` through to `transitionStage()` alongside the existing `motivo` |
| `src/models/registry.js` | read-only | No change — `Lead` is already registered via `LeadSchema` in `getModels()`; the new fields ride the existing schema export |
| `laura-saas-frontend/src/types/lead.ts` | edit | Add `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES` (mirroring the backend map), extend `Lead.perdido` with `motivoCodigo?: string`, add `Lead.recuperacao?: { contactadoEm?: string; contactadoPor?: string; resultado?: string }`, extend `MoveStageDTO` with `motivoCodigo?: string` |
| `laura-saas-frontend/src/pages/LeadsKanban.tsx` | edit | `PerdidoModal`: replace the free-text-only textarea with 8 single-select reason buttons + optional note (required inline validation for "Outro"), confirm disabled until a reason is selected; `handlePerdidoConfirm`/`doMoveStage` updated to carry `motivoCodigo` |
| `scripts/migrations/2026-07-22-backfill-lead-motivo-codigo.js` | new | Idempotent per-tenant backfill: legacy free-text lost leads → `motivoCodigo: 'outro'` + note preserved; literal/empty `'sem motivo'` → `motivoCodigo: 'outro'` + note `null`; `--dry-run` default, `--apply` to write, prints target cluster + per-tenant counts |
| `tests/lead-loss-reasons.test.js` | new | Integration tests for the new `transitionStage`/`moveStage` validation, schema/index presence, and multi-tenant isolation |
| `tests/lead-crud.test.js` | edit | Existing test `'exige motivo ao mover para "perdido"'` (line ~268) asserts the *old* behavior (bare `motivo` string succeeds) — update it to require `motivoCodigo` per the new contract |

Pattern references: `src/modules/leads/pipelineConstants.js` (frozen-map idiom already used for `LEAD_STAGE_LABELS`), `src/models/Lead.js` (nested `perdido` subdocument already there), `src/migrations/seedScheduleFromAgentRules.js` (per-tenant-DB migration loop + prod-URI guard pattern), `scripts/migrations/2026-05-04-set-default-evolution-instance.js` (dry-run/`--apply` CLI convention for `scripts/migrations/`).

---

## 3. Data Model

### 3.1 `pipelineConstants.js` — new constants

```js
export const LEAD_MOTIVOS_PERDA = Object.freeze({
  preco:         'Achou caro',
  horario:       'Horário não serviu',
  concorrencia:  'Foi para outro sítio',
  pesquisando:   'Só estava a pesquisar',
  localizacao:   'Longe / deslocação',
  sem_resposta:  'Parou de responder',
  nao_e_lead:    'Não era cliente potencial',
  outro:         'Outro',
});

export const LEAD_MOTIVO_VALUES = Object.freeze(Object.keys(LEAD_MOTIVOS_PERDA));
```

### 3.2 `Lead` model — changed fields (`src/models/Lead.js`)

```js
// Razão de "perdido"
perdido: {
  motivoCodigo: { type: String, enum: LEAD_MOTIVO_VALUES },  // NEW — no `required`: legacy docs stay valid
  motivo:       { type: String, trim: true },                // now the free-text NOTE (≤200 chars, enforced in Zod)
  em:           { type: Date },
},

// Rastreio de tentativas de recuperação (F05 escreve; F02 lê)
recuperacao: {                                               // NEW
  contactadoEm:  { type: Date },
  contactadoPor: { type: Schema.Types.ObjectId, ref: 'User' },
  resultado: {
    type: String,
    enum: RECUPERACAO_RESULTADO_VALUES, // imported from pipelineConstants.js — shared with F05's Zod schema
  },
},
```

- No `required` anywhere in `recuperacao` either — the subdocument stays entirely absent until F05's `PATCH /:id/recuperacao` first writes to it. F01 does not add a writer for this subdocument.
- `perdido.motivo`'s existing `maxlength: 200` is enforced at the Zod layer (`moveStageSchema`), not via a Mongoose `maxlength` validator — unchanged from today.

### 3.3 New indexes

```js
leadSchema.index({ tenantId: 1, createdAt: -1 });               // NEW — report period filter (F02)
leadSchema.index({ tenantId: 1, 'perdido.motivoCodigo': 1 });    // NEW — per-reason aggregation (F02)
```

Added alongside the three existing indexes (`{tenantId,telefone}` unique, `{tenantId,status,ultimaInteracao}`, `{tenantId,origem,ultimaInteracao}`) — none of those are touched.

### 3.4 Backfill semantics (`scripts/migrations/2026-07-22-backfill-lead-motivo-codigo.js`)

| Legacy document | Action |
|---|---|
| `status: 'perdido'`, `perdido.motivo` is non-empty free text, no `motivoCodigo` | `motivoCodigo: 'outro'`; `motivo` (the text) preserved unchanged |
| `status: 'perdido'`, `perdido.motivo` is the literal `'sem motivo'` (case/whitespace-insensitive) or falsy/missing, no `motivoCodigo` | `motivoCodigo: 'outro'`; `motivo` set to `null` |
| `status: 'perdido'`, `motivoCodigo` already set | Skipped (idempotent no-op) |
| Any `status !== 'perdido'` document | Untouched |

Runs per tenant DB via `getTenantDB(tenantId)` / `getModels(...)`, iterating every tenant found in the shared `Tenant` collection — same connection pattern as `src/migrations/seedScheduleFromAgentRules.js`.

---

## 4. API Contracts

`PATCH /api/leads/:id/stage` and `PATCH /api/v1/leads/:id/stage` (existing route, `src/modules/leads/leadRoutes.js`; unchanged permission `requirePermission('editarLeads')`). Only the `perdido` destination behavior changes.

### 4.1 Move to `perdido` with a standard reason — success

Request:
```json
{ "stage": "perdido", "motivoCodigo": "preco", "motivo": "Achou o pacote de 10 sessões caro" }
```

Response `200`:
```json
{
  "success": true,
  "data": {
    "_id": "665...",
    "status": "perdido",
    "perdido": {
      "motivoCodigo": "preco",
      "motivo": "Achou o pacote de 10 sessões caro",
      "em": "2026-07-22T10:15:00.000Z"
    },
    "iaAtiva": false,
    "...": "..."
  }
}
```
`motivo` is optional here — a reason code alone is sufficient for every code except `outro`.

### 4.2 Move to `perdido` without `motivoCodigo` — error

Request:
```json
{ "stage": "perdido" }
```

Response `400`:
```json
{ "success": false, "error": "Motivo é obrigatório ao marcar como \"perdido\"", "code": "motivo_required" }
```

### 4.3 Move to `perdido` with `motivoCodigo: 'outro'` and no note — error

Request:
```json
{ "stage": "perdido", "motivoCodigo": "outro" }
```

Response `400`:
```json
{ "success": false, "error": "Nota é obrigatória quando o motivo é \"Outro\"", "code": "nota_obrigatoria_outro" }
```

### 4.4 Move to `perdido` with `motivoCodigo: 'outro'` and a note — success

Request:
```json
{ "stage": "perdido", "motivoCodigo": "outro", "motivo": "Ficha duplicada, contactar para confirmar" }
```

Response `200`: same shape as §4.1, `perdido.motivoCodigo === 'outro'`, `perdido.motivo` populated.

### 4.5 Out-of-enum `motivoCodigo` — error

Request:
```json
{ "stage": "perdido", "motivoCodigo": "nao_existe" }
```

Response `400` (Zod, before reaching the service):
```json
{ "success": false, "error": "motivoCodigo: Invalid enum value..." }
```

### 4.6 Every other transition — unchanged

`PATCH .../stage` to any non-`perdido` destination (`novo`, `em_conversa`, `qualificado`, `agendado`) behaves exactly as before — `motivoCodigo`/`motivo` are simply ignored if present in the body.

---

## 5. Requirements / Business Rules

- **R1.** `LEAD_MOTIVO_VALUES` has exactly 8 members: `preco`, `horario`, `concorrencia`, `pesquisando`, `localizacao`, `sem_resposta`, `nao_e_lead`, `outro`.
- **R2.** `Lead.perdido.motivoCodigo` is **not** a Mongoose `required` field — a pre-existing lost lead with no `motivoCodigo` loads and re-saves without validation errors.
- **R3.** `transitionStage()` rejects a move to `perdido` when `motivoCodigo` is missing or fails the enum check, regardless of whether a `motivo` (note) was supplied — the old "bare `motivo` string is enough" rule is gone.
- **R4.** `transitionStage()` additionally rejects `motivoCodigo: 'outro'` when the trimmed `motivo` is empty/missing.
- **R5.** For every code other than `outro`, the note (`motivo`) stays optional — unchanged 200-char cap.
- **R6.** `motivoCodigo` and `motivo` are only interpreted/persisted when `toStage === 'perdido'`; they are inert on any other transition (mirrors current behavior for `motivo`).
- **R7.** Moving into `perdido` still sets `iaAtiva = false` (unchanged from current behavior) and stamps `perdido.em` server-side (`new Date()` — not client-supplied).
- **R8.** Both new indexes (`{tenantId,createdAt}`, `{tenantId,'perdido.motivoCodigo'}`) exist on the `Lead` collection after model load, verifiable via `Lead.collection.getIndexes()`.
- **R9.** The backfill script defaults to dry-run (no flag / any flag other than `--apply` → no writes); `--apply` is required to write. It prints the resolved MongoDB target (masking credentials, matching the existing scripts' `uri.replace(/\/\/[^@]*@/, '//***@')` convention) before doing anything.
- **R10.** The backfill script is idempotent: re-running `--apply` after a first successful run modifies 0 documents (every candidate already carries `motivoCodigo`).
- **R11.** The backfill script processes tenants independently — a connection failure or write error on one tenant DB aborts *only that tenant* (logged) and the loop continues to the next tenant; it never partial-writes a tenant (each tenant's `updateMany`/`bulkWrite` is a single atomic batch).
- **R12.** Kanban: the confirm button in the "Perdido" modal stays disabled until exactly one of the 8 reasons is selected; selecting `outro` makes the note field required with inline validation, blocking confirmation until non-empty.
- **R13.** All existing multi-tenant isolation guarantees on `PATCH /leads/:id/stage` are preserved — this feature does not touch tenant scoping, only the `perdido`-specific validation branch.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| `stage: 'perdido'` with no `motivoCodigo` | 400 | `{ success:false, error:'Motivo é obrigatório ao marcar como "perdido"', code:'motivo_required' }` |
| `stage: 'perdido'`, `motivoCodigo` not one of the 8 values | 400 | `{ success:false, error:'motivoCodigo: Invalid enum value...' }` (Zod, before the controller) |
| `stage: 'perdido'`, `motivoCodigo: 'outro'`, empty/missing `motivo` | 400 | `{ success:false, error:'Nota é obrigatória quando o motivo é "Outro"', code:'nota_obrigatoria_outro' }` |
| Lead not found / belongs to another tenant | 404 | `{ success:false, error:'Lead não encontrado' }` (unchanged — no 403 leak) |
| Invalid `stage` value (not in `LEAD_STAGES`) | 400 | unchanged — existing `invalid_stage` handling |
| Disallowed transition for non-admin role | 400 | unchanged — existing `invalid_transition` handling |
| Backfill: target tenant DB unreachable | script exits that tenant's iteration | logs `❌ Tenant <id>: <error>`, continues with the next tenant, never partial-writes |
| Backfill: re-run after a completed `--apply` | script reports 0 modified | `alreadyMigrated` bucket equals the full lost-leads count; 0 in the other two buckets |
| Backfill without `--apply` | script writes nothing | prints per-tenant candidate counts only, exits 0 |

---

## 7. Testing Strategy

`tests/lead-loss-reasons.test.js` (Jest ESM + supertest + `mongodb-memory-server`; no external services to mock — this feature has none).

**Acceptance (from PRD §9 F01 + design §9):**
- `rejects move to "perdido" with no motivoCodigo` — POST/PATCH → 400, `code: 'motivo_required'`, no persistence.
- `rejects out-of-enum motivoCodigo` — PATCH with `motivoCodigo: 'inexistente'` → 400 (Zod), no persistence.
- `rejects motivoCodigo: "outro" without a note` — PATCH → 400, `code: 'nota_obrigatoria_outro'`, no persistence.
- `accepts motivoCodigo: "outro" with a note` — PATCH → 200, `perdido.motivoCodigo === 'outro'`, `perdido.motivo` persisted.
- `accepts any non-"outro" motivoCodigo without a note` — PATCH `motivoCodigo: 'preco'` (no `motivo`) → 200.
- `persists motivoCodigo, em and the optional note together` — PATCH `motivoCodigo: 'preco'` + `motivo` → 200, all three fields present in the response and re-fetched from the DB.
- `a pre-existing lost lead with no motivoCodigo still loads and saves without validation errors` — seed a `Lead` directly (bypassing the service) with `status:'perdido'`, `perdido.motivo` set, no `motivoCodigo`; `PUT /leads/:id` (unrelated field update) → 200, no Mongoose validation error.
- `both new indexes exist after model load` — `Lead.collection.getIndexes()` includes `tenantId_1_createdAt_-1` and `tenantId_1_perdido.motivoCodigo_1` (or equivalent generated names).
- Backfill script (invoked as a function export, not spawned as a subprocess, for testability): `dry-run prints per-tenant counts and writes nothing`; `--apply sets motivoCodigo:'outro' on legacy free-text lost leads and preserves the note`; `--apply clears the note to null for the literal 'sem motivo'`; `second --apply run changes 0 documents (idempotent)`.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot move Tenant A's lead to "perdido" (with a valid motivoCodigo) — 404, no cross-tenant write` — extends the existing generic isolation coverage in `tests/lead-multitenant.test.js` (which already checks a plain `em_conversa` move) with the new `motivoCodigo`-carrying payload specifically.

**Existing test to update (not new, but affected):**
- `tests/lead-crud.test.js` → `'exige motivo ao mover para "perdido"'` (currently asserts `{ stage:'perdido', motivo:'Sem orçamento' }` alone succeeds) must be updated: that payload should now return 400 (missing `motivoCodigo`); a new assertion with `{ stage:'perdido', motivoCodigo:'preco', motivo:'Sem orçamento' }` replaces it for the success case.

**Frontend (manual/Playwright, per contract §C — exercised by `implement-feature`/`evaluator`, not Jest):**
- Dragging a lead to "Perdido" with no reason selected keeps the confirm button disabled; no request is sent.
- Selecting "Outro" without a note shows an inline validation error and blocks confirmation.
- Selecting any other reason (no note) enables confirmation immediately.
