# F06 — Data Subject Export (Access & Portability) — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R9 — acesso vs portabilidade, allowlists, `Lead`+`NoticeReceipt`, `PedidoTitular` audit; the previous "raw full documents, read-only, no audit" plan is superseded.

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- **F01 implemented (v2)**: `src/modules/gdpr/` mounted via `apiResources` (dual-mount); `ConsentLog` + `NoticeReceipt` registered in `src/models/registry.js`.
- **F07 implemented first (R9)**: `src/models/PedidoTitular.js` with `abrir()`/`concluir()` registered in the tenant registry — F06 records one pedido per export.
- Patterns confirmed: `src/modules/clientes/clienteController.js` (`req.models`/`req.tenantId`, `findOne({_id,tenantId})`, CastError→400), `clienteSchemas.js` (`clienteIdParamSchema`), `src/modules/clientes/clinicalFields.js` (the allowlist-module idiom `exportFields.js` mirrors), `src/middlewares/{auth,validate}.js`.
- Model reference fields verified: `Agendamento.cliente`, `CompraPacote.cliente`, `Transacao.cliente`, `HistoricoAtendimento.cliente`; `Conversa`/`Mensagem`/`Lead` keyed by `telefone`; `Mensagem.conversa`; `Pagamento.transacao`; `ConsentLog.clienteId`/`NoticeReceipt.clienteId`.

## Phase 1 — Allowlists + export service (gather)
1. **Create `src/modules/gdpr/exportFields.js`** (R9): `EXPORT_FIELDS` map (collection → allowed keys, per spec §3b — personal data in, internal/system fields out) + `pickExportFields(doc, collection)`. Allowlist semantics: unknown fields are excluded by default.
2. **Create `src/modules/gdpr/exportService.js`** exporting `gatherClienteExport(models, tenantId, clienteId, tipo)`:
   - Resolve anchor: `Cliente.findOne({ _id: clienteId, tenantId }).lean()`; return `null` if not found (controller maps to 404).
   - **`tipo === 'acesso'`** — **Batch 1** (`Promise.all`): `Agendamento`, `CompraPacote`, `Transacao`, `HistoricoAtendimento` by `{ tenantId, cliente: clienteId }`; `ConsentLog` + `NoticeReceipt` by `{ tenantId, clienteId }` sorted `createdAt:-1`; `Conversa` + `Lead` by `{ tenantId, telefone }`. **Batch 2** (`Promise.all`): `Pagamento` by `{ tenantId, transacao: { $in: txIds } }`; `Mensagem` by `{ tenantId, $or: [{ telefone }, { conversa: { $in: conversaIds } }] }`. All `.lean()`.
   - **`tipo === 'portabilidade'`** — gather only `Agendamento`, `ConsentLog`, and inbound `Mensagem` (filter by direction/`fromMe: false`-equivalent field verified at build time), plus the anchor.
   - Project every document through `pickExportFields`; return the bundle (`cliente`, `agendamentos`, …, `leads`, `consentHistory`, `noticeReceipts` — or the narrow portability set). No `await` in any loop.

## Phase 2 — Controller, schema & route
3. **Schemas** — In `src/modules/gdpr/gdprSchemas.js`, ensure `clienteIdParamSchema` exists and add `exportQuerySchema` (`tipo ∈ {acesso, portabilidade}`, default `acesso`).
4. **Controller** — Add `exportarCliente` to `src/modules/gdpr/gdprController.js`:
   - Call `gatherClienteExport(req.models, req.tenantId, req.params.id, tipo)`; anchor missing → 404 `Cliente não encontrado`.
   - Wrap with `meta` (`exportedAt`, `exportedBy: req.user._id`, `tenantId`, `clienteId`, `tipoPedido`, `schemaVersion: 2`).
   - Record `PedidoTitular` (`tipo`, `estado: 'concluido'`, `registadoPor`) — after a successful gather, before responding.
   - Set `Content-Disposition: attachment; filename="cliente-<id>-export-<tipo>-<ISO>.json"`; respond `200` with `{ success: true, data: bundle }`.
   - `catch`: CastError → 400 `ID inválido`; else 500 `Erro interno` (no `PedidoTitular` on failure).
5. **Route** — In `src/modules/gdpr/gdprRoutes.js` add:
   `router.get('/clientes/:id/export', authorize('admin'), validate(clienteIdParamSchema, 'params'), validate(exportQuerySchema, 'query'), exportarCliente);`
   (router already has `router.use(authenticate)` from F01; no `app.js` change — dual-mount inherited).

## Phase 3 — Tests & gates
6. **Tests** — Create `tests/gdpr-export.test.js` covering acceptance (acesso bundle incl. `Lead`/`NoticeReceipt`, allowlist enforced — no `etapaConversa`/`historicoMensagens`/`iaAtiva`/`__v` anywhere; portabilidade narrow slice with inbound-only mensagens; one `PedidoTitular` per successful export, none on failure; invalid id → 400; unknown client → 404; invalid `tipo` → 400), role gate (admin 200; recepcionista/gerente/terapeuta 403), multi-tenant isolation (Tenant B → 404, no cross-tenant docs), and bundle correctness (payments via transactions, conversations/messages/lead via telefone, `Content-Disposition` header), per spec §7.
6. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
