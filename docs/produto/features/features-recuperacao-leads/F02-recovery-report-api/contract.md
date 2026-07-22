# F02 — Recovery Report API · Contract (GWT)

> Derived from `docs/produto/PRD-recuperacao-leads.md` §9 (F02 acceptance criteria + Cross-Feature Integration rows where F02 consumes F01) and the approved design `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` (§5 cold rule, §6.1 endpoint).

## C1 — Resumo returns the full funnel breakdown for the active period
- **GIVEN** a tenant with a mix of leads (real, `nao_e_lead`, converted, lost, cold) created within `de`/`ate`
- **WHEN** `GET /api/v1/leads/recuperacao?de=...&ate=...`
- **THEN** `resumo` returns `contactosRecebidos`, `leadsReais`, `descartados`, `convertidos`, `perdidos`, `esfriados` and `taxaConversao` consistent with the seeded data, plus `porMotivo` (7 fixed codes, `nao_e_lead` excluded).

## C2 — Cold-lead boundary is exact (13 days out, 14 days in)
- **GIVEN** a lead in `novo`/`em_conversa`/`qualificado` with `ultimaInteracao` exactly 13 days ago, and another exactly 14 days ago
- **WHEN** `GET /api/v1/leads/recuperacao?grupo=esfriados`
- **THEN** the 13-day lead is **not** in the response; the 14-day lead **is** — the boundary is computed with Luxon in `Europe/Lisbon`, never `new Date()`.

## C3 — A cold lead that replies exits the list on the next read
- **GIVEN** a lead currently classified as cold (`ultimaInteracao` 20 days ago)
- **WHEN** its `ultimaInteracao` is updated to now and the report is requested again
- **THEN** the lead no longer appears under `grupo=esfriados` or `grupo=todos` — the classification is derived at read time, never a persisted flag.

## C4 — `nao_e_lead` is excluded from the real-lead funnel
- **GIVEN** leads with `perdido.motivoCodigo: 'nao_e_lead'`
- **WHEN** `GET /api/v1/leads/recuperacao`
- **THEN** they appear only in `resumo.descartados`, are excluded from `resumo.leadsReais` and `resumo.taxaConversao`'s computation, and produce **zero** rows in `data.leads` under any `grupo`.

## C5 — Contact cool-off window (30 days)
- **GIVEN** a recoverable lead with `recuperacao.contactadoEm` set 10 days ago, and another set 40 days ago
- **WHEN** `GET /api/v1/leads/recuperacao`
- **THEN** the 10-day lead is absent from `data.leads`; the 40-day lead reappears — this holds regardless of `grupo`.

## C6 — `grupo` filter isolates persisted-lost vs. derived-cold
- **GIVEN** a tenant with both marked-lost leads (`status: 'perdido'`, non-`nao_e_lead`) and derived-cold leads
- **WHEN** `GET /api/v1/leads/recuperacao?grupo=perdidos` and, separately, `?grupo=esfriados`
- **THEN** `grupo=perdidos` returns only the marked-lost rows; `grupo=esfriados` returns only the derived-cold rows; `grupo=todos` (default) returns the union.

## C7 — `porMotivo` totals match the sum of listed lost leads per code
- **GIVEN** several `status: 'perdido'` leads distributed across multiple `motivoCodigo` values (excluding `nao_e_lead`)
- **WHEN** `GET /api/v1/leads/recuperacao?grupo=perdidos` (list) is compared against `resumo.porMotivo` (breakdown) for the same filters
- **THEN** for every code, `porMotivo[codigo].total` equals the count of listed lost leads carrying that code.

## C8 — Pagination: limit is clamped, never rejected
- **GIVEN** any valid request
- **WHEN** `limit=500` is supplied
- **THEN** the response is `200` (not `400`) and `pagination.limit === 100`; the standard `pagination` object (`total`, `page`, `pages`, `limit`) is always present.

## C9 — Permission gate
- **GIVEN** an authenticated user without the `verLeads` permission
- **WHEN** `GET /api/v1/leads/recuperacao`
- **THEN** it returns `403` with `{ success:false, error:'...', requiredPermission:'verLeads' }`, and creates/reads no data.

## C10 — Tenant isolation (empty/zero, never 403/404)
- **GIVEN** a Tenant B token and rich recoverable data belonging to Tenant A
- **WHEN** `GET /api/v1/leads/recuperacao` is called with Tenant B's token
- **THEN** `data.resumo` is all-zero, `data.leads` is `[]`, `pagination.total` is `0` — Tenant A's data is never returned, and the response is `200`, not `403`/`404` (this is a listing endpoint, not a single-resource lookup).

## C11 — Route order (`/recuperacao` before `/:id`)
- **GIVEN** the router as declared in `leadRoutes.js`
- **WHEN** `GET /api/v1/leads/recuperacao` is called
- **THEN** it is handled by `getRecuperacaoReport`, never by `getLead` attempting to cast `"recuperacao"` as an `ObjectId`.

## C12 — F02 ← F01 (loss reason): recorded reason surfaces in the breakdown
- **GIVEN** a lead marked lost with `motivoCodigo: 'preco'` and a note (as F01's `transitionStage()` would write it)
- **WHEN** `GET /api/v1/leads/recuperacao`
- **THEN** it appears in `resumo.porMotivo[codigo='preco']`'s total and, in `data.leads`, its row carries `motivoCodigo: 'preco'` with `nota` equal to the recorded free-text note.

## C13 — F02 ← F01 (contact date): 30-day exclusion reads F05's write
- **GIVEN** a `recuperacao.contactadoEm` value written through F05's `PATCH /leads/:id/recuperacao` (simulated here by seeding the field directly, since F05 is a later feature)
- **WHEN** `GET /api/v1/leads/recuperacao` is called within 30 days of that date
- **THEN** the lead is excluded from `data.leads`; once 30 days elapse, it reappears (same mechanism as C5, restated to make the F01→F02 field dependency explicit).

## Prerequisites (the evaluator must ensure these exist)
- **F01 implemented**: `Lead.perdido.motivoCodigo` (enum, not required), `Lead.recuperacao.{contactadoEm, contactadoPor, resultado}`, `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES` in `pipelineConstants.js`, and the `{tenantId,createdAt}` / `{tenantId,'perdido.motivoCodigo'}` indexes — all as defined in F01's own contract. F02 cannot be evaluated without these.
- `mongodb-memory-server` test environment (no replica set / transactions needed for F02 — read-only feature).
- Seeded `Lead` documents covering every branch (real/`nao_e_lead`, converted, lost-by-code, cold-by-stage, contacted-recent/old) in at least two tenants; JWT/auth test helper for roles and `verLeads` permission on/off.
- No external services to mock (F02 makes no WhatsApp/OpenAI/SMTP calls).
