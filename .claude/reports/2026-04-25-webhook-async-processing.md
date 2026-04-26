# Fix: Webhook ack-first / process-async

**Data:** 2026-04-25
**Severidade:** 🟡 Importante (UX — latência de WhatsApp)
**Origem:** problema reportado pelo utilizador durante revisão da acção #1
**Estado:** Concluída — aguarda commit do utilizador

---

## Agents envolvidos e ordem

1. `orchestrator` — coordena
2. `architect-agent` (mode `propose`) — design do refactor
3. `backend-agent` (mode `execute`) — implementa
4. `quality-agent` (mode `gate`) — regression + decisão

---

## Findings por agent

### architect-agent (mode `propose`) — design do refactor

**Problema confirmado por leitura do código** (`src/modules/ia/webhookController.js:156-268`):

Handler `processarConfirmacaoWhatsapp` é **síncrono inteiro**:
1. Validações 1-4.5 (rápidas, ~20ms)
2. `resolveClienteTenant` — itera todos os tenants (linear scan)
3. `Agendamento.findOne` (~50ms)
4. (se nada) `resolveLeadTenant` — outra iteração linear
5. `agendamento.save()`
6. **`sendWhatsAppMessage` — HTTP call (1-3s, alvo da queixa do utilizador)**
7. `Tenant.findById`
8. **`sendWhatsAppMessage` admin — outra HTTP call (1-3s)**
9. `res.status(200).json(...)` ← Evolution ACK só agora

Tempo total típico com 10 tenants: **5-10s**. Evolution timeout webhook é tipicamente 5s → retry → anti-replay bloqueia → mensagem perdida.

**Padrão proposto:** ack-first, process-async (fire-and-forget após response).

