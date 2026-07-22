# F02 — Recovery Report API — Spec

**PRD:** `docs/produto/PRD-recuperacao-leads.md` (F02) · Design: `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` (§5, §6.1, §6.4, §6.5)
**Complexity:** medium
**Module:** `src/modules/leads/` (existing) — backend, tenant-scoped

---

## 1. Scope

**Prerequisite — F01 must be implemented first.** As of this writing (2026-07-22) the codebase does **not** yet have the fields this feature reads: `src/modules/leads/pipelineConstants.js` has no `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES`, and `src/models/Lead.js`'s `perdido` sub-document has only `{ motivo, em }` (no `motivoCodigo`), with no `recuperacao` sub-document at all. F02 cannot be implemented or tested until F01 lands:
- `Lead.perdido.motivoCodigo` — enum of 8 codes (`preco`, `horario`, `concorrencia`, `pesquisando`, `localizacao`, `sem_resposta`, `nao_e_lead`, `outro`), not Mongoose-`required`.
- `Lead.recuperacao.{ contactadoEm, contactadoPor, resultado }` — written later by F05's `PATCH /leads/:id/recuperacao`, but the sub-document and its 30-day exclusion semantics must already exist for F02 to read.
- Two new indexes: `{ tenantId: 1, createdAt: -1 }` and `{ tenantId: 1, 'perdido.motivoCodigo': 1 }`.
- `LEAD_MOTIVOS_PERDA` / `LEAD_MOTIVO_VALUES` exported from `pipelineConstants.js`.

**Included:**
- `GET /api/v1/leads/recuperacao` — a read-only reporting endpoint over the existing `Lead` collection. No new persisted state; every "cold"/"esfriado" classification is computed at read time from `status` + `ultimaInteracao`, never written back to the document.
- New pure service `src/modules/leads/recuperacaoService.js` — filters in, `{ resumo, leads }` out. No `req`/`res` coupling (mirrors `leadService.js`).
- Query params: `de`, `ate` (arrival-period filter), `grupo` (`perdidos` | `esfriados` | `todos`, default `todos`), `motivoCodigo`, `origem`, `page`, `limit` (default 20, clamped to 100 — never rejected, see §5 R9).
- New constants in `pipelineConstants.js`: `LEAD_COLD_THRESHOLD_DAYS` (14, per-tenant constant — see Assumption A1) and `LEAD_COLD_STAGES` (`['novo', 'em_conversa', 'qualificado']`).

**Input contract — consumed from F01 (per Cross-Feature Integration in PRD §9):**
- `perdido.motivoCodigo`, `perdido.motivo` (note), `perdido.em` — used to build the "lost" branch of the recoverable set and the `porMotivo` breakdown.
- `recuperacao.contactadoEm` — used for the 30-day contact cool-off exclusion (written later by F05, but the field and its semantics are defined by F01).
- `status`, `ultimaInteracao` (pre-existing fields) — used to derive the "cold" branch.

**Output contract — provided to later features:**
- `resumo` (funnel aggregates) and `leads` (paginated recoverable rows) — consumed as-is by **F04** (Recovery Page UI, strip + breakdown + list) and by **F05** (per-row `telefone`, `nome`, `status` feed the WhatsApp button and the "mark as contacted" action).
- The exact same filter semantics (`de`, `ate`, `grupo`, `motivoCodigo`, `origem`) are reused verbatim by **F03**'s CSV export — F03's acceptance criterion "same filters produce the same row set as F02" depends on `recuperacaoService.js` being the single source of the recoverable-row query (F03 imports it, does not reimplement it).

