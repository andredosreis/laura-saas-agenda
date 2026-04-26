# Test Audit — Follow-up (verificação dos críticos)

**Data:** 2026-04-25
**Severidade:** 🔴 Crítica (5 críticos a verificar)
**Origem:** Output da skill `test-guide` em `.claude/reports/2026-04-25-test-audit.md`
**Estado:** Concluída — aguarda utilizador

---

## Agents envolvidos e ordem

1. `orchestrator` — coordena verify-before-flag dos 5 🔴 Críticos do test audit
2. `multi-tenant-guard` (audit) — valida #2 (query injection) e #5 (mass assignment updateCliente)
3. `security-agent` (audit) — valida #1 (refresh token reuse) e #4 (webhook anti-replay)
4. `backend-agent` (audit) — valida #3 (plan limit race condition)
5. `quality-agent` (gate) — produz decisão por crítico após verify

---

## Findings por agent

### orchestrator — análise de MELHORIAS.md

**Drift detectado:**
- `MELHORIAS.md` item #6 diz "0% testes activos" mas codebase actual tem **108 tests integration**. Documento desactualizado (datado 2026-02-21, batches 1-3).
- **Acção sugerida:** após validação dos críticos, actualizar MELHORIAS.md item #6 para reflectir baseline real e adicionar débito de cleanup (13 a remover) + gaps prioritizados.

---

### multi-tenant-guard (audit) + security-agent (audit) + backend-agent (audit) — verify-before-flag dos 5 🔴 Críticos

Verificação fez-se via grep no código real. Resultados:

#### Crítico #1 — Refresh token reuse → 🟡 **DOWNGRADE** (não é reuse vulnerability)

**Verificação:** `src/modules/auth/authController.js:354-390`
```javascript
// Line 354-361: confirma que token existe na DB
const tokenExists = user.refreshTokens?.some(rt => rt.token === token);
if (!tokenExists) return res.status(401)...

// Line 379: $pull remove o token usado (rotação)
await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: { token } } });

// Line 380-390: $push novo token
```

**Veredicto:** o token **É rotacionado** após uso. Ataque de "reuse" puro (mesmo token N vezes) não funciona — a partir do 2º uso retorna 401.

**Concerns reais (mais subtis):**
- 🟡 Race condition entre check (354) e $pull (379): 2 requests simultâneos ambos passam o check
- 🟡 `expiresAt` armazenado mas nunca validado — refresh token de >7 dias ainda funciona

**Ficheiro de teste sugerido (revisto):** `tests/auth-refresh-token-edge.test.js`
- Cenário 1: 2× refresh com Promise.all → ambos succeed (race, real concern)
- Cenário 2: refresh com `expiresAt < now()` → deveria retornar 401 mas não retorna

---

#### Crítico #2 — Multi-tenant query injection → ✅ **FALSO POSITIVO**

**Verificação:** grep em `src/`
```
req.query.tenantId    → 0 hits
req.params.tenantId   → 0 hits
req.body.tenantId     → 1 hit em src/middlewares/auth.js:253 (INJECÇÃO de tenantId via JWT, oposto de vulnerabilidade)
```

**Veredicto:** todos os controllers usam `req.tenantId` (set pelo middleware `authenticate` a partir do JWT). Não há leitura de tenantId vinda do utilizador. **Arquitectura está protegida by design.**

**Acção:** remover este finding. Não é necessário escrever teste.

---

#### Crítico #3 — Plan limit race condition → 🟡 **DOWNGRADE** (real mas baixo impacto)

**Verificação:** `src/middlewares/auth.js:164-218` (`checkLimit`)
```javascript
const tenant = await Tenant.findById(req.tenantId);
const limite = tenant.limites[limitType];
count = await Cliente.countDocuments({ tenantId: req.tenantId, ativo: true });
if (count >= limite) return 403;
next();
```

**Veredicto:** count + check + create sem transacção. Em 2 requests simultâneos, ambos podem passar.

**Severidade ajustada:** 🟡 — janela de race é milissegundos, e impacto é "1 cliente a mais que o plano permite", não vulnerabilidade.

**Ficheiro de teste sugerido (mantém):** `tests/plan-limit-race-condition.test.js` — útil para confirmar limite mas não bloqueante.

---

#### Crítico #4 — Webhook anti-replay → 🔴 **CONFIRMADO**

**Verificação:** grep em `src/modules/ia/`
```
key.id / messageId / processedMessages   → 0 hits (excepto 1 console.log em zapi_client.js)
```

**Veredicto:** webhook não armazena IDs de mensagens processadas. Evolution API reenvia mensagens em reconexão → confirmação de agendamento processada 2×.

**Mantém-se 🔴 Crítico.** Único dos 5 originais que sobrevive como confirmed.

