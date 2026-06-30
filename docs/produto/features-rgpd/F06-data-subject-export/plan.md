# F06 — Data Subject Export (Portability) — Plan

**Spec:** `./spec.md` · **Complexity:** moderate · **Phases:** 3

## Prerequisites
- Project running locally (backend per `CLAUDE.md` → Environment).
- **F01 implemented**: `src/modules/gdpr/` exists and is mounted via `apiResources` in `src/app.js` (dual-mount `/api` + `/api/v1`); `ConsentLog` registered in `src/models/registry.js` (`req.models.ConsentLog`).
- Patterns confirmed: `src/modules/clientes/clienteController.js` (`req.models`/`req.tenantId`, `findOne({_id,tenantId})`, CastError→400), `clienteSchemas.js` (`clienteIdParamSchema`), `src/middlewares/{auth,validate}.js`.
- Model reference fields verified: `Agendamento.cliente`, `CompraPacote.cliente`, `Transacao.cliente`, `HistoricoAtendimento.cliente`; `Conversa`/`Mensagem` keyed by `telefone`; `Mensagem.conversa`; `Pagamento.transacao`; `ConsentLog.clienteId`.

## Phase 1 — Export service (gather)
1. **Create `src/modules/gdpr/exportService.js`** exporting `gatherClienteExport(models, tenantId, clienteId)`:
   - Resolve anchor: `Cliente.findOne({ _id: clienteId, tenantId }).lean()`; return `null` if not found (controller maps to 404).
   - **Batch 1** (`Promise.all`): `Agendamento`, `CompraPacote`, `Transacao`, `HistoricoAtendimento` by `{ tenantId, cliente: clienteId }`; `ConsentLog` by `{ tenantId, clienteId }` sorted `createdAt:-1`; `Conversa` by `{ tenantId, telefone }`. All `.lean()`.
   - **Batch 2** (`Promise.all`): `Pagamento` by `{ tenantId, transacao: { $in: txIds } }`; `Mensagem` by `{ tenantId, $or: [{ telefone }, { conversa: { $in: conversaIds } }] }`. All `.lean()`.
   - Return the bundle object (`cliente`, `agendamentos`, `compraPacotes`, `transacoes`, `pagamentos`, `historico`, `conversas`, `mensagens`, `consentHistory`). No `await` in any loop.

## Phase 2 — Controller, schema & route
2. **Schema** — In `src/modules/gdpr/gdprSchemas.js`, ensure `clienteIdParamSchema` (`{ id: objectId }`) exists (add if F01 did not, mirroring `clienteSchemas.js`).
3. **Controller** — Add `exportarCliente` to `src/modules/gdpr/gdprController.js`:
   - Call `gatherClienteExport(req.models, req.tenantId, req.params.id)`; if anchor missing → 404 `Cliente não encontrado`.
   - Wrap with `meta` (`exportedAt` now ISO, `exportedBy: req.user._id`, `tenantId: req.tenantId`, `clienteId`, `schemaVersion: 1`).
   - Set `Content-Disposition: attachment; filename="cliente-<id>-export-<ISO>.json"`; respond `200` with `{ success: true, data: bundle }`.
   - `catch`: CastError → 400 `ID inválido`; else 500 `Erro interno`.
4. **Route** — In `src/modules/gdpr/gdprRoutes.js` add:
   `router.get('/clientes/:id/export', authorize('admin'), validate(clienteIdParamSchema, 'params'), exportarCliente);`
   (router already has `router.use(authenticate)` from F01; no `app.js` change — dual-mount inherited).

## Phase 3 — Tests & gates
5. **Tests** — Create `tests/gdpr-export.test.js` covering acceptance (full bundle with consent history, tenant-scoped, invalid id → 400, unknown client → 404), role gate (admin 200; recepcionista/gerente/terapeuta 403), multi-tenant isolation (Tenant B → 404, no cross-tenant docs), and bundle correctness (payments via transactions, conversations/messages via telefone, `Content-Disposition` header), per spec §7.
6. **Gates** — Run `npm run lint` and `npm test` until green; then ready for `/implement-evaluate`.