**Explicitly out of scope for F02** (belongs to sibling features):
- `GET /leads/recuperacao/export.csv` and any CSV serialization — F03.
- The `/leads/recuperacao` frontend page, sidebar entry, summary strip UI, breakdown bars — F04.
- `PATCH /leads/:id/recuperacao`, the WhatsApp `wa.me` link, phone E.164 normalization — F05.
- A cold-threshold configuration UI — registered debt in the PRD (§7 Out of Scope); F02 ships the constant only.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/modules/leads/pipelineConstants.js` | edit | Add `LEAD_COLD_THRESHOLD_DAYS = 14` and `LEAD_COLD_STAGES = Object.freeze(['novo', 'em_conversa', 'qualificado'])`. Consumes (does not define) `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES` added by F01. |
| `src/modules/leads/recuperacaoService.js` | **new** | Pure service. `buildRecoverableFilter(...)`, `getResumo({ Lead, tenantId, de, ate })` (aggregation, §3), `listRecoverableLeads({ Lead, tenantId, filters, page, limit })` (find + count), `serializeLeadRow(leadDoc, { now })`. No `req`/`res`; mirrors `leadService.js`'s style (pure functions receiving injected `models`/`tenantId`). |
| `src/modules/leads/leadSchemas.js` | edit | Add `recuperacaoQuerySchema` (Zod) — see §4. |
| `src/modules/leads/leadController.js` | edit | Add `getRecuperacaoReport` — thin orchestrator: reads the already Zod-validated `req.query`, calls `recuperacaoService.getResumo` + `listRecoverableLeads` in parallel (`Promise.all`), assembles the fixed-contract response. |
| `src/modules/leads/leadRoutes.js` | edit | Insert `router.get('/recuperacao', requirePermission('verLeads'), validate(recuperacaoQuerySchema, 'query'), getRecuperacaoReport)` **immediately before** `router.get('/:id', ...)` — Express would otherwise parse `recuperacao` as `:id` and hand it to `getLead`, which calls `mongoose.Types.ObjectId` casting and 404s/500s. |
| `tests/lead-recuperacao-report.test.js` | new | Integration tests (Jest ESM + supertest + `mongodb-memory-server`) — see §7. |

Pattern references: `src/modules/leads/leadController.js` (`listLeads` — pagination clamp, `Promise.all` for data+count, `req.models`/`req.tenantId`), `src/modules/leads/leadService.js` (pure-service idiom, `LeadError`), `src/controllers/analyticsController.js` (`Lead.aggregate`/`$facet`-style pipelines with Luxon-derived date bounds), `src/modules/financeiro/transacaoController.js` (`DateTime.fromISO(...).setZone('Europe/Lisbon').startOf('day')` / `.endOf('day')` for `de`/`ate`-shaped period filters), `src/middlewares/validate.js` (Express 5 query-getter quirk — already handled by the shared middleware, no special handling needed in this feature).

No new files are needed in `src/models/` — F02 reads fields added by F01; it does not touch `Lead.js`.

---

## 3. Data Model

**No new collections.** F02 is a read-only projection over the existing `Lead` collection (tenant DB). This section documents the aggregation/query shapes and which indexes serve them — all indexes referenced already exist or are added by F01, not by F02.

### 3.1 The "cold" (esfriado) derivation — never persisted

```js
// pipelineConstants.js (added by F02)
export const LEAD_COLD_THRESHOLD_DAYS = 14; // per-tenant constant (Assumption A1)
export const LEAD_COLD_STAGES = Object.freeze(['novo', 'em_conversa', 'qualificado']);
```

```js
const coldCutoff = DateTime.now().setZone('Europe/Lisbon')
  .minus({ days: LEAD_COLD_THRESHOLD_DAYS })
  .toJSDate();

