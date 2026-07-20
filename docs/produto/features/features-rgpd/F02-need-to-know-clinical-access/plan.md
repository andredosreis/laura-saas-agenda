# F02 — Need-to-Know Clinical Access Control — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- Patterns confirmed: `src/models/AuditLog.js` (append-only + `statics.record()`), `src/models/Cliente.js` (anamnese fields, lines 68–89; tenant schema export), `src/modules/clientes/` (controller/routes/schemas + `clienteInternalRoutes.js`), `src/middlewares/{auth,validate}.js` (`req.user.role`, superadmin bypass, `requireServiceToken`).
- **F01 in place first** — beyond sharing the registry idiom, F02 has a **functional dependency** on F01 since Reconciliation R2/R3: `GET /clientes/:id/clinico` returns `consentimentoSaude` via F01's canonical `estadoAtual` helper and applies R4 (withdrawn blocks clinical). Same wave; implement F01 before F02. *(Supersedes the earlier "no functional dependency" note.)*

## Phase 1 — Model, registry & shared clinical rule
1. **AcessoClinicoLog model** — Create `src/models/AcessoClinicoLog.js` mirroring the `AuditLog` append-only idiom (`timestamps:{createdAt:true,updatedAt:false}`, `statics.record()`, indexes from spec §3 including the ~12-month TTL on `createdAt`). Export `AcessoClinicoLogSchema` (named, for registry) and a default model, as `Cliente.js` does.
2. **Register in tenant registry** — Add `AcessoClinicoLog` to `getModels(db)` in `src/models/registry.js` so it is available as `req.models.AcessoClinicoLog`.
3. **Clinical fields module** — Create `src/modules/clientes/clinicalFields.js` exporting `CLINICAL_FIELDS` (the anamnese block), `CLINICAL_ROLES = ['admin','gerente','terapeuta']`, `podeLerClinico(role)` (true for those roles or `superadmin`), and `stripClinicalFields(doc)` (returns a copy with every clinical key removed; works on plain/`.lean()` objects). Single source of truth, reused by every read path.

## Phase 2 — Enforce in clientes read paths
4. **Base reads strip for ALL roles (R2)** — In `clienteController.js`, `getCliente` returns `stripClinicalFields(record)` for **every** role (base read never serves clinical, writes no audit).
5. **`getAllClientes` minimization** — Map the list through `stripClinicalFields` for all roles (list never serves anamnesis); no audit on list (spec R4).
6. **`GET /clientes/:id/clinico` (R2/R3b/R4)** — New `getClienteClinico` in `clienteController.js` + route in `clienteRoutes.js`: role gate via `podeLerClinico` (`recepcionista` → 403); resolve the tenant-scoped client (cross-tenant → 404); fetch `consentimentoSaude` via F01's `estadoAtual` helper; if `withdrawn` → return only the consent state (+date), zero clinical keys; else return the `CLINICAL_FIELDS` block + `consentimentoSaude` (`pendente` does not block). Append exactly one `AcessoClinicoLog` (`origem: 'ficha_clinica'`, `ip`) — best-effort, wrapped so a logging failure never breaks the read (spec R9); written also in the withdrawn case.
6b. **Write-block while withdrawn (R3b)** — In the cliente update path, reject writes to any anamnese field with 400 (clear message) while the client's `dados_saude` state is `withdrawn`; re-opened only by a new F04 grant or F07 erasure.
6c. **AI path hardening** — In `clienteInternalRoutes.js`, route any response that returns a `Cliente` document through `stripClinicalFields` as a defensive invariant and make the narrow `.select()` projections explicit, so no clinical field can reach `ia-service` (spec R5). Per R1 (pointer corrected 2026-07-19): also verify the direct `db.clientes` read in `ia-service/src/ia_service/services/client_orchestrator.py` (~line 287) keeps a clinical-free projection (`{_id, observacoes}` today) and add a regression assertion in the ia-service pytest suite.

## Phase 3 — Tests & gates
7. **Tests** — Create `tests/clientes-clinical-access.test.js` covering acceptance (base reads strip for **all** roles + no audit, `/clinico` returns clinical + `consentimentoSaude` + exactly one audit, `recepcionista` → 403 on `/clinico`, R4 withdrawn omits clinical + blocks anamnese writes, internal-path no clinical, append-only audit, list strip) and multi-tenant isolation + superadmin bypass + audit-failure-non-blocking, per spec §7.
8. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
