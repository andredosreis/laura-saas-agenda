# F03 — AI Reads Availability from Schedule · Eval Report

**Feature:** F03 (ADR-028 Fase 2) — a IA lê a disponibilidade do painel (`Schedule` + `ScheduleException`) via um endpoint interno único, em vez das regras hardcoded do `ia-service`.
**Evaluated:** 2026-07-01
**Verdict:** ✅ **PASS** — **9 passed, 0 failed, 0 indeterminate**
**Branch:** `feat/F03-ai-reads-schedule` (worktree isolado)

> F03 é uma feature **backend + microserviço Python cross-service, sem camada de UI**. A verificação do contrato é 100% determinística (testes automatizados); não há itens subjectivos que exijam screenshot/verificação humana. As evidências são o output dos gates e das suites de teste (ver `./evidence/`).

---

## 1. Ambiente

- **Backend (Node ESM):** exercido via Jest + `mongodb-memory-server` (DB em memória, isolada — **nunca produção**). O `app.js` (com o novo mount `/api/internal/disponibilidade`) é importado por todas as suites, provando o wiring.
- **ia-service (Python):** exercido via pytest + `respx` (endpoint HTTP mockado — **sem chamadas cross-service reais**).
- **Migração:** validada exclusivamente contra `mongodb-memory-server`, invocando `seedTenant()` directamente. O CLI **nunca** foi corrido com `--apply` contra o cluster real; adicionalmente tem uma guarda que recusa escritas contra um URI de produção (Atlas) sem `--i-understand-prod`.
- **Segurança:** nenhuma escrita em produção; verificação sem POST/PUT/DELETE contra o backend real.

## 2. Gates determinísticos (Harness)

| Gate | Comando | Resultado |
|---|---|---|
| ESLint (backend) | `npm run lint` | ✅ **0 erros** (4 warnings pré-existentes em `scripts/maintenance/`, alheios a F03) |
| Automated tests (backend) | `npm test` | ✅ **460/460** em 54 suites (inclui a nova `disponibilidade-internal.test.js`, 20 testes) |
| Ruff lint + format (ia-service) | `ruff check .` / `ruff format .` | ✅ **All checks passed** |
| Automated tests (ia-service) | `pytest` | ✅ **44 passed** (a suite F03 `test_find_available_slots.py` = 5/5). 3 falhas pré-existentes em `test_lead_agent.py` são **ambientais** (falta `GOOGLE_API_KEY`) e confirmadas presentes no código original — não regressão de F03. |

Evidência: `./evidence/gates.txt`, `./evidence/backend-tests.txt`, `./evidence/ia-gates.txt`.

## 3. Verificação do contrato (Given/When/Then)

| # | Critério | Classificação | Evidência (teste) |
|---|---|---|---|
| **C1** | Endpoint devolve os mesmos slots que `getAvailableSlots` (paridade via helper partilhado) | ✅ passed | `disponibilidade-internal › C1 — paridade` — compara `data.days[0].slots` com `availableSlots` do endpoint legado para o mesmo tenant/data; booking às 10:00 removido em ambos |
| **C2** | Guarda `X-Service-Token` → 401 (sem header / token errado), fail-closed, sem JWT | ✅ passed | `C2 › sem header → 401`, `C2 › token errado → 401` (corpo `{success:false,error:'Não autenticado'}`) |
| **C3** | Excepções fluem (precedência F02): `fechado` → `slots:[]`; `horas-extra` → janela da excepção | ✅ passed | `C3 — fechado → slots:[] (isException,exceptionType)`, `C3b — horas-extra → slots dentro da janela` |
| **C4** | Empty-but-flagged: tenant sem `Schedule` → 200 `scheduleConfigured:false, days:[]` | ✅ passed | `C4 — tenant sem Schedule → scheduleConfigured:false, days:[] (200)` |
| **C5** | Isolamento multi-tenant: `fechado`/bookings de A não afectam B | ✅ passed | `C5 — isolamento` — A fechado → `[]`; B aberto com slots; booking de A não ocupa 09:00 de B |
| **C6** | A IA lê do endpoint, **não** de `agent_business_rules.py` | ✅ passed | `test_reshapes_endpoint_slots_into_flat_chronological_list` (reshape `[{date,time,weekday,iso}]`) + `test_source_switch_does_not_use_agent_business_rules` (raise se usado) |
| **C7** | Degradação graciosa: erro/timeout/`scheduleConfigured:false` → `[]`, sem excepção | ✅ passed | `test_schedule_not_configured_returns_empty`, `test_endpoint_500_returns_empty_no_exception`, `test_endpoint_timeout_returns_empty_no_exception` |
| **C8** | Migração semeia `Schedule`+`ScheduleException` das regras; dry-run/apply/idempotente/preserve/force/rollback | ✅ passed | 6 testes `C8 ›` — dry-run não escreve; `--apply` mapeia correctamente (Seg 09–19 c/ pausa, Sáb 09–13 sem pausa, Dom fechado; `None→fechado`); re-apply no-op; preserva dia customizado, `--force` sobrepõe; `--rollback` limpa |
| **C9** | Resolução de params: `date` \| `from`/`to` \| `days`; formatos inválidos → 400; tenant desconhecido → 404; plano inactivo → 403 | ✅ passed | `C9 ›` 7 testes — dia único, intervalo inclusivo, janela default (8 dias), `date` inválido → 400, `tenantId` inválido → 400, inexistente → 404, plano inactivo → 403 |

