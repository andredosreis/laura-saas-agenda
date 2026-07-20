# F06 — Data Subject Export (Access & Portability) · Contract (GWT)

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R9 — acesso vs portabilidade, per-collection allowlists, `Lead`+`NoticeReceipt` gathered, one `PedidoTitular` per export.

## C1 — Acesso export bundles all of the client's data (allowlisted)
- **GIVEN** an `admin` token and a client in the caller's tenant with related records (agendamentos, compraPacotes, transações, pagamentos, histórico, conversas, mensagens, a pre-conversion `Lead` with the same telefone) plus consent entries and notice receipts
- **WHEN** `GET /api/v1/gdpr/clientes/:id/export` (default `tipo=acesso`)
- **THEN** it returns 200 with a single document whose `data` contains `cliente` (incl. anamnesis), `agendamentos`, `compraPacotes`, `transacoes`, `pagamentos`, `historico`, `conversas`, `mensagens`, `leads`, `consentHistory` and `noticeReceipts`, each populated from that client's records.

## C1b — Allowlist enforced (no raw dumps)
- **GIVEN** the same export
- **WHEN** the bundle is inspected
- **THEN** no section contains internal/system fields — `etapaConversa`, `historicoMensagens`, `iaAtiva`, `pendingDeletion`, `anonimizado`, `__v` or Conversa state-machine fields are absent everywhere (`exportFields.js` allowlists).

## C1c — Portabilidade export is the narrow Art. 20 slice
- **GIVEN** the same client
- **WHEN** `GET /api/v1/gdpr/clientes/:id/export?tipo=portabilidade`
- **THEN** `data` contains only `meta`, `cliente`, `agendamentos`, `mensagens` and `consentHistory`; `mensagens` include only the titular's inbound messages; no fiscal, staff-note, conversa or lead sections
- **AND** an out-of-enum `tipo` returns 400.

## C1d — Each successful export records one PedidoTitular
- **GIVEN** a successful export of either tipo
- **WHEN** it completes
- **THEN** exactly one `PedidoTitular` exists for that client — `tipo` matching the query, `estado: 'concluido'`, `registadoPor` = caller — and a failed export (400/403/404) records none.

## C2 — Consent history included (F01 cross-feature)
- **GIVEN** a client with F01 `ConsentLog` entries
- **WHEN** the export runs
- **THEN** `data.consentHistory` contains those entries, sorted by `createdAt` desc.

## C3 — Related data resolved by the correct keys
- **GIVEN** the same tenant also has a *different* client (different `_id`, different `telefone`) with their own payments, conversations and messages
- **WHEN** exporting the target client
- **THEN** `data.pagamentos` come only from the target client's transactions, and `data.conversas`/`data.mensagens` come only from the target client's `telefone` — none of the other client's records appear.

## C4 — Admin only (role gate)
- **GIVEN** a `recepcionista`, `gerente` or `terapeuta` token
- **WHEN** `GET /api/v1/gdpr/clientes/:id/export`
- **THEN** it returns 403
- **AND GIVEN** an `admin` (or `superadmin`) token, it returns 200.

## C5 — Invalid id and unknown client
- **GIVEN** an invalid ObjectId, it returns 400 (`ID inválido`)
- **AND GIVEN** a well-formed id that does not exist in the tenant, it returns 404 (`Cliente não encontrado`) with no bundle.

## C6 — Tenant isolation
- **GIVEN** a Tenant B `admin` token and a client id belonging to Tenant A
- **WHEN** `GET /api/v1/gdpr/clientes/:id/export`
- **THEN** it returns 404 (never 403) and no Tenant A data is ever returned.

## C7 — Download envelope & contract shape
- **GIVEN** a successful export
- **WHEN** the response is returned
- **THEN** it follows `{ success: true, data: <bundle> }`, includes `data.meta` (`exportedAt`, `exportedBy` = caller's user id, `tenantId`, `clienteId`, `tipoPedido`, `schemaVersion`), and carries `Content-Disposition: attachment; filename="cliente-<id>-export-<tipo>-<ISO>.json"`.

## C8 — No client-data mutation
- **GIVEN** any export request (including failures)
- **WHEN** it completes
- **THEN** no document in any client-data collection is created, updated or deleted — the **only** write is the single `PedidoTitular` of C1d on success.

## Prerequisites (the evaluator must ensure these exist)
- F01 in place (v2): `gdpr` module mounted (dual `/api` + `/api/v1`); `ConsentLog` + `NoticeReceipt` in `registry.js`.
- **F07 in place (R9)**: `PedidoTitular` model + `abrir()`/`concluir()` registered (F06 records one per export).
- `mongodb-memory-server` test environment (no replica set / transactions needed for F06).
- Seed helpers for a `Cliente` plus related docs (`Agendamento`, `CompraPacote`, `Transacao`, `Pagamento` via transação, `HistoricoAtendimento`, `Conversa`, `Mensagem` incl. inbound/outbound, `Lead` com o mesmo telefone, `ConsentLog`, `NoticeReceipt`) in the acting tenant, and a second tenant for isolation; JWT/auth helper for roles (`admin`, `gerente`, `recepcionista`, `terapeuta`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