**Vantagens:**
- ACK em ~50ms → Evolution nunca timeout, nunca retry
- `sendWhatsAppMessage` continua a executar mas em background
- Anti-replay (acção #1) continua válido

**Trade-offs:**
- Erros de processamento não voltam na response (Evolution não consome body de qualquer maneira)
- Crash mid-processing perde a mensagem (já acontecia antes)

**Sem necessidade de Redis/BullMQ** — apenas `setImmediate` ou `.catch()` em fire-and-forget.

**Plano de implementação:**

1. Extrair toda a lógica após "ehRespostaConfirmacao check" para função pura assíncrona `processarConfirmacaoAsync({ telefone, mensagem, ehSim, ehNao })`
2. Refactor `delegarParaIA(req, res, ...)` para `delegarParaIAAsync(telefone)` — sem req/res
3. No handler principal, depois de validações: `res.status(200).json(...)` imediato + chamada async com `.catch()` para logging
4. Test: novo teste que verifica response < 1s mesmo com `sendWhatsAppMessage` mockado lento

**Ficheiros a tocar:**
- `src/modules/ia/webhookController.js` — refactor (~80 linhas tocadas, principalmente movimento de código)
- `tests/webhook-async-processing.test.js` — novo teste (~50 linhas)

**Aprovado pelo utilizador para avançar.**

---

### backend-agent (mode `execute`) — implementação

**Operações:**
1. Refactor `processarConfirmacaoWhatsapp`: após validações + `ehRespostaConfirmacao` check, faz `res.status(200)` imediato + chama `processarConfirmacaoAsync()` como fire-and-forget
2. Extrai toda a lógica pós-validação para nova função `processarConfirmacaoAsync({ telefoneNormalizado, mensagem, ehSim, ehNao })` — pura async, sem req/res
3. Refactor `delegarParaIA(req, res, telefone)` → `delegarParaIAAsync(telefone)` — pura async, sem req/res
4. Adiciona `tests/webhook-async-processing.test.js` com 2 cenários

**Padrão fire-and-forget:**
```javascript
res.status(200).json({ success: true, message: 'Mensagem aceite, processando' });

processarConfirmacaoAsync({ telefoneNormalizado, mensagem, ehSim, ehNao })
  .catch(err => console.error('[Webhook] ❌ Erro async:', err));
```

Sentry capta erros automaticamente via instrumentação global. `if (!res.headersSent)` no catch externo previne double-response em casos extremos.

---

### quality-agent (mode `gate`) — regression + decisão

**Tests novos (`tests/webhook-async-processing.test.js`):**

```
PASS tests/webhook-async-processing.test.js
  ✓ responde 200 rapidamente mesmo com sendWhatsAppMessage lento (3s)   151 ms
  ✓ persiste ProcessedMessage mesmo no path async                        40 ms
```

**Métricas chave:**
- Response time COM mock 3000ms: **151ms** (antes seria 3000ms+)
- Validação 4.5 (anti-replay) continua síncrona — ProcessedMessage persiste antes do ack

**Test artifact identificado** (não afecta produção):
```
[Webhook] ❌ Erro async: MongoClientClosedError
```
Causa: teardownTestDB fecha Mongo antes do fire-and-forget async terminar. Em produção, o processo Node não termina entre webhooks → não acontece. Acceptable.

**Regression completa:**
```
Test Suites: 18 passed, 18 total
Tests:       119 passed, 119 total
Time:        28.701 s
```

✅ **119/119 tests pass.** 117 preservados + 2 novos.

**Princípios verificados:**

| Princípio | Estado |
|---|---|
| Test coverage | ✅ 2 testes específicos para o novo padrão ack-first |
| Production data | ✅ Não destrutivo — apenas movimentação de código |
| Multi-tenancy | ✅ resolveClienteTenant + resolveLeadTenant intactos |
| Security | ✅ Validações 1-4.5 mantidas e correm ANTES do ack |
| API contract | ✅ Resposta `{ success: true, message: '...' }` mantém shape |
| ESM imports | ✅ |
| Sem `await` em loop | ✅ |
| Headers already sent prevention | ✅ `if (!res.headersSent)` no catch externo |

---

## Gate Decision

🟢 **PASS**

Princípios cumpridos: ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅
Débito identificado: zero novo

**Vantagem mensurada:** response time reduzido de **~3000ms** para **~150ms** com mock simulando Evolution lento (95% redução).

**Trade-offs aceites:**
- Erros pós-ack não voltam na response (Evolution não consome body, irrelevante)
- Crash mid-processing perde mensagem (já acontecia antes)
- Test artifact de MongoClientClosedError em teardown (não afecta produção)

---

## Ficheiros tocados

```
M  src/modules/ia/webhookController.js                   ~80 linhas refactor
A  tests/webhook-async-processing.test.js                +66 linhas (2 testes)
```

Linhas movidas (não perdidas): toda a lógica que estava após `ehRespostaConfirmacao` check passou para `processarConfirmacaoAsync`. `delegarParaIA(req, res, ...)` virou `delegarParaIAAsync(telefone)`.

---

## Pendências para o utilizador

- [ ] Reviewer humana das alterações (1 ficheiro modificado + 1 novo test)
- [ ] Decisão: commit isolado, ou squash com webhook anti-replay (acção #1) e cleanup (acção #2)?
- [ ] Avançar para acção #3 (frontend testing stack — ADR + tests AuthContext/interceptor/ProtectedRoute)?

## Commit message proposto

```
fix(webhook): ack-first / process-async para latência baixa

Webhook respondia 200 ao Evolution só após processar confirmação inteira
(resolveCliente + sendWhatsAppMessage + admin notify), totalizando 5-10s.
Evolution faz timeout aos 5s → retry → anti-replay (#fix-webhook-replay)
bloqueava → mensagem perdida.

Refactor: ack 200 imediato após validações 1-4.5, processamento corre
fire-and-forget. Latência medida no teste: 151ms vs 3000ms simulado.

- Extrai lógica para processarConfirmacaoAsync() pura
- Refactor delegarParaIA(req, res) → delegarParaIAAsync(telefone)
- Validações 1-4.5 (incl. anti-replay) continuam síncronas antes do ack
- Erros async são logged (Sentry capta)
- Headers-already-sent guard no catch externo

Refs:
- Reportado pelo utilizador durante revisão da acção #1 (anti-replay)
- .claude/reports/2026-04-25-webhook-async-processing.md

Files:
- M src/modules/ia/webhookController.js (~80 linhas refactor)
- A tests/webhook-async-processing.test.js (2 testes)

Tests: 119/119 pass.
Gate: PASS.
```

---

**Estado final:** Concluída — aguarda commit do utilizador.

*Report finalizado pelo orchestrator em 2026-04-26.*