// "is cold" condition — inclusive at the threshold (see §5 R2 for the boundary proof)
{ status: { $in: LEAD_COLD_STAGES }, ultimaInteracao: { $lte: coldCutoff } }
```

Computed fresh on every request from `Lead.status` + `Lead.ultimaInteracao`. Nothing is written to the document — a lead that replies tomorrow updates `ultimaInteracao` (existing `pre('save')` hook in `Lead.js` already does this on any modification) and silently drops out of the derivation on the next read.

### 3.2 `resumo` — aggregation pipeline (single round trip, `$facet`)

Anchored to `Lead.createdAt` (arrival date) — see Assumption A2. Uses the `{ tenantId: 1, createdAt: -1 }` index (F01).

```js
Lead.aggregate([
  { $match: { tenantId, createdAt: { $gte: deStart, $lte: ateEnd } } }, // omitted bounds when de/ate absent
  { $facet: {
      total:       [ { $count: 'n' } ],
      descartados: [ { $match: { 'perdido.motivoCodigo': 'nao_e_lead' } }, { $count: 'n' } ],
      convertidos: [ { $match: { status: 'convertido' } }, { $count: 'n' } ],
      perdidos:    [ { $match: { status: 'perdido', 'perdido.motivoCodigo': { $ne: 'nao_e_lead' } } }, { $count: 'n' } ],
      esfriados:   [ { $match: { status: { $in: LEAD_COLD_STAGES }, ultimaInteracao: { $lte: coldCutoff } } }, { $count: 'n' } ],
      porMotivo:   [
        { $match: { status: 'perdido', 'perdido.motivoCodigo': { $nin: [null, 'nao_e_lead'] } } },
        { $group: { _id: '$perdido.motivoCodigo', total: { $sum: 1 } } },
      ],
  } },
]);
```

`porMotivo` uses the `{ tenantId: 1, 'perdido.motivoCodigo': 1 }` index (F01) in combination with the `$match` on `status`/`createdAt` (no single compound index covers all three predicates — acceptable at current per-tenant lead volumes; a compound `{ tenantId:1, 'perdido.motivoCodigo':1, createdAt:-1 }` index is registered debt if this ever shows up in slow-query logs, not added now — YAGNI).

Post-processing in JS (in `recuperacaoService.getResumo`):
```js
leadsReais    = total - descartados;
taxaConversao = leadsReais > 0 ? round2(convertidos / leadsReais) : 0;
porMotivo     = LEAD_MOTIVO_VALUES
  .filter(codigo => codigo !== 'nao_e_lead')                 // 7 codes, fixed order
  .map(codigo => ({ codigo, label: LEAD_MOTIVOS_PERDA[codigo], total: facetTotals[codigo] ?? 0 }));
```

### 3.3 `leads` — recoverable rows (plain `find`, no aggregation needed)

The "recoverable set" is a plain compound filter, **not** an aggregation — the sort key (`diasParado desc`) is equivalent to `ultimaInteracao asc`, so no computed sort field is needed at the query layer:

```js
const filter = {
  tenantId,
  $or: [
    ...(grupo !== 'esfriados' ? [{ status: 'perdido', 'perdido.motivoCodigo': { $ne: 'nao_e_lead' } }] : []),
    ...(grupo !== 'perdidos'  ? [{ status: { $in: LEAD_COLD_STAGES }, ultimaInteracao: { $lte: coldCutoff } }] : []),
  ],
  $and: [
    { $or: [{ 'recuperacao.contactadoEm': { $exists: false } }, { 'recuperacao.contactadoEm': { $lte: contactCutoff } }] },
  ],
};
if (de || ate) filter.createdAt = { ...(de && { $gte: de }), ...(ate && { $lte: ate }) };
if (origem) filter.origem = origem;
if (motivoCodigo) filter.$and.push(buildMotivoCodigoClause(motivoCodigo, coldCutoff)); // §5 R5

