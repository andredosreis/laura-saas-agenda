# F07 — Data Subject Erasure & Anonymization · Contract (GWT)

> Consolidated 2026-07-20 with [../RECONCILIATION.md](../RECONCILIATION.md) R5/R7/R9 — the previous contract predated the multi-collection erasure scope and still logged the request as a `politica_privacidade` withdrawal. **Terminology (R9):** the operation is legally *pseudonymization*; code identifiers keep their names.

## C1 — Erasure request (grace path) opens a PedidoTitular, withdraws dados_saude and marks the client
- **GIVEN** an authenticated `admin` and a valid client in the tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar` with no body (or `{ "confirmar": false }`)
- **THEN** it returns 200 with `pendingDeletion: true` and `deletionRequestedAt` set
- **AND** exactly one `PedidoTitular` exists — `tipo: 'apagamento'`, `estado: 'recebido'`, `prazoLimite ≈ request + 1 month` (Art. 12(3))
- **AND** exactly one `ConsentLog` entry is appended — `tipo: 'dados_saude'`, `accao: 'withdrawn'`, `actor: 'funcionario'`, `evidencia` referencing the pedido — so the F01 `estadoAtual` yields `withdrawn` (the R4 clinical gate closes during grace)
- **AND** the client is **not** yet anonymized (`anonimizado: false`).

## C2 — Immediate pseudonymization on explicit confirmation
- **GIVEN** an authenticated `admin` and a valid client in the tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar` with `{ "confirmar": true }`
- **THEN** it returns 200 with `anonimizado: true`
- **AND** the `PedidoTitular (apagamento)` is `estado: 'concluido'` and the `ConsentLog (dados_saude, withdrawn)` entry is appended
- **AND** erasure completes without any F08 job running.

## C3 — Pseudonymization clears PII and clinical fields
- **GIVEN** a client with name, phone, email, birth date and anamnesis fields populated
- **WHEN** anonymization runs (via `confirmar: true` or `anonimizarCliente`)
- **THEN** `nome` becomes `'[anonimizado]'`, `telefone` becomes `'ANON-<clienteId>'`, `email` is `null`, `dataNascimento` is `null`, every anamnese/clinical field is empty/false, `historicoMensagens` is cleared, and `anonimizado` is `true`.

## C3b — Erasure covers the R5/R9 universe
- **GIVEN** a client with a `Conversa`+`Mensagem` thread (their telefone), a pre-conversion `Lead` (same telefone), a `HistoricoAtendimento`, an `Agendamento` with `observacoes` and another with embedded `leadData`, and `Transacao`/`Pagamento` docs with `observacoes`
- **WHEN** `anonimizarCliente` runs
- **THEN** the `Conversa`/`Mensagem` docs are **hard-deleted**; the `Lead` is anonymized in place (`ANON-<leadId>` telefone, null email); `HistoricoAtendimento` free-text/clinical fields are empty while the skeleton (datas, `servico`, `satisfacaoCliente`, `status`) remains; `Agendamento.observacoes` is empty and `leadData` is anonymized while `dataHora`/`status`/refs remain; `Transacao.observacoes`/`Pagamento.observacoes` are empty while `descricao`, amounts, dates and references remain
- **AND** another client's conversa/lead/histórico in the same tenant is untouched.

## C4 — Fiscal records preserved (de-identified), never hard-deleted
- **GIVEN** a client with `Transacao` and `Pagamento` records
- **WHEN** the client is anonymized
- **THEN** all `Transacao`/`Pagamento` records still exist with their amounts, dates and references intact
- **AND** they are de-identified (the `Cliente` they reference is anonymized; embedded `Pagamento.dadosMBWay.telefone` is scrubbed)
- **AND** no fiscal document is deleted.

## C5 — Reusable, idempotent anonymization service (Provided to F08)
- **GIVEN** the `anonimizarCliente(models, tenantId, clienteId)` service
- **WHEN** it is called twice for the same client
- **THEN** the first call anonymizes and the second is a no-op (no error, single anonymized state, no duplicate work).

## C6 — Unique telefone index respected
- **GIVEN** two distinct clients in the same tenant
- **WHEN** both are anonymized
- **THEN** each gets a distinct `ANON-<clienteId>` token and no duplicate-key error occurs against `{tenantId, telefone}`.

## C7 — ObjectId and existence validation
- **GIVEN** an invalid `:id`, or a `clienteId` that does not exist in the caller's tenant
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar`
- **THEN** invalid id → 400, unknown client → 404, and no `PedidoTitular`, no `ConsentLog` entry and no anonymization occur.

## C7b — Idempotent re-request
- **GIVEN** a client already `anonimizado`
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar` again
- **THEN** it returns 200 with the current state and appends no second `PedidoTitular`/`ConsentLog` and re-scrubs nothing.

## C8 — Admin-only role gate
- **GIVEN** a `recepcionista`, `gerente` or `terapeuta` token
- **WHEN** `POST /api/v1/gdpr/clientes/:id/apagar`
- **THEN** it returns 403
- **AND GIVEN** an `admin` (or `superadmin`) token, the request is accepted.

## C9 — Tenant isolation
- **GIVEN** a Tenant B token (or `anonimizarCliente` called with Tenant B's id)
- **WHEN** requesting erasure / anonymization of a Tenant A client
- **THEN** it returns 404 (never 403), Tenant A's client is never modified, and no entry is written.

## Prerequisites (the evaluator must ensure these exist)
- **F01 implemented (v2, R7)**: `gdpr` module mounted, `ConsentLog` v2 (`actor`/`evidencia`/`textoHash`) + `record()` and the `estadoAtual` helper available in the tenant registry.
- `mongodb-memory-server` test environment (no replica set / transactions needed for F07 — every erasure step is idempotent by design).
- A seeded `Cliente` (with anamnesis fields) plus the full R5/R9 universe in the acting tenant: `Transacao`/`Pagamento` (with `observacoes`), `Conversa`+`Mensagem` (client's telefone), a `Lead` with the same telefone, a `HistoricoAtendimento`, and `Agendamento` docs (one with `observacoes`, one with embedded `leadData`); JWT/auth test helper for roles (`admin`, `gerente`, `recepcionista`, `terapeuta`).
- External services (email/OpenAI/Evolution) mocked per `.claude/rules/testing.md`.
