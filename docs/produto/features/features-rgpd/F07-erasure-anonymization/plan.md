# F07 — Data Subject Erasure & Anonymization — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

> Consolidated 2026-07-20: the previous plan still described the pre-R5 single-document scope and the pre-R7 `politica_privacidade` withdrawal — both superseded ([../RECONCILIATION.md](../RECONCILIATION.md) R5/R7/R9).

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- **F01 implemented (v2, R7)**: `src/modules/gdpr/` exists (controller + routes + schemas mounted via `apiResources`), `ConsentLog` v2 (`actor`/`evidencia`/`textoHash`) with `record()` registered in `src/models/registry.js`.
- Patterns confirmed: `src/models/Cliente.js` (PII + anamnese fields, `{tenantId, telefone}` unique index), `src/models/{Transacao,Pagamento,Agendamento,Lead,Conversa,Mensagem,HistoricoAtendimento}.js` (erasure universe per spec §3), `src/middlewares/{auth,validate}.js`.

## Phase 1 — Model fields & DSR model
1. **Cliente fields** — Add `anonimizado` (Boolean, default false), `pendingDeletion` (Boolean, default false), `deletionRequestedAt` (Date, default null) to `clienteSchema` in `src/models/Cliente.js`. No index/backfill needed (F08 adds the grace-query index later).
2. **PedidoTitular model (R9)** — Create `src/models/PedidoTitular.js`: tipo (`apagamento|acesso|portabilidade|rectificacao`), estado (`recebido|em_execucao|concluido|recusado`), `origem`, `registadoPor`, `prazoLimite` (+1 mês, Art. 12(3)), timestamps; `statics.abrir()`/`concluir()`; indexes `{ tenantId, clienteId, createdAt: -1 }` + `{ tenantId, estado, prazoLimite }`. Register in `getModels` (`src/models/registry.js`). **Consumed by F06 and F08.**

## Phase 2 — Service + API (extend gdpr module)
3. **Grace config** — Create `src/modules/gdpr/gdprConfig.js` exporting `GRACE_PERIOD_DAYS = 30` (consumed by F08).
4. **Pseudonymization service** — Create `src/modules/gdpr/gdprService.js` with `anonimizarCliente(models, tenantId, clienteId)` (name kept for continuity; the outcome is **pseudonimização** — R9 terminology note in every doc): load `Cliente` by `{ _id, tenantId }`; missing → null (404 upstream); already `anonimizado` → idempotent no-op. Else, capturing `telefone` first, run the idempotent step order from spec §7: delete `Conversa`/`Mensagem` (by telefone) → anonymize matching `Lead` → scrub `HistoricoAtendimento` free-text/clinical (skeleton kept) → scrub `Agendamento.observacoes` + embedded `leadData` (by cliente ref and by `leadData.telefone`) → scrub `Transacao.observacoes`/`Pagamento.observacoes` + `dadosMBWay.telefone` (`descricao` and all fiscal amounts/dates/refs kept) → scrub `Cliente` **last** (PII + anamnese per spec §3, `historicoMensagens` cleared, `anonimizado = true`, `pendingDeletion = false`). Return the updated client. **Provided to F08.**
5. **Validation schema** — Add `apagarClienteSchema` (body `{ confirmar?: boolean }`, default false) to `src/modules/gdpr/gdprSchemas.js`.
6. **Controller** — Add `apagarCliente` to `src/modules/gdpr/gdprController.js`: validate ObjectId (400) and client exists in tenant (404); idempotency guard (already `anonimizado` → 200 current state, no new writes); open `PedidoTitular (tipo:'apagamento', estado:'recebido', prazoLimite:+1 mês)` + append `ConsentLog (tipo:'dados_saude', accao:'withdrawn', origem:'painel', evidencia: 'Pedido de apagamento <pedidoId>')` via `record()` (server-set tenantId/registadoPor/ip/actor/textoHash — R7); if `confirmar` → `anonimizarCliente` + `PedidoTitular.concluir()` (path a); else set `pendingDeletion = true`, `deletionRequestedAt = now` (path b — F08 concludes it). Return the flags per spec §4.
7. **Route** — Add `POST /clientes/:id/apagar` to `src/modules/gdpr/gdprRoutes.js` with `authorize('admin')` + `validate(apagarClienteSchema)`. (Router already dual-mounted via the F01 `['/gdpr', gdprRoutes]` entry in `src/app.js`.)

## Phase 3 — Tests & gates
8. **Tests** — Create `tests/gdpr-erasure.test.js` covering acceptance (grace path: PedidoTitular `recebido` + `dados_saude withdrawn` + flags; immediate `confirmar`: anonymize + pedido `concluido`; PII/clinical cleared; fiscal preserved + no hard-delete; 400/404), service-level (idempotent; unique-telefone; Conversa/Mensagem deleted; Lead anonymized; HistoricoAtendimento scrubbed-with-skeleton; Agendamento observacoes+leadData scrubbed; Transacao/Pagamento observacoes scrubbed with `descricao`/amounts kept — R10), and multi-tenant isolation + admin-only role gate, per spec §7.
8. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