Lead.find(filter).sort({ ultimaInteracao: 1 }).skip(skip).limit(limit);
Lead.countDocuments(filter);
```

Both calls run via `Promise.all` (CLAUDE.md universal rule — never serial). `contactCutoff = now.minus({ days: 30 })`.

Index usage: both `$or` branches share `{ tenantId: 1, status: 1, ultimaInteracao: -1 }` (pre-existing) for the equality-on-`status` + range/sort-on-`ultimaInteracao` access pattern; the `esfriados` branch's `status: { $in: [...] }` is a multi-key equality Mongo can still serve from the same index (acceptable — per-tenant lead volumes are in the hundreds, not millions, per ADR-001's database-per-tenant design). When `origem` is the dominant filter, `{ tenantId: 1, origem: 1, ultimaInteracao: -1 }` (pre-existing) may be selected by the planner instead — either index satisfies correctness; performance tuning is out of scope for this feature's volumes.

### 3.4 Row shape (`serializeLeadRow`)

```js
{
  _id, nome, telefone, origem, status,
  etapaLabel:   LEAD_STAGE_LABELS[status],
  grupo:        status === 'perdido' ? 'perdido' : 'esfriado',
  motivoCodigo: status === 'perdido' ? perdido.motivoCodigo : 'sem_resposta',
  motivoLabel:  LEAD_MOTIVOS_PERDA[motivoCodigo],
  nota:         status === 'perdido' ? (perdido.motivo || null) : null,
  primeiroContacto: createdAt,
  ultimoContacto:   ultimaInteracao,
  diasParado:   Math.floor(now.diff(DateTime.fromJSDate(ultimaInteracao), 'days').days),
  interesse:    interesse || null,
  score:        qualificacao?.score ?? 0,
  jaContactado: Boolean(recuperacao?.contactadoEm),
}
```

---

## 4. API Contracts

### `GET /api/v1/leads/recuperacao` (dual-mounted at `/api/leads/recuperacao` too, per `apiResources`)

Guarded by `authenticate` (router-level, already applied) + `requirePermission('verLeads')`. Every query includes `{ tenantId: req.tenantId }`.

**Query schema** (`recuperacaoQuerySchema`, `src/modules/leads/leadSchemas.js`):
```js
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

export const recuperacaoQuerySchema = z
  .object({
    de: isoDate.optional(),
    ate: isoDate.optional(),
    grupo: z.enum(['perdidos', 'esfriados', 'todos']).optional().default('todos'),
    motivoCodigo: z.enum(LEAD_MOTIVO_VALUES).optional(),
    origem: z.enum(ORIGEM_VALUES).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).optional(), // no upper bound here — clamped in the service (§5 R9)
  })
  .strict()
  .refine((d) => !d.de || !d.ate || d.de <= d.ate, { message: 'de deve ser anterior ou igual a ate', path: ['de'] });
