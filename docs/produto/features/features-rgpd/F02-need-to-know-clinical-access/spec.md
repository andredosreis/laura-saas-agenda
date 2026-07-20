# F02 — Need-to-Know Clinical Access Control — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F02)
**Complexity:** moderate
**Module:** `src/modules/clientes/` (edits) + `src/models/AcessoClinicoLog.js` (new) — backend, tenant-scoped

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R1+R2+R4) — authoritative over any conflicting text below:**
> - **R1 (now in scope; pointer corrected 2026-07-19):** minimization also covers the **direct DB read** of `clientes` in `ia-service` — it lives in `services/client_orchestrator.py` (~line 287), NOT in `mongo_reader.py` (which has no `Cliente` read). Its projection (today `{_id, observacoes}`) must stay free of the entire clinical/anamnesis block (same list as the HTTP path), with a regression assertion in the ia-service test suite. The AI never needs clinical data.
> - **R2:** base reads `GET /clientes` and `GET /clientes/:id` strip clinical fields for **ALL** roles. The **single** clinical-read endpoint is `GET /clientes/:id/clinico` (this feature) — permitted roles only (`recepcionista` → 403), writes `AcessoClinicoLog`, and returns `consentimentoSaude` via the F01 helper. **F03 consumes this** (no separate clinical fetch). §4/§5 below predate R2 where they describe clinical fields on the base detail read — follow R2.
> - **R4:** when the F01 helper yields `dados_saude = withdrawn`, `GET /clientes/:id/clinico` **omits the clinical fields for every role** and returns only the consent state (+ date); panel writes to anamnese fields are blocked while withdrawn. `pendente` does **not** block (legacy data stays visible to permitted roles).

**Included:**
- Classify the anamnesis block on `Cliente` as **clinical** (special-category, Art. 9 GDPR) and gate it **role-based**: only `admin`, `gerente`, `terapeuta` (and `superadmin`) may read clinical fields; `recepcionista` never receives them.
- **Server-side enforcement** (projection/transform in the clientes read paths — `getCliente`, `getAllClientes`), not UI-only. For a non-permitted role the base record is still returned; clinical fields are simply omitted.
- New shared module `src/modules/clientes/clinicalFields.js` — single source of truth for the clinical field list + the strip/role helpers, reused by every read path so the rule lives in one place.
- **AI data minimization:** the internal AI path `src/modules/clientes/clienteInternalRoutes.js` (consumed by the Python `ia-service`) must never return clinical/anamnesis fields — they are never sent to OpenAI/Google.
- New model `AcessoClinicoLog` in the **tenant database** (DB-per-tenant via `src/models/registry.js`), **append-only**: records `clienteId`, `userId`, `timestamp` whenever a permitted role reads a client's clinical data (single-client detail / clinical tab open). Bounded retention (~12 months) via a TTL index.

**Provides (to later features):**
- Clinical access decision (whether the current user may read clinical fields) — used by F03 (Clinical Tab gating).
- Clinical read-audit entries (`AcessoClinicoLog`) — written on every permitted clinical read, surfaced/triggered by F03.

**Deferred (other features):** the Clinical tab UI, sensitivity badge and consent-status indicator (F03); writing anamnesis via self-service form (F04); export/erasure of clinical data (F06/F07). F02 is only the access gate + read audit + AI minimization.

