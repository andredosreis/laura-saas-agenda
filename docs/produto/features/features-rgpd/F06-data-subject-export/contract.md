# F06 — Data Subject Export (Portability) · Contract (GWT)

## C1 — Export bundles all of the client's data
- **GIVEN** an `admin` token and a client in the caller's tenant with related records (agendamentos, compraPacotes, transações, pagamentos, histórico, conversas, mensagens) and consent entries
- **WHEN** `GET /api/v1/gdpr/clientes/:id/export`
- **THEN** it returns 200 with a single document whose `data` contains `cliente` (incl. anamnesis), `agendamentos`, `compraPacotes`, `transacoes`, `pagamentos`, `historico`, `conversas`, `mensagens` and `consentHistory`, each populated from that client's records.

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
- **THEN** it follows `{ success: true, data: <bundle> }`, includes `data.meta` (`exportedAt`, `exportedBy` = caller's user id, `tenantId`, `clienteId`, `schemaVersion`), and carries `Content-Disposition: attachment; filename="cliente-<id>-export-<ISO>.json"`.

## C8 — Read-only
- **GIVEN** any export request (including failures)
- **WHEN** it completes
- **THEN** no document in any collection is created, updated or deleted.

## Prerequisites (the evaluator must ensure these exist)
- F01 in place: `gdpr` module mounted (dual `/api` + `/api/v1`); `ConsentLog` in `registry.js`.
- `mongodb-memory-server` test environment (no replica set / transactions needed for F06).
- Seed helpers for a `Cliente` plus related docs (`Agendamento`, `CompraPacote`, `Transacao`, `Pagamento` via transação, `HistoricoAtendimento`, `Conversa`, `Mensagem`, `ConsentLog`) in the acting tenant, and a second tenant for isolation; JWT/auth helper for roles (`admin`, `gerente`, `recepcionista`, `terapeuta`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