```

**Request example:**
```
GET /api/v1/leads/recuperacao?de=2026-06-01&ate=2026-07-22&grupo=esfriados&motivoCodigo=sem_resposta&origem=whatsapp&page=1&limit=20
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "resumo": {
      "contactosRecebidos": 84,
      "leadsReais": 71,
      "descartados": 13,
      "convertidos": 22,
      "perdidos": 19,
      "esfriados": 30,
      "taxaConversao": 0.31,
      "porMotivo": [
        { "codigo": "preco", "label": "Achou caro", "total": 8 },
        { "codigo": "horario", "label": "Horário não serviu", "total": 3 },
        { "codigo": "concorrencia", "label": "Foi para outro sítio", "total": 2 },
        { "codigo": "pesquisando", "label": "Só estava a pesquisar", "total": 1 },
        { "codigo": "localizacao", "label": "Longe / deslocação", "total": 0 },
        { "codigo": "sem_resposta", "label": "Parou de responder", "total": 5 },
        { "codigo": "outro", "label": "Outro", "total": 0 }
      ]
    },
    "leads": [
      {
        "_id": "66a1f0c2e1b2a3d4e5f6a7b8",
        "nome": "Maria Silva",
        "telefone": "912345678",
        "origem": "whatsapp",
        "status": "qualificado",
        "etapaLabel": "Qualificado",
        "grupo": "esfriado",
        "motivoCodigo": "sem_resposta",
        "motivoLabel": "Parou de responder",
        "nota": null,
        "primeiroContacto": "2026-06-20T09:12:00.000Z",
        "ultimoContacto": "2026-07-05T14:03:00.000Z",
        "diasParado": 17,
        "interesse": "Botox",
        "score": 72,
        "jaContactado": false
      }
    ]
  },
  "pagination": { "total": 49, "page": 1, "pages": 3, "limit": 20 }
}
```

**Response `403`** (missing `verLeads`):
```json
{ "success": false, "error": "Sem permissão para executar esta acção", "requiredPermission": "verLeads" }
```

**Response `400`** (malformed `de`):
```json
{ "success": false, "error": "de: Data inválida (use AAAA-MM-DD)" }
```

---

## 5. Requirements / Business Rules

- **R1.** Cold rule: `status ∈ {novo, em_conversa, qualificado}` AND `ultimaInteracao` older than `LEAD_COLD_THRESHOLD_DAYS` (14). Derived at read time from `status`/`ultimaInteracao`; **never persisted** onto the `Lead` document.
- **R2.** Boundary is inclusive at the threshold: a lead whose `ultimaInteracao` is exactly 13 days ago is **not** cold; exactly 14 days ago **is** cold. Implemented as `ultimaInteracao <= (now - 14 days)`, computed with Luxon in `Europe/Lisbon` — never `new Date()` for the comparison.
- **R3.** Always excluded from the recoverable set, regardless of `grupo`: `status === 'convertido'`; `perdido.motivoCodigo === 'nao_e_lead'`; any lead with `recuperacao.contactadoEm` within the last 30 days.
- **R4.** A lead's 30-day cool-off is evaluated on every request — no state flag, just a live date comparison against `recuperacao.contactadoEm` (F01's field, written later by F05).
- **R5.** `motivoCodigo` filter narrows by the row's **effective** reason: for lost rows, `perdido.motivoCodigo`; for derived-cold rows, the constant `'sem_resposta'`. Filtering by any code other than `sem_resposta` combined with `grupo=esfriados` (or `grupo=todos`) therefore yields zero cold rows by construction — documented behavior, not a bug.
- **R6.** `grupo=perdidos` → only rows with persisted `status: 'perdido'` (excluding `nao_e_lead`). `grupo=esfriados` → only derived-cold rows. `grupo=todos` (default) → the union of both.
- **R7.** `de`/`ate` filter both `resumo` and `leads` against `Lead.createdAt` (arrival date) — the same filter object scopes the whole response (Assumption A2). Absent `de`/`ate` → no lower/upper bound (all-time).
- **R8.** `resumo.taxaConversao = convertidos / leadsReais`, rounded to 2 decimals; `0` when `leadsReais === 0` (never divide by zero). `resumo.porMotivo` always returns all 7 non-`nao_e_lead` codes (0 when a code has no lost leads), in `pipelineConstants.js` insertion order — never omits a code, never includes `nao_e_lead`.
- **R9.** `page`/`limit` are clamped, not rejected: `limit = Math.min(100, Math.max(1, limit ?? 20))`; `page = Math.max(1, page ?? 1)`. A request with `limit=500` returns `pagination.limit === 100` (PRD §9 acceptance) — this is why `recuperacaoQuerySchema.limit` has no Zod `.max()`, unlike `listLeadsQuerySchema` (Assumption A3).
- **R10.** `leads` is sorted `ultimaInteracao asc` (== `diasParado desc`) — the equivalence means no computed field is required at the query layer for sorting.
- **R11.** Every query is scoped `{ tenantId: req.tenantId }`. This is a **listing** endpoint (not a single-resource `:id` lookup) — cross-tenant isolation manifests as an **empty `leads` array and all-zero `resumo`**, never a 403/404 (there is no single "resource" to deny access to).
- **R12.** `requirePermission('verLeads')` guards the route; missing permission → 403 (existing middleware, `src/middlewares/auth.js`).
- **R13.** The route is declared **before** `router.get('/:id', ...)` in `leadRoutes.js` — otherwise Express matches `/recuperacao` against `:id`, and `getLead` fails casting `"recuperacao"` to an `ObjectId`.
- **R14.** `recuperacaoService.js` is pure — receives `{ Lead, tenantId, ...filters }` and returns `{ resumo, leads }`; no `req`/`res`, no direct route awareness (mirrors `leadService.js`). This is what lets F03 reuse it verbatim for CSV rows.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Out-of-enum `grupo`/`motivoCodigo`/`origem` | 400 | `{ success:false, error:'<campo>: Invalid enum value...' }` |
| Malformed `de`/`ate` (not `AAAA-MM-DD`) | 400 | `{ success:false, error:'de: Data inválida (use AAAA-MM-DD)' }` |
| `de` later than `ate` | 400 | `{ success:false, error:'de: de deve ser anterior ou igual a ate' }` |
| `limit=500` (or any value > 100) | 200 | **not an error** — clamped to `pagination.limit: 100` (R9) |
| Missing `verLeads` permission | 403 | `{ success:false, error:'Sem permissão para executar esta acção', requiredPermission:'verLeads' }` |
| No token / invalid token | 401 | handled by `authenticate` |
| Cross-tenant request | 200 | **not an error** — `leads: []`, `resumo` all-zero, `pagination.total: 0` (R11) |
| Unexpected | 500 | `{ success:false, error:'Erro interno ao gerar relatório de recuperação.' }` |

---

## 7. Testing Strategy

`tests/lead-recuperacao-report.test.js` (Jest ESM + supertest + `mongodb-memory-server`; no external services to mock — this feature calls no WhatsApp/OpenAI/SMTP).

**Acceptance (from PRD §9 F02):**
- `returns aggregated resumo with all buckets for the active period` — seed a mix of statuses/`motivoCodigo`/`createdAt`; assert `contactosRecebidos`, `leadsReais`, `descartados`, `convertidos`, `perdidos`, `esfriados`, `taxaConversao` match hand-computed expectations.
- `13 days since ultimaInteracao is not cold; 14 days is cold (boundary)` — two `qualificado` leads at `now - 13d` and `now - 14d`; only the second appears under `grupo=esfriados`.
- `a cold lead that receives a new interaction disappears from the list on the next request` — seed cold (`ultimaInteracao: now - 20d`) → present; update `ultimaInteracao: now` → absent on re-request.
- `leads with motivoCodigo 'nao_e_lead' are excluded from leadsReais/taxaConversao/the list and counted only in descartados` — seed several `nao_e_lead` leads; assert `descartados` matches, `leadsReais`/`taxaConversao` computed on the reduced denominator, and 0 rows for these leads under `grupo=todos`.
- `a lead with recuperacao.contactadoEm 10 days ago is absent; at 40 days it reappears` — two otherwise-identical lost/cold leads differing only in `contactadoEm` age.
- `grupo=perdidos returns only marked-lost leads; grupo=esfriados only derived-cold; porMotivo totals equal the sum of listed lost leads per code (nao_e_lead excluded from the breakdown)` — combined seed across codes; assert row sets per `grupo` and per-code `porMotivo` totals.
- `limit=500 is clamped to 100; pagination object reflects the clamp` — request `limit=500` → `pagination.limit === 100`, no 400.
- `request without verLeads → 403`.
- `motivoCodigo and origem filters narrow the result set independently and combined`.
- `de/ate scope both resumo and the leads list to Lead.createdAt` — leads inside vs. outside the window.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B's token never returns Tenant A's leads in resumo or leads (isolation — empty/zero, never 403)` — seed rich recoverable data for Tenant A, request as Tenant B → `resumo` all-zero, `leads: []`, `pagination.total: 0`.
- `route /leads/recuperacao is matched before /leads/:id` — regression test hitting `GET /leads/recuperacao` with a valid token confirms a 200 (or a query-validation 400), never the `getLead` 500/CastError path.