**Explicitly out of scope (per PRD §7):** per-assigned-therapist restriction — access is **role-based**, not per-therapist. ~~Direct Mongo reads by the `ia-service` are outside this feature~~ — **superseded by R1 (pointer corrected 2026-07-19)**: the direct `db.clientes` read in `ia-service` (`services/client_orchestrator.py` ~line 287; `mongo_reader.py` has none) IS in F02's scope — keep the projection clinical-free + regression assertion.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/AcessoClinicoLog.js` | new | Mongoose schema (append-only) + `statics.record()` + indexes (incl. TTL); exports `AcessoClinicoLogSchema` (for registry) + default model |
| `src/models/registry.js` | edit | register `AcessoClinicoLog: db.model('AcessoClinicoLog', AcessoClinicoLogSchema)` in `getModels` |
| `src/modules/clientes/clinicalFields.js` | new | `CLINICAL_FIELDS` (the anamnese block), `CLINICAL_ROLES`, `podeLerClinico(role)`, `stripClinicalFields(doc)` — single source of truth |
| `src/modules/clientes/clienteController.js` | edit | `getCliente`/`getAllClientes`: strip clinical fields for **ALL** roles (R2 — base reads never serve clinical, no audit); new `getClienteClinico`: the single clinical read (role gate → 403, `consentimentoSaude` via the F01 helper, R4 withdrawn handling, one `AcessoClinicoLog` per read) |
| `src/modules/clientes/clienteRoutes.js` | edit | add `GET /:id/clinico` (authenticate + permitted roles; `recepcionista` → 403) |
| `ia-service/src/ia_service/services/client_orchestrator.py` | verify + test | R1: the direct `db.clientes` read (~line 287) keeps a clinical-free projection (`{_id, observacoes}` today); add a regression assertion in the ia-service pytest suite |
| `src/modules/clientes/clienteInternalRoutes.js` | edit | confirm/lock down projections so no clinical field can leak toward `ia-service`; route every cliente-returning response through `stripClinicalFields` as a defensive invariant |
| `tests/clientes-clinical-access.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server) |

Pattern references: `src/models/AuditLog.js` (append-only idiom + `statics.record()`), `src/models/Cliente.js` (tenant schema export, anamnese fields at lines 68–89), `src/middlewares/auth.js` (`authenticate`/`authorize`, `req.user.role`, superadmin bypass), `src/middlewares/validate.js`, `src/models/ConsentLog.js` (F01 — append-only tenant model + registry registration).

No `src/app.js` change: `/clientes` and `/api/internal/clientes` are already mounted; F02 changes their response shape and adds the `/:id/clinico` sub-route on the existing clientes router.

---

## 3. Data Model — `AcessoClinicoLog` (tenant DB)

```js
const AcessoClinicoLogSchema = new mongoose.Schema({
  tenantId:  { type: ObjectId, ref: 'Tenant',  required: true, index: true },
  clienteId: { type: ObjectId, ref: 'Cliente', required: true },
  userId:    { type: ObjectId, ref: 'User',    required: true },   // who read (from JWT)
  origem:    { type: String, enum: ['detalhe', 'ficha_clinica'], default: 'detalhe' },
  ip:        { type: String, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });          // append-only: no updatedAt
```

**Append-only enforcement (mirrors `AuditLog`):**
- `updatedAt` disabled; no update/delete routes exposed.
- Single write point: `AcessoClinicoLogSchema.statics.record({...})` → `this.create(...)`.

**Indexes:**
```js
AcessoClinicoLogSchema.index({ tenantId: 1, clienteId: 1, createdAt: -1 }); // who-read-this-client
AcessoClinicoLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });    // reads-by-user
AcessoClinicoLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }); // ~12m TTL
```

**Registry:** add to `getModels(db)` in `src/models/registry.js`:
```js
AcessoClinicoLog: db.model('AcessoClinicoLog', AcessoClinicoLogSchema),
```

### Clinical fields (the anamnese block on `Cliente`, lines 68–89)

`CLINICAL_FIELDS` in `clinicalFields.js`:
```
costumaPermanecerMuitoTempoSentada, alergias, qualAlergia, historicoMedico, qualHistorico,
medicamentosEmUso, qualMedicamento, antecedentesCirurgicos, qualCirurgia,
cicloMenstrualRegular, usaAnticoncepcional, qualAnticoncepcional,
temHipertensao, grauHipertensao, temDiabetes, tipoDiabetes,
temEpilepsia, qualEpilepsia, temMarcapasso, temMetais,
observacoesAdicionaisAnamnese
```
Non-clinical and therefore **not** stripped: `nome`, `telefone`, `email`, `dataNascimento`, `observacoes` (general notes, distinct from `observacoesAdicionaisAnamnese`), `sessoesRestantes`, `pacote`, `ativo`, `iaAtiva`.

`CLINICAL_ROLES = ['admin', 'gerente', 'terapeuta']` (`superadmin` bypasses via the same check as `authorize`).

---

## 4. API Contracts

F02 adds **one new route** (`GET /clientes/:id/clinico`, per R2) and changes the response shape of the existing read paths. All keep the `{ success, data }` contract and stay tenant-scoped (`req.tenantId`); cross-tenant access → 404.

### GET /clientes/:id — single client detail (existing) *(aligned with R2)*
- For **ALL** roles the response `data` is the base record with every `CLINICAL_FIELDS` key omitted (minimization by default). **No** audit entry is written on base reads.
- Client not in tenant (or other tenant) → 404, no audit. Invalid ObjectId → 400.

Response `200` (any role), clinical omitted:
```json
{ "success": true, "data": { "_id": "665...", "nome": "...", "telefone": "...", "email": "..." } }
```

### GET /clientes/:id/clinico — the single clinical-read endpoint (new, per R2)
- `admin`/`gerente`/`terapeuta` (+`superadmin`): returns the `CLINICAL_FIELDS` block **plus** `consentimentoSaude` (the `dados_saude` state + date from the F01 helper — one call serves the whole F03 tab) and appends exactly one `AcessoClinicoLog` entry (`origem: 'ficha_clinica'`).
- `recepcionista` → **403** (role-based, not tenant-based — 403 is correct here per the error-code table).
- **R4:** if `consentimentoSaude` is `withdrawn`, the clinical fields are omitted for every role — response carries only the consent state (+ date); no clinical content. The audit entry is still written (the *attempt* to read is meaningful).
- Client not in tenant (or other tenant) → 404, no audit. Invalid ObjectId → 400.

Response `200` (permitted role, consent granted or pendente):
```json
{ "success": true, "data": { "consentimentoSaude": { "estado": "granted", "data": "2026-07-01T..." },
  "alergias": "...", "historicoMedico": "...", "temDiabetes": false, "...": "..." } }