### Isolamento multi-tenant (obrigatório — `.claude/rules/multi-tenant.md`)
✅ Coberto por **C5** (dados de A não vazam para B) e **C9** (tenant desconhecido → **404**, nunca dados de outro tenant). Todas as leituras são tenant-scoped via `resolveTenantContext` → `getModels(getTenantDB(tenantId))`.

## 4. Itens pendentes (verificação humana)

**Nenhum.** F03 não tem UI; todos os 9 critérios são determinísticos e verificados. Não há screenshots aplicáveis.

## 5. Notas / diferenças aceites

- **D12 (documentado):** o filtro de estados unificou no whitelist do Node (`status ∈ ['Agendado','Confirmado']`); o blacklist Python foi retirado. `Realizado`/`Não compareceu` deixam de bloquear slots — impacto prático limitado a datas não-futuras. "Paridade" (R3/C1) = paridade com `getAvailableSlots`, não com o antigo Python. Mudança de comportamento **aceite e documentada**, não regressão silenciosa.
- A migração deve correr (com backup) **antes** de a IA ser virada para a nova fonte, para não regredir comportamento — passo operacional fora do âmbito de código.

## 6. Artefactos

- Eval report: `docs/produto/features/features-disponibilidade/F03-ai-reads-schedule/eval-report.md` (este ficheiro)
- Evidências: `./evidence/gates.txt`, `./evidence/backend-tests.txt`, `./evidence/ia-gates.txt`

---

## 7. Correcções pós-code-review (2026-07-01)

Code review de alto esforço (8 ângulos × verificação adversarial) encontrou e corrigiu:

1. **Migração — `--rollback` era um no-op silencioso** (escritas gated em `apply`). Agora `--rollback` sozinho é dry-run explícito ("junta --apply para desfazer") e `--rollback --apply` desfaz de facto; guard de prod só dispara quando há escrita real.
2. **Migração — seed de excepções sobrepunha dados da dona.** Guarda preserve-customizado adicionada (paridade com os dias-base) + o rollback só remove excepções com a marca `SEED_OBSERVACAO` — nunca excepções criadas no painel.
3. **Migração — dedup preventivo** de duplicados `(tenantId, dayOfWeek)` históricos (o índice único novo não construía com duplicados) + guard de prod endurecido para allowlist local (um túnel/IP directo para prod já não escapa).
4. **`resolveAvailableSlots` — slots passados filtrados para HOJE** (paridade com o guard Python removido no rewire; sem isto a IA propunha 09:00 às 15:00) + guarda contra excepção não-fechado com janela null (slots-fantasma da meia-noite) + queries `Schedule`/`ScheduleException` em paralelo.
5. **`initializeSchedules` — upsert atómico** (`$setOnInsert`): a corrida check-then-act rebentava com E11000 sob o índice único novo.
6. **Endpoint interno — `days=30` devolvia 31 datas** (cap alinhado com MAX_DAYS) e **DST spring-forward engolia o dia `to`** (floor→round no diff).

Gates re-corridos após as correcções: ESLint 0 erros · Jest **460/460** · (Python inalterado).