**Ficheiro de teste sugerido (mantém):** `tests/webhook-replay-protection.test.js`

---

#### Crítico #5 — Mass assignment updateCliente → ✅ **FALSO POSITIVO**

**Verificação:** `src/modules/clientes/clienteRoutes.js:24` + `clienteSchemas.js`
```javascript
// Route:
router.put('/:id', ..., validate(updateClienteSchema), updateCliente);

// Schema:
export const updateClienteSchema = z.object({
  nome: z.string()...,
  telefone: telefone.optional(),
  email: email.optional()...,
  dataNascimento: z.coerce.date()...,
  // tenantId NÃO declarado
});
```

**Veredicto:** Zod por defeito **strips unknown keys** em `.parse()`. Mesmo que cliente envie `{tenantId: 'outro'}` no body, é silenciosamente removido antes do controller. **Arquitectura está protegida by Zod.**

**Acção:** remover este finding. Não é necessário escrever teste — Zod já garante.

---

### quality-agent (gate) — decisão por crítico verificado

| # | Original | Verificação | Severidade final | Decisão |
|---|---|---|---|---|
| 1 | Refresh token reuse | Token rotacionado, mas race + expiresAt | 🟡 Important | **CONCERNS** — registar em MELHORIAS.md, teste opcional |
| 2 | Query tenantId injection | Code não lê tenantId de input | ✅ False positive | **WAIVED** — não escrever teste |
| 3 | Plan limit race | Real mas baixo impacto | 🟡 Important | **CONCERNS** — teste opcional |
| 4 | Webhook anti-replay | Confirmado real | 🔴 Critical | **FAIL** — escrever teste antes de qualquer outra coisa |
| 5 | Mass assignment updateCliente | Zod strip protege | ✅ False positive | **WAIVED** — não escrever teste |

**Taxa de falsos positivos: 2/5 = 40%** — alta. Justifica retroactivamente o verify-before-flag rule do architect.

---

## Plano de execução revisto (após verify)

Originais 🔴 Críticos backend reduzidos de 5 para **1 confirmado + 2 downgrade**.

**Ordem proposta:**

| # | Acção | Severidade | Agent | Estimativa |
|---|---|---|---|---|
| 1 | Implementar teste anti-replay webhook (Evolution API) — incluir fix se necessário | 🔴 Crítico | backend-agent (execute) → security-agent (regression) → quality-agent (gate) | 1 sessão |
| 2 | Cleanup: remover os 13 tests passthrough/mirror do backend | 🔵 Dívida | backend-agent (execute) → quality-agent (gate) | 1 sessão |
| 3 | Implementar tests para frontend infrastructure (AuthContext, interceptor api.js, ProtectedRoute) — mas antes ADR para escolha Vitest+Playwright | 🔴 Crítico | architect-agent (propose ADR) → frontend-agent (execute) | 2 sessões |
| 4 | Tests 🟡 backend (refresh edge, plan limit race, etc.) — registar em MELHORIAS.md como débito | 🟡 Importante | quality-agent regista | passivo |

**Recomendação ao utilizador:** começar pelo #1 (único 🔴 sobrevivente confirmado).

---

## Ficheiros tocados nesta sessão

Audit/verify é read-only — nenhum ficheiro de produção modificado.

Reports gerados:
```
A  .claude/reports/2026-04-25-test-audit.md            (skill output, sessão anterior)
A  .claude/reports/2026-04-25-test-audit-followup.md   (este — verify + gate)
```

---

## Pendências para o utilizador

- [ ] Aprovar #1 (implementar teste + fix do webhook anti-replay) como próxima acção
- [ ] Confirmar #2 (cleanup dos 13 testes) como segunda acção
- [ ] Decidir sobre #3 (ADR de stack frontend testing antes de implementar) — sim/não
- [ ] Aceitar que #2, #3, #5 (do test audit original) ficam como WAIVED — não vamos escrever teste para falso positivo

## Commit message proposto

```
docs(reports): test audit + verify-before-flag dos críticos

Skill test-guide identificou 5 🔴 Críticos backend.
Verify-before-flag (orchestrator + multi-tenant-guard + security-agent
+ backend-agent) reduziu para:
- 1 confirmado: webhook anti-replay (CONFIRMED)
- 2 downgraded: refresh edge cases, plan limit race (CONCERNS)
- 2 falsos positivos: query injection, mass assignment (WAIVED — Zod
  strip + tenantId via JWT já protegem)

Taxa de falso positivo: 40% — justifica verify-before-flag.

Refs:
- .claude/reports/2026-04-25-test-audit.md (skill output)
- .claude/reports/2026-04-25-test-audit-followup.md (este verify)
```

---

**Estado final:** Concluída — aguarda aprovação do utilizador para acção #1 (webhook anti-replay).

*Report gerado pelo orchestrator em 2026-04-25.*