```
Response `200` (permitted role, consent withdrawn — R4):
```json
{ "success": true, "data": { "consentimentoSaude": { "estado": "withdrawn", "data": "2026-07-05T..." } } }
```

### GET /clientes — list (existing)
- For **all** roles, clinical fields are stripped from every item (list view never renders anamnesis — data minimization). No `AcessoClinicoLog` entries are written for list reads.
- Pagination unchanged (`page`, `limit` ≤ 100, `createdAt: -1`).

### Internal AI path — GET /api/internal/clientes/* (existing, `X-Service-Token`)
- Any response that includes a `Cliente` document is passed through `stripClinicalFields` (defensive invariant) so the payload toward `ia-service` contains **zero** clinical fields. Today's endpoints already project narrow fields (`_id nome telefone`, `_id`); F02 makes the exclusion explicit and regression-tested.

There is **no** route to read, update or delete `AcessoClinicoLog` (append-only; consumed internally / by F03 triggering).

---

## 5. Requirements / Business Rules

- **R1.** Clinical = exactly the `CLINICAL_FIELDS` anamnese block; defined once in `clinicalFields.js` and reused by every read path (no duplicated lists).
- **R2.** *(aligned with Reconciliation R2)* `GET /clientes/:id` and `GET /clientes` strip clinical fields server-side for **ALL** roles; clinical data is served exclusively by `GET /clientes/:id/clinico`, which returns it only to `CLINICAL_ROLES` + `superadmin` (`recepcionista` → 403).
- **R3.** A successful `GET /clientes/:id/clinico` by a permitted role appends **exactly one** `AcessoClinicoLog` entry (`clienteId`, `userId` from JWT, `ip`, `origem: 'ficha_clinica'`). Base reads write none.
- **R3b.** *(Reconciliation R4)* When the F01 helper yields `dados_saude = withdrawn`, `/clinico` omits the clinical fields for every role (consent state only) and panel writes to anamnese fields are rejected (400 with a clear message) until a new F04 submission re-grants or F07 erases. `pendente` does not block.
- **R4.** `GET /clientes` never returns clinical fields (any role) — list minimization; no audit on list.
- **R5.** The internal AI path never returns clinical fields; the payload toward `ia-service` contains no anamnesis data.
- **R6.** `AcessoClinicoLog` is append-only: no update/delete route exists; `updatedAt` is not tracked; single write point is `statics.record()`.
- **R7.** Everything is tenant-scoped: cross-tenant `GET /clientes/:id` → 404 and writes no audit; audit reads/writes are bound to `req.tenantId`.
- **R8.** Audit retention is bounded (~12 months) via a TTL index; expiry is DB-level, not a delete route, so R6's "no delete route" still holds.
- **R9.** The audit write is **best-effort and must not break the read**: if `record()` fails it is logged and the response is still returned (mirrors `AuditLog`'s read-path guidance).

**UX flow:** F02 is the backend gate; the clinical tab, badge and consent status are F03. A therapist opening a client sees clinical fields and the read is logged; a receptionist opening the same client sees the base record without clinical fields.

---

## 6. Error Handling

| Scenario | Status | Body / Behaviour |
|---|---|---|
| Invalid ObjectId in `:id` | 400 | `{ success:false, error:'ID inválido' }` (existing CastError handling) |
| Client not found in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado.' }`; no audit |
| Non-permitted role reads detail/list | 200 | base record without clinical fields — **no error, no leakage** |
| No token / invalid token | 401 | handled by `authenticate` |
| Internal path missing `X-Service-Token` | 401 | handled by `requireServiceToken` |
| Audit `record()` fails on a permitted read | 200 | read still succeeds; failure logged (R9), never surfaced to client |
| Unexpected | 500 | `{ success:false, error:'Erro interno...' }` |