**Cross-feature note (verified fully once F01/F05 exist, asserted here at the field level):**
- `porMotivo[codigo='preco']` reflects a lost lead's `perdido.motivoCodigo`/`perdido.motivo` written by F01's `transitionStage()` — asserted by seeding the `Lead` document directly with those fields (F01's write path is not re-tested here).
- A `recuperacao.contactadoEm` value (as F05's `PATCH` would write it) is read and excludes the lead for 30 days — asserted by seeding the field directly; F05's PATCH handler itself is out of scope for this test file.

---

## Assumptions / Decisions

- **[Auto-Accept] A1 — Cold threshold as a global constant, not a per-tenant DB field.** PRD/design call it "a per-tenant constant (14 default)" but the Out-of-Scope section explicitly defers "UI for the cold-threshold... starts as a per-tenant constant" — read as: the codebase constant is scoped per tenant *conceptually* (so it can vary later), but today there is no `Tenant.configuracoes.leadColdThresholdDays` field and none is added here (YAGNI — no consumer needs per-tenant variance yet). `LEAD_COLD_THRESHOLD_DAYS = 14` lives in `pipelineConstants.js` as a single value for all tenants; per-tenant override is registered debt, matching the PRD's own framing.
- **[Auto-Accept] A2 — `de`/`ate` anchor on `Lead.createdAt` (arrival date), for both `resumo` and `leads`.** Neither the PRD nor the design doc names the exact field; the design doc's own inline comment on the new index (`índice... filtro do relatório por período de chegada`) is the strongest signal, and using one shared filter object for the whole response (rather than different anchors for `resumo` vs. `leads`) keeps the endpoint's semantics simple and matches "the same query params feed a single endpoint."
- **[Auto-Accept] A3 — `limit` has no Zod `.max()`; clamping happens in the service layer.** `listLeadsQuerySchema` (existing code) uses `z.coerce.number().max(100)`, which would **reject** `limit=500` with 400 — but PRD §9 explicitly requires F02 to **clamp** `limit=500` to 100 (200, not 400). Chose to deviate from the `listLeadsQuerySchema` precedent on this one field to honor the literal acceptance criterion. **Orchestrator reconciliation with F03:** the clamp lives in the **controller** (mirroring `listLeads`'s own `Math.min(100, ...)` line) — `recuperacaoService`'s lister accepts any `limit` unclamped, because F03's CSV export reuses the same service function needing up to 5,001 rows in one call. Do not add a second entry point; do not clamp inside the service.
- **[Auto-Accept] A4 — `porMotivo` excludes `nao_e_lead` entirely.** `nao_e_lead` already has its own dedicated `resumo.descartados` bucket; folding it into `porMotivo` (whose purpose is "why don't real leads close") would double-count noise as if it were a loss reason for a real lead. Acceptance criterion "porMotivo totals equal the sum of **listed lost leads** per code" supports scoping to persisted lost leads only (not derived-cold), see A5.
- **[Auto-Accept] A5 — `porMotivo` counts only persisted `status: 'perdido'` leads, not derived-cold ones.** The design doc separately calls out that cold leads "report reason `sem_resposta`" for **row display** purposes, but the acceptance criterion ties `porMotivo` specifically to "listed lost leads per code" (i.e., `grupo=perdidos`). Folding cold leads' derived `sem_resposta` into the same aggregate would make `porMotivo`'s `sem_resposta` bucket double as both "explicitly recorded as such by staff" and "silently went quiet," which are different signals worth keeping separate (`resumo.esfriados` already reports the latter as its own top-level number).
- **[Auto-Accept] A6 — "Stalled stage" (`etapaLabel`) = the lead's current `status`.** For derived-cold rows this is literally where they're stuck (`novo`/`em_conversa`/`qualificado`), matching the design doc's own example ("Parou de responder em Qualificado"). For lost rows it is `'perdido'` itself — there is no "previous stage" history tracked on the `Lead` document, so no other value is derivable without a schema change (which is not proposed here).
- **[Auto-Accept] A7 — `jaContactado` means "has ever been contacted," not "was contacted within the window."** Since any lead within the 30-day cool-off is excluded from the result set entirely (R3), a row that *does* appear with a non-null `recuperacao.contactadoEm` is, by construction, a **past** (>30-day-old) contact attempt reappearing — `jaContactado: true` flags that history for the UI/CSV rather than duplicating the exclusion logic.
- **[Auto-Accept] A8 — `resumo` uses a single `$facet` aggregation pipeline (not parallel `countDocuments` calls).** The task/PRD explicitly calls for "computed via aggregation pipeline"; a `$facet` keeps it to one round trip and one `$match` stage shared by every sub-count, which is both idiomatic (matches `analyticsController.js`'s existing aggregate usage) and avoids six separate queries.
- **[Auto-Accept] A9 — No new indexes added by F02.** All indexes this feature relies on either already exist (`{tenantId,status,ultimaInteracao}`, `{tenantId,origem,ultimaInteracao}`) or are added by F01 (`{tenantId,createdAt}`, `{tenantId,'perdido.motivoCodigo'}`). A compound index folding all three predicates together is flagged as debt (§3.2) rather than spec'd now, per YAGNI.
