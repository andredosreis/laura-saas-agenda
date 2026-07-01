# F05 — Backend Availability Enforcement · Eval Report

**Feature:** F05 (ADR-028 Fase 4) — enforcement de disponibilidade em todos os caminhos vivos de booking + override admin registado.
**Evaluated:** 2026-07-01 · **Branch:** `feat/F05-availability-enforcement` (commit `c0b5bd7`, draft PR #54)
**Contract:** `./contract.md` · **Spec:** `./spec.md` · **Método:** Harness Engineering (evaluator, verificação independente)
**Verdict:** ✅ **10 passed · 0 failed · 0 indeterminate** (+4 checks adversariais extra, todos pass)

> F05 é **backend-only** (D7): sem UI, o contrato é 100% exercível por testes determinísticos (Jest ESM + supertest + `mongodb-memory-server` — **zero toque em produção**). Evidências em `./evidence/`.

---

## 1. Gates determinísticos

| Gate | Comando | Resultado |
|---|---|---|
| ESLint (backend) | `npm run lint` | ✅ **0 erros** (4 warnings pré-existentes em `scripts/maintenance/`, alheios a F05) |
| Automated tests | `npm test` | ✅ **472/472** em 55 suites — inclui a nova `agendamento-enforcement.test.js` (12) e as 4 suites antigas de agendamento sem regressão |

Evidência: `evidence/gates.txt`, `evidence/full-suite.txt`.

## 2. Verificação do contrato (C1–C10)

Suite `tests/agendamento-enforcement.test.js` (12 testes, re-corrida pelo evaluator — `evidence/enforcement-tests.txt`):

| # | Critério | Classificação | Teste |
|---|---|---|---|
| **C1** | Fora de horas sem override → 400 + razão, nada criado | ✅ passed | `C1` (20:30 num dia 09–18 → 400 'Horário fora da disponibilidade configurada.', count 0) |
| **C2** | Em horas → 201, `encaixe.forcado:false` | ✅ passed | `C2` (15:00 → 201) |
| **C3** | Data `fechado` → 400 mesmo com dia base activo | ✅ passed | `C3` ('O salão está fechado nesta data.', count 0) |
| **C4** | Override admin → 201 + `encaixe` registado server-derived | ✅ passed | `C4` (forcado:true, motivo round-trip, `autorizadoPor` = userId do JWT, `autorizadoEm` set) |
| **C5** | Override por gerente/recepcionista → 403, nada criado | ✅ passed | `C5` (ambos os roles → 403 'Apenas um admin…') |
| **C6** | Paridade com a fonte única; `horas-extra` abre janela sem override | ✅ passed | `C6` (pausa 12:00 → 400; 20:00 na janela 19–22 da excepção → 201 sem override) |
| **C7** | Override não ultrapassa conflito de slot | ✅ passed | `C7` (admin + forcarEncaixe na mesma dataHora exacta → 400 'Já existe um agendamento…', pré-check sequencial) |
| **C8** | Sem Schedule → permissivo (201) | ✅ passed | `C8` (rollout não-destrutivo) |
| **C9** 🔴 | Isolamento multi-tenant do enforcement | ✅ passed | `C9` (fechado de A: A → 400, B → 201 no mesmo wall-clock — sem fuga) |
| **C10** | Rotas internas da IA enforced, **sem override** | ✅ passed | 3 testes: lead (fora → 400 `fora_disponibilidade` **com `forcarEncaixe:true` ignorado**; fechado → 400; em horas → 201) · cliente (fora → 400; em horas → 201) · cliente sem Schedule → permissivo |

### Isolamento multi-tenant (obrigatório — `.claude/rules/multi-tenant.md`)
✅ C9 presente e a passar; todas as leituras do enforcement são tenant-scoped via `resolveAvailableSlots({ tenantId })`; as rotas internas usam `getModels(getTenantDB(tenantId))`.

## 3. Checks adversariais do evaluator (além da suite do implementer)

`evidence/adversarial-checks.txt` — 4/4 pass (teste temporário, removido após captura):

- **A1 — mass-assignment:** enviar `encaixe: {...}` no body → **400** (Zod `.strict()` rejeita a chave; count 0). O registo do override é inviolável pelo cliente.
- **A2 — `motivoEncaixe` > 280** → **400 `{ success:false }`** (validate.js pré-handler, como especificado §6).
- **A3 — `superadmin`** também pode forçar encaixe (201 + registado) — spec R4.
- **A4 — roles de criação inalterados:** recepcionista continua a criar bookings normais em horas (201) — o gate é só no *override*.

## 4. Decisões de implementação verificadas (divergências documentadas do plano)

1. **Enforcement corre DEPOIS dos checks de conflito** (o plano dizia antes): preserva as mensagens/códigos legados — `'Já existe um agendamento…'` (400 pré-check) e `409 slot_taken` (corrida) que o ia-service trata. C7 confirma a semântica. Sem isto, 3 suites antigas quebravam a semântica de conflito.
2. **Permissivo = nenhum dia `isActive:true`** (o spec dizia "no Schedule"): o `initializeSchedules` cria 7 docs **inactivos** quando alguém abre a página Disponibilidade — contá-los como "configuração" bloquearia todos os bookings de tenants que apenas espreitaram a página. Alinha com o bloco comentado original (`Schedule.exists({ tenantId, isActive: true })`).
3. **Fix de 4 suites antigas** (`dataFutura()`): `'T14:00:00-03:00'` = 18:00 Lisboa no verão (fim do expediente — agora corretamente rejeitado); passou a `'T14:00:00'` zone-less (14:00 Lisboa, slot válido em qualquer estação). Alteração de teste, não de comportamento.

## 5. Itens pendentes de verificação humana

**Nenhum critério do contrato.** Mas a **ativação** é deliberadamente humana (draft PR #54):
- ☐ Corrigir **Domingo 00:00–18:00** no painel da Laura
- ☐ Confirmar **Segunda inativa** com a Laura (senão a recepção leva 400 ao marcar segundas)
- ☐ Marcar PR #54 ready + merge → auto-deploy liga o enforcement

## 6. Artefactos
- Este relatório + `evidence/{gates,enforcement-tests,full-suite,adversarial-checks}.txt`
- Suite de contrato: `tests/agendamento-enforcement.test.js`

---

**Conclusão:** os 10 critérios do contrato passam deterministicamente, com verificação independente + 4 checks adversariais. F05 está **done** como código; a *ativação em produção* é o merge do PR #54 (gesto humano, com a checklist acima).