---

## 7. Testing Strategy

`tests/clientes-clinical-access.test.js` (Jest ESM + supertest + `mongodb-memory-server`; mock external services per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F02):**
- `GET /clientes/:id never includes clinical fields for ANY role (R2)` — for `recepcionista` **and** `admin`, assert every `CLINICAL_FIELDS` key is absent, base fields present, and **no** `AcessoClinicoLog` is written.
- `admin/gerente/terapeuta GET /clientes/:id/clinico returns clinical + consentimentoSaude and writes exactly one AcessoClinicoLog` — assert clinical present, `consentimentoSaude` present, `countDocuments` for that client/user == 1 (`origem: 'ficha_clinica'`); `recepcionista` → 403 and no audit.
- `withdrawn consent blocks clinical serving (R4)` — seed latest `dados_saude = withdrawn`; `/clinico` returns only `consentimentoSaude` (no clinical keys) for a permitted role; a panel write to an anamnese field → 400; `pendente` does **not** block.
- `internal AI path returns no clinical fields` — call internal cliente endpoints with `X-Service-Token`; assert no `CLINICAL_FIELDS` key in the payload.
- `read audit cannot be updated or deleted through any route` — assert no PUT/PATCH/DELETE on any `acesso-clinico` path (404/405) and `updatedAt` is not tracked.
- `GET /clientes (list) strips clinical for all roles` — admin + recepcionista lists both omit clinical fields; no audit written.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot read Tenant A's client` → 404, and no `AcessoClinicoLog` is written.
- `AcessoClinicoLog reads/writes are tenant-scoped` — Tenant B never sees Tenant A's audit entries.
- `superadmin reads clinical fields via /clinico` (bypass) → clinical present.
- `audit write failure does not break the read` — stub/force `record()` to reject; permitted `/clinico` read still returns 200 with clinical fields.

**Cross-feature note (verified in later features):** F03 gates the Clinical tab on F02's access decision and triggers the F02 read audit on tab open. Not tested in F02.

---

## 8. Assumptions / Decisions

- **[Auto-Accept]** `GET /clientes` (list) strips clinical fields for **all** roles, not only `recepcionista` — a list view never renders anamnesis, so this is the stronger data-minimization choice and avoids writing N audit entries per page. Clinical data is only ever served by the single-client detail path.
- ~~**[Auto-Accept]** The read audit is written **only on single-client detail reads** (`getCliente`) by permitted roles (`origem: 'detalhe'`)~~ — **superseded by R2 (consolidated 2026-07-19)**: the audit is written only by `GET /clientes/:id/clinico` (`origem: 'ficha_clinica'`); base reads never serve clinical and never audit. `'detalhe'` stays in the enum as reserved.
- **[Auto-Accept]** One audit entry is written per successful permitted `/clinico` read regardless of whether the clinical fields are empty (the fields are present/returned). Under R4 (withdrawn) the entry is still written — the read *attempt* is meaningful.
- **[Auto-Accept]** Audit write is **best-effort / non-blocking**: a `record()` failure is logged and the read still succeeds, following `AuditLog`'s documented read-path posture (avoid denying legitimate clinical access because logging hiccupped).
- **[Auto-Accept]** Bounded retention implemented as a **MongoDB TTL index** (`expireAfterSeconds ≈ 365 days`) rather than a bespoke prune job — simplest reliable mechanism; expiry is DB-level so it does not constitute a delete route.
- **[Auto-Accept]** No HTTP endpoint to read `AcessoClinicoLog` in F02 (PRD defines none); it is append-only storage consumed/triggered by F03. A read endpoint, if needed, gets its own feature/ADR.
- **[Auto-Accept]** Clinical classification = the anamnese block (Cliente.js lines 68–89). `observacoes` (general note) and `dataNascimento` are treated as ordinary PII, **not** clinical, so they remain visible to `recepcionista`; only `observacoesAdicionaisAnamnese` is clinical.
- **[Auto-Accept]** Enforcement is centralized in `clinicalFields.js` (`stripClinicalFields` + `podeLerClinico`) and applied as a response transform on `.lean()`/plain objects, rather than a Mongoose `.select('-...')` per query, so the same rule covers controller and internal paths uniformly.
- ~~**[Auto-Accept]** The `ia-service` Python direct DB access is out of scope for F02~~ — **superseded by Reconciliation R1 (pointer corrected 2026-07-19)**: the direct `db.clientes` read lives in `services/client_orchestrator.py` (~line 287), not `mongo_reader.py`; keeping its projection clinical-free IS in F02's scope (verify + regression assertion in the ia-service pytest suite).
