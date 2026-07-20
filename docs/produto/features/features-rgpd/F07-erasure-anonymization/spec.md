# F07 — Data Subject Erasure & Anonymization — Spec

**PRD:** `docs/produto/PRD-privacidade-consentimento.md` (F07)
**Complexity:** moderate
**Module:** `src/modules/gdpr/` (extends F01) + `src/models/Cliente.js` (new fields) — backend, tenant-scoped
**Depends on:** F01 (Consent Logging Foundation — `gdpr` module scaffolding, `ConsentLog` model + `ConsentLog.record()`)

---

## 1. Scope

> **🔗 Reconciliation ([../RECONCILIATION.md](../RECONCILIATION.md), R5 + R9) — authoritative:** `anonimizarCliente` covers, beyond `Cliente`: hard-delete of `Conversa`+`Mensagem` (by the client's telefone), in-place anonymization of matching `Lead` docs, scrub of `HistoricoAtendimento` free-text/clinical fields, **and (R9, 2026-07-20) scrub of `Agendamento.observacoes` + embedded `Agendamento.leadData`, `Transacao.observacoes` and `Pagamento.observacoes`** (free notes are not fiscal elements; `Transacao.descricao` kept — matriz Q8). `LidCapture` self-expires (7-day TTL, documented only); R2 archive (ADR-026) + backups handled organizationally in `rgpd-conformidade.md`.
> **R9 also:** F07 owns the **`PedidoTitular`** model (DSR lifecycle — consumed by F06); the erasure request writes a `PedidoTitular (tipo: 'apagamento')` + a `ConsentLog (dados_saude, withdrawn)` — the v1 `ConsentLog (politica_privacidade, withdrawn)` is superseded.
> **⚠️ Terminologia (R9):** o que este serviço executa é **pseudonimização** no sentido do RGPD (EDPB — o registo continua ligável via `_id`/refs e continua a ser dado pessoal). Os identificadores de código (`anonimizarCliente`, `anonimizado`) mantêm-se, mas DPA/política/documentação legal devem dizer "pseudonimização/de-identificação irreversível de PII", nunca prometer anonimização.

**Included:**
- New `Cliente` fields (tenant DB): `anonimizado` (bool), `pendingDeletion` (bool), `deletionRequestedAt` (date).
- New reusable service `src/modules/gdpr/gdprService.js` exporting **`anonimizarCliente(models, tenantId, clienteId)`** — replaces PII + ALL clinical/anamnese fields with anonymized tokens/empty, sets `anonimizado = true`, and **preserves financial records** (`Transacao`/`Pagamento`) de-identified (fiscal retention overrides erasure). Per **R5**, the same service also erases/anonymizes the client's footprint in `Conversa`/`Mensagem`/`Lead`/`HistoricoAtendimento` (see §3).
- New model **`PedidoTitular`** (tenant DB, R9): `{ tenantId, clienteId, tipo: 'apagamento'|'acesso'|'portabilidade'|'rectificacao', estado: 'recebido'|'em_execucao'|'concluido'|'recusado', origem, registadoPor, prazoLimite (request date + 1 month, Art. 12(3)), timestamps }` — the DSR record, registered in `getModels`; **consumed by F06** (which records access/portability requests) and by F08 (marks grace-path `apagamento` requests `concluido`).
- `POST /gdpr/clientes/:id/apagar` (admin only) — registers an erasure request: writes one `PedidoTitular (tipo: 'apagamento')` (`estado: 'recebido'` on the grace path; `'concluido'` on the immediate path) **plus** one `ConsentLog (dados_saude, withdrawn, actor: 'funcionario', evidencia: 'Pedido de apagamento <pedidoId>')` — closing the R4 clinical gate during grace — and marks `pendingDeletion`/`deletionRequestedAt`. On explicit admin confirmation (`confirmar: true`), runs `anonimizarCliente` **immediately**.
- Extends the existing `gdpr` module from F01 (controller + routes + Zod schemas); the route is mounted via the F01 `['/gdpr', gdprRoutes]` entry already in `apiResources` (dual-mount `/api` + `/api/v1`), behind `authenticate`, tenant-scoped.

**Provides (to later features):**
- `anonimizarCliente(models, tenantId, clienteId)` — the anonymization service consumed by **F08** (Automated Retention Anonymization) to anonymize retention-expired and grace-elapsed clients.

**Deferred (other features):**
- The **weekly BullMQ job** that processes path (b) — clients with `pendingDeletion = true` whose grace period elapsed, plus retention-expired clients — is **F08**. F07 only stamps `pendingDeletion`/`deletionRequestedAt` and exposes the service; it never schedules a job.
- Frontend "Apagar cliente" confirmation UI is out of scope for this backend feature.

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `src/models/Cliente.js` | edit | Add `anonimizado` (Boolean, default false), `pendingDeletion` (Boolean, default false), `deletionRequestedAt` (Date, default null). |
| `src/models/PedidoTitular.js` | new | DSR record (R9): tipo/estado/origem/registadoPor/`prazoLimite` + `statics.abrir()`/`concluir()`; index `{ tenantId, clienteId, createdAt: -1 }` + `{ tenantId, estado, prazoLimite }`; exports schema (registry) + default model. |
| `src/models/registry.js` | edit | register `PedidoTitular` in `getModels`. |
| `src/modules/gdpr/gdprService.js` | new | `anonimizarCliente(models, tenantId, clienteId)` — single write point for anonymization; idempotent; preserves fiscal records. **Provided to F08.** |
| `src/modules/gdpr/gdprConfig.js` | new | `export const GRACE_PERIOD_DAYS = 30` (configurable default grace period; consumed by F08). `[Auto-Accept]` |
| `src/modules/gdpr/gdprController.js` | edit | Add `apagarCliente` (request erasure: validate client, write `ConsentLog withdrawn`, mark fields or anonymize immediately on `confirmar`). |
| `src/modules/gdpr/gdprRoutes.js` | edit | Add `POST /clientes/:id/apagar` with `authorize('admin')` + `validate`. |
| `src/modules/gdpr/gdprSchemas.js` | edit | Add `apagarClienteSchema` (body: `{ confirmar?: boolean }`). |
| `tests/gdpr-erasure.test.js` | new | integration tests (Jest + supertest + mongodb-memory-server). |

Pattern references: `src/models/Cliente.js` (PII + clinical/anamnese fields), `src/models/{Transacao,Pagamento}.js` (fiscal — preserved), `src/models/ConsentLog.js` + `ConsentLog.record()` (from F01), `src/modules/gdpr/` (F01 module to extend), `src/middlewares/auth.js` (`authenticate`/`authorize`), `src/middlewares/validate.js`.

---

## 3. Data Model — `Cliente` additions (tenant DB)

```js
// appended to clienteSchema in src/models/Cliente.js
anonimizado:         { type: Boolean, default: false },
pendingDeletion:     { type: Boolean, default: false },
deletionRequestedAt: { type: Date,    default: null  },
```

- No new index required for F07 reads (lookup is by `_id` + `tenantId`). F08 will add `{ tenantId, pendingDeletion, deletionRequestedAt }` when it queries grace-elapsed clients — out of scope here.
- All three default to a "not requested / not anonymized" state for existing documents; no backfill migration needed.

**Fields anonymized by `anonimizarCliente` (PII + clinical):**
- PII: `nome` → `'[anonimizado]'`, `telefone` → `'ANON-<clienteId>'` (preserves `{tenantId, telefone}` unique index), `email` → `null` (sparse unique), `dataNascimento` → `null`, `observacoes` → `''`.
- Clinical/anamnese (all fields in the `--- CAMPOS DA FICHA DE ANAMNESE ---` block): string fields → `''`, boolean fields → `false`, enum strings → `''`. Also clears `historicoMensagens` (free-text conversation history holds PII).
- Flags: `anonimizado = true`. (`pendingDeletion` cleared to `false`, `deletionRequestedAt` left as-is for audit.)

**Preserved (fiscal — never anonymized/hard-deleted):**
- `Transacao` documents: kept as-is. `Transacao.cliente` is a plain ObjectId ref → automatically de-identified because the referenced `Cliente` is now anonymized. Amounts, dates and references retained for fiscal retention.
- `Pagamento` documents: kept. Embedded direct PII `dadosMBWay.telefone` is scrubbed (set to `''`/undefined) — `[Auto-Accept]`; amounts/dates/references retained.

**Erasure scope beyond `Cliente` (Reconciliation R5, 2026-07-07)** — the export (F06) lists these collections as the client's personal data, so erasure covers the same universe. `anonimizarCliente` captures the client's `telefone` **before** scrubbing the `Cliente` doc, then:
- **`Conversa` + `Mensagem`** (matched by `{ tenantId, telefone }`; `Mensagem` also via the `conversa` ref): **hard-deleted**. WhatsApp content is PII and frequently contains health data the client typed; not fiscal — deletion is the clean Art. 17 outcome.
- **`Lead`** with the same `telefone` (pre-conversion remnant): anonymized in place — `nome = '[anonimizado]'`, `telefone = 'ANON-<leadId>'` (respects the `{tenantId, telefone}` unique index), `email = null`. Pipeline stats survive.
- **`HistoricoAtendimento`** (`{ tenantId, cliente }`): free-text/clinical fields scrubbed to `''`/`[]` — `queixaPrincipal`, `expectativas`, `sintomasRelatados`, `restricoes`, `resultadosImediatos`, `reacoesCliente`, `orientacoesPassadas`, `proximosPassos`, `observacoesProfissional`, `fotosAntes`, `fotosDepois`. Skeleton kept for aggregate stats: datas, `servico`, `tecnicasUtilizadas`/`produtosAplicados`/`equipamentosUsados`, `intensidade`, `satisfacaoCliente`, `status`.
- **`Agendamento`** *(R9, 2026-07-20)* (`{ tenantId, cliente }` **and** `{ tenantId, 'leadData.telefone': telefone }`): scrub `observacoes` → `''` and the embedded `leadData` block (`nome = '[anonimizado]'`, `telefone = 'ANON-<agendamentoId>'`, `email = null`) — appointments created pre-conversion carry the person's identity inline. Skeleton (dataHora, status, servico, refs) kept.
- **`Transacao.observacoes`** and **`Pagamento.observacoes`** *(R9)*: scrubbed to `''` (free notes, not fiscal elements). **`Transacao.descricao` is kept** — invoice item description, treated as fiscal; final word campo-a-campo = matriz Q8. Amounts/dates/references untouched (R6 unchanged).
- **`LidCapture`** (shared DB, diagnostic): no code — docs auto-expire via the existing 7-day TTL index.
- **Out of the service's reach (documented in `docs/operacoes/rgpd-conformidade.md`):** archived conversation objects in R2 (ADR-026) must be deleted for the erased client in the archive sweep; encrypted backups age out within the documented rotation window (erased data disappears by backup expiry, not rewrite).

---

## 4. API Contracts

Mounted at `/api/gdpr` and `/api/v1/gdpr` (via the F01 `gdpr` router); requires `authenticate`. Tenant context via `req.tenantId` / `req.models`.

### POST /gdpr/clientes/:id/apagar — request erasure (admin only)
- `authorize('admin')` (PRD: "the action bundles/affects clinical data" — admin only; `superadmin` bypasses).
- `:id` validated as ObjectId; client must exist in `req.tenantId`.

Request body (optional):
```json
{ "confirmar": false }
```
- `confirmar: false` (default) → **path (b)**: open `PedidoTitular (tipo: 'apagamento', estado: 'recebido', prazoLimite: +1 mês)`, write `ConsentLog (dados_saude, withdrawn, evidencia: 'Pedido de apagamento <pedidoId>')` (closes the R4 gate during grace), set `pendingDeletion = true`, `deletionRequestedAt = now`. Anonymization happens later via F08, which then marks the pedido `concluido`.
- `confirmar: true` → **path (a)**: open the `PedidoTitular`, write the same `ConsentLog (dados_saude, withdrawn)`, run `anonimizarCliente` **immediately**, mark the pedido `concluido` (erasure works without F08).

Response `200`:
```json
{ "success": true, "data": {
  "_id": "665...", "anonimizado": true,
  "pendingDeletion": false, "deletionRequestedAt": "2026-06-26T..."
} }
```
- For path (b) the same shape returns `anonimizado: false`, `pendingDeletion: true`.

**Notes**
- Server derives `tenantId`/`registadoPor`/`ip`/`actor`/`textoHash` for the `ConsentLog` (never from body), reusing F01's `ConsentLog.record()`; `evidencia` is auto-filled with the `PedidoTitular` reference (satisfying F01 R8 without asking the admin twice — the pedido IS the evidence).
- ~~The withdrawal entry uses `tipo: 'politica_privacidade'`~~ — **superseded by R7/R9 (2026-07-20)**: the entry is `tipo: 'dados_saude'`, `origem: 'painel'`, `actor: 'funcionario'`; the request itself is the `PedidoTitular`, not a consent event.

---

## 5. Requirements / Business Rules

- **R1.** *(updated R9, 2026-07-20)* `POST /gdpr/clientes/:id/apagar` always writes exactly one **`PedidoTitular (tipo: 'apagamento')`** (the DSR record, with `prazoLimite` Art. 12(3)) and exactly one `ConsentLog (dados_saude, withdrawn, actor: 'funcionario', evidencia: pedido ref)` (immutable, via F01 `record()`) — closing the R4 clinical gate while data is retained.
- **R2.** Path (b) — without `confirmar`: sets `pendingDeletion = true` and `deletionRequestedAt = now`; does **not** anonymize. The F08 job (deferred) completes it after `GRACE_PERIOD_DAYS`.
- **R3.** Path (a) — `confirmar: true`: anonymizes immediately via `anonimizarCliente`; erasure does not depend on F08.
- **R4.** `anonimizarCliente(models, tenantId, clienteId)` replaces all PII + clinical/anamnese fields with anonymized tokens/empty and sets `anonimizado = true`. It is the single write point and is **idempotent** (already-anonymized client → no-op, no duplicate work).
- **R5.** `telefone` is set to a per-client unique token (`ANON-<clienteId>`) so the `{tenantId, telefone}` unique index is never violated; `email` is set to `null` (sparse unique).
- **R6.** Fiscal records (`Transacao`, `Pagamento`) are **never hard-deleted** and **never lose fiscal data** (amounts/dates/references); they are de-identified via the anonymized `Cliente` ref (+ scrubbing embedded `dadosMBWay.telefone`). Fiscal retention overrides erasure.
- **R7.** The client must exist within `req.tenantId`; otherwise 404 (cross-tenant client also → 404, never 403). Invalid ObjectId → 400.
- **R8.** Erasure request/anonymization is restricted to `admin` (`superadmin` bypasses via `authorize`); other roles → 403.
- **R9.** `anonimizarCliente` operates only on tenant-scoped queries (`{ _id, tenantId }` / `{ tenantId, telefone }` / `{ tenantId, cliente }`); it never touches another tenant's data.
- **R10.** *(Reconciliation R5 + R9)* `anonimizarCliente` also: hard-deletes the client's `Conversa`/`Mensagem` docs, anonymizes matching `Lead` docs, scrubs `HistoricoAtendimento` free-text/clinical fields (skeleton kept for stats), scrubs `Agendamento.observacoes` + embedded `Agendamento.leadData`, and scrubs `Transacao.observacoes`/`Pagamento.observacoes` (`descricao` kept — fiscal, matriz Q8) — all in the same tenant DB, telefone captured before the `Cliente` scrub. Idempotency (R4) extends to these steps (re-run finds nothing left to delete/scrub and no-ops).
- **R11.** *(R9)* The DSR lifecycle lives in `PedidoTitular`: `recebido` (grace path) → `concluido` (immediate path now; grace path when F08 completes it). F06 reuses this model for access/portability requests. Terminology: docs/DPA describe the outcome as **pseudonimização** (EDPB), never "anonimização" in the legal sense.

**UX flow:** triggered from the client record ("Apagar cliente" → confirm). F07 is the backend; the panel button/modal is deferred. Cross-tenant access returns 404.

---

## 6. Error Handling

| Scenario | Status | Body |
|---|---|---|
| Invalid ObjectId in `:id` | 400 | `{ success:false, error:'ID inválido' }` |
| Client not found in tenant (or other tenant) | 404 | `{ success:false, error:'Cliente não encontrado' }` |
| `apagar` by non-admin role | 403 | `{ success:false, error:'Sem permissão...' }` (via `authorize`) |
| Attempt to hard-delete fiscal data | n/a | Not exposed — only anonymization of PII is performed; fiscal records retained. |
| No token / invalid token | 401 | handled by `authenticate` |
| Unexpected | 500 | `{ success:false, error:'Erro interno' }` |

---

## 7. Testing Strategy

`tests/gdpr-erasure.test.js` (Jest ESM + supertest + `mongodb-memory-server`; external services mocked per `.claude/rules/testing.md`).

**Acceptance (from PRD §9 F07, updated for R9):**
- `requesting erasure opens a PedidoTitular + writes a dados_saude withdrawal and sets the flags` — `POST .../apagar` (no `confirmar`) → 200, flags set, exactly one `PedidoTitular (apagamento, recebido, prazoLimite ≈ +1 mês)` and one `ConsentLog (dados_saude, withdrawn, actor: funcionario, evidencia ≠ null)`; the F01 `estadoAtual` now yields `withdrawn` (R4 gate closes).
- `on explicit admin confirmation, anonymization runs immediately and the pedido concludes` — `confirmar: true` → `anonimizado = true`, PII + clinical fields cleared, pedido `estado: 'concluido'`.
- `anonymization replaces PII and clinical fields and sets anonimizado = true` — assert `nome`, `telefone` (now `ANON-<id>`), `email` (null), `dataNascimento` (null), and every anamnese field cleared.
- `Transacao/Pagamento records are preserved (de-identified)` — seed fiscal docs; after anonymize they still exist with amounts/dates intact; `Pagamento.dadosMBWay.telefone` scrubbed.
- `a hard-delete of fiscal data is never performed` — fiscal counts unchanged after anonymize.
- `invalid id → 400` and `unknown client → 404`.

**Service-level (`anonimizarCliente`):**
- `is idempotent` — calling twice does not error and leaves a single anonymized state.
- `respects the unique telefone index` — two anonymized clients in the same tenant get distinct `ANON-<id>` tokens; no duplicate-key error.
- `deletes the client's Conversa/Mensagem docs` (R10) — seed a conversa + mensagens with the client's telefone; after anonymize, both are gone; another client's conversa in the same tenant is untouched.
- `anonymizes a matching Lead` (R10) — seed a lead with the same telefone; after anonymize, `nome/telefone/email` are scrubbed with the `ANON-<leadId>` token; pipeline `status` preserved.
- `scrubs HistoricoAtendimento free-text but keeps the skeleton` (R10) — seed a histórico; after anonymize, `queixaPrincipal`/`observacoesProfissional`/fotos are empty while `servico`/`dataAtendimento`/`status` remain.
- `scrubs Agendamento.observacoes + leadData and Transacao/Pagamento.observacoes` (R10/R9) — seed an appointment with `observacoes` + a pre-conversion appointment with `leadData` (same telefone) + fiscal docs with `observacoes`; after anonymize all those free-text/identity fields are empty/anonymized while `dataHora`/amounts/`descricao` remain.

**Integration / isolation (mandatory — `.claude/rules/multi-tenant.md`):**
- `Tenant B cannot request erasure of Tenant A's client` → 404 (never 403), no entry written.
- `anonimizarCliente never anonymizes a client from another tenant` (wrong `tenantId` → no-op/404-equivalent).
- `recepcionista/gerente/terapeuta are blocked from POST .../apagar` → 403; `admin` allowed.

**Cross-feature note (verified in F08):** F08 consumes `anonimizarCliente` and the `pendingDeletion`/`deletionRequestedAt` flags to complete grace-elapsed erasures and retention anonymization. Not tested in F07.

---

## 8. Assumptions / Decisions

- **`[Auto-Accept]` Erasure endpoint role = `admin` only.** PRD F07 says "authenticated, admin"; the action affects clinical data, so `authorize('admin')` (not `gerente`). `superadmin` bypasses.
- **`[Auto-Accept]` Two-path trigger = `confirmar` boolean in body.** PRD describes "explicit admin confirmation" (immediate) vs default grace path but doesn't name the parameter. Chosen: `{ confirmar?: boolean }`, default `false` → grace path; `true` → immediate `anonimizarCliente`.
- **`[Auto-Accept]` Anonymization token format.** `nome = '[anonimizado]'`, `telefone = 'ANON-<clienteId>'` (per-client unique to satisfy `{tenantId, telefone}` index), `email = null`, `dataNascimento = null`, clinical strings → `''`, clinical booleans → `false`, `historicoMensagens` cleared. Chosen for human-readable, collision-free, index-safe tokens.
- **`[Auto-Accept]` Grace-period config location.** `GRACE_PERIOD_DAYS = 30` lives in `src/modules/gdpr/gdprConfig.js` (module-level constant, consumed by F08). The per-tenant retention/grace override belongs to F08 (`Tenant.configuracoes`), so F07 only stamps `deletionRequestedAt` and does not evaluate elapsed time.
- **`[Auto-Accept]` No DB transaction for the erasure request.** Mirrors F01's "no replica set / transactions needed" stance for `mongodb-memory-server`. Ordering: open `PedidoTitular` + append `ConsentLog (withdrawn)` first (audit guaranteed), then anonymize. *(Updated for R5+R9)* `anonimizarCliente` is multi-collection but every step is **idempotent** (delete-if-exists / scrub-if-present), so a partial failure is safe to re-run (by the admin or the F08 job) instead of requiring a cross-document transaction. Step order: capture telefone → delete `Conversa`/`Mensagem` → anonymize `Lead` → scrub `HistoricoAtendimento` → scrub `Agendamento` (observacoes + leadData) → scrub `Transacao`/`Pagamento` observacoes + `dadosMBWay.telefone` → scrub `Cliente` **last** (the `anonimizado = true` flag is only set when the rest succeeded, so a re-run re-enters the earlier steps).
- **`[Auto-Accept]` Fiscal de-identification depth.** `Transacao`/`Pagamento` are preserved with all fiscal fields. `Transacao.cliente` (ObjectId ref) is de-identified automatically via the anonymized `Cliente`. Embedded direct PII `Pagamento.dadosMBWay.telefone` is scrubbed (no longer needed post-payment); amounts/dates/references retained for tax-retention law.
- **`[Auto-Accept]` Idempotency over conflict.** Re-running erasure on an already-`anonimizado` client returns `200` with current state and does **not** append a second `withdrawn` entry, a second `PedidoTitular`, nor re-scrub — chosen over `409` to keep the operation safe to retry (and safe for the F08 job to reuse).
- ~~**`[Auto-Accept]` Withdrawal entry `tipo: 'politica_privacidade'`**~~ — **superseded by R7/R9 (2026-07-20)**: the entry is `tipo: 'dados_saude'`, `origem: 'painel'`, `actor: 'funcionario'`, `evidencia` auto-filled with the `PedidoTitular` reference; the request itself is the `PedidoTitular`, not a consent event.
