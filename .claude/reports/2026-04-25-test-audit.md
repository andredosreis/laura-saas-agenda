# Test Audit Report — Marcai

> Output da skill `test-guide` em modo Audit. Phase 1→2→3 conforme protocolo.
> Modo de execução: **Report only** (sem deletar nem gerar scaffolds).

---

## Test Count Overview

| Metric | Count |
|---|---|
| **Total tests in system (backend)** | 108 |
| **Total tests in system (frontend)** | 0 |
| **Tests to remove** | 13 |
| **Projected count after cleanup** | 95 |
| **Test files novos sugeridos (backend)** | 15 |
| **Test files novos sugeridos (frontend)** | 13 |

---

## Project Test Definitions

| Camada | Significado neste projecto |
|---|---|
| **Backend "tests"** | 100% integration tests via Jest + supertest + mongodb-memory-server. Vivem em `tests/`. Ficheiros usam padrão `*.test.js`. Não há unit tests isolados — toda a lógica é exercida via HTTP. |
| **Backend "unit"** | Não usado actualmente. Lógica complexa testada via integration. |
| **Backend "E2E"** | Não usado. Os "integration" tests cumprem o papel de E2E para a API. |
| **Frontend "unit/integration/E2E"** | **Inexistentes.** `@playwright/test` em devDependencies mas sem script `test` no `package.json`. Vitest e @testing-library não instalados. Baseline = 0. |

**Implicação:** introduzir tests frontend é decisão de design (escolher Vitest+RTL para components/hooks + Playwright para E2E).

---

## Summary

- **Test files analyzed:** 16 (backend) + 0 (frontend) = 16
- **Remove:** 13
- **Keep:** 95
- **Missing critical:** 8 (5 backend 🔴 + 5 frontend 🔴 → 8 distintos após dedup conceptual)
- **Missing edge cases:** ~20

---

## Tests to Remove (13)

### tests/auth-validation.test.js
- **rejeita password sem caractere especial**
  - **Category:** validation passthrough
  - **Why:** regra Zod isolada, sem branching de negócio. Já garantido pela lib.
- **rejeita password sem maiúscula**
  - **Category:** validation passthrough
  - **Why:** mesma regra Zod, variant repetition.
- **rejeita email mal formatado**
  - **Category:** validation passthrough
  - **Why:** regex Zod testado pela própria lib.
- **rejeita token formato inválido**
  - **Category:** validation passthrough
  - **Why:** Zod string format check.

### tests/cliente-validation.test.js
- **rejeita telefone com menos de 9 dígitos**
  - **Category:** validation passthrough
  - **Why:** Zod min length isolado.
- **rejeita email mal formatado** (cliente)
  - **Category:** validation passthrough
  - **Why:** mirror test do mesmo regex em outro endpoint.

### tests/cliente.test.js
- **rejeita pedido sem autenticação com 401**
  - **Category:** framework auth passthrough
  - **Why:** middleware `authenticate` já testado em `middlewares.test.js`.
- **cria um cliente e retorna 201**
  - **Category:** wiring test
  - **Why:** apenas verifica que POST→201 sem assertions de behaviour. Sem branching.

### tests/cliente-crud.test.js
- **rejeita ObjectId inválido em GET /:id**
- **rejeita ObjectId inválido em PUT /:id**
- **rejeita ObjectId inválido em DELETE /:id**
  - **Category:** mirror tests + variant repetition without branching
  - **Why:** mesmo middleware `validateObjectId` testado em 3 verbos HTTP. Um teste basta.

### tests/middlewares.test.js
- **remove o header X-Powered-By** (ou similar Helmet assertions)
  - **Category:** framework behavior
  - **Why:** Helmet faz o que promete; testar é redundante.

### tests/dashboard.test.js
- **GET /api/dashboard/<endpoint> → 401 sem token** (loop sobre 8 endpoints)
  - **Category:** variant repetition without branching
  - **Why:** mesmo middleware aplicado a 8 rotas. Um teste cobre todas.

---

## Missing Tests (Priority Order)

### Critical 🔴

#### Backend — 1. Refresh token reuse não invalidado
- **Categoria:** Security
- **Comportamento não testado:** mesmo refreshToken pode ser usado N vezes consecutivas, gerando N access tokens válidos.
- **Evidência:** `src/modules/auth/authController.js` (`generateRefreshToken`) — sem rastreamento de uso.
- **Risco:** session hijacking silencioso. Token roubado vale para sempre até expiração natural.
- **Ficheiro sugerido:** `tests/auth-token-reuse.test.js`
- **Cenários:** refresh 2x consecutivo com mesmo token → 2ª request 401; logout invalida todos os refreshTokens.

#### Backend — 2. Multi-tenant data leakage via query injection
- **Categoria:** Multi-tenancy + Security
- **Comportamento não testado:** GET `/api/clientes?tenantId=outro` — se controller usa query param em vez de `req.user.tenantId`, há leak.
- **Evidência:** verificar todos os controllers. `src/middlewares/validateObjectId.js` valida formato, não injection.
- **Risco:** cross-tenant access via crafted URL.
- **Ficheiro sugerido:** `tests/security-tenant-injection.test.js`
- **Cenários:** GET com `?tenantId=outro` deve ignorar e usar token; POST com `tenantId` no body deve ser rejeitado por Zod (já testado parcialmente).

#### Backend — 3. Plan limit race condition
- **Categoria:** Business logic + Concurrency
- **Comportamento não testado:** dois POST simultâneos passam `checkLimit('maxClientes')` antes de qualquer um persistir.
- **Evidência:** `src/middlewares/requirePlan.js` ou similar — count + create sem lock.
- **Risco:** bypass silencioso de limites de plano.
- **Ficheiro sugerido:** `tests/plan-limit-race-condition.test.js`
- **Cenários:** plano limite=5, 4 existentes, 2 POST `Promise.all` → apenas 1 cria.

#### Backend — 4. Webhook anti-replay (messageId)
- **Categoria:** External integration + Security
- **Comportamento não testado:** Evolution API reenvia mensagens em reconexão; webhook processa 2x a mesma confirmação.
- **Evidência:** `src/modules/ia/webhookController.js` — sem armazenamento de messageIds processados.
- **Risco:** agendamento confirmado duplamente; lógica de funil corrompida.
- **Ficheiro sugerido:** `tests/webhook-replay-protection.test.js`
- **Cenários:** mesmo messageId 2x → idempotente.

#### Backend — 5. Mass assignment em updateCliente — bypass de tenantId
- **Categoria:** Security
- **Comportamento não testado:** PUT `/clientes/:id` com `{tenantId: "outro"}` no body — se controller faz `findOneAndUpdate({...}, req.body)` sem whitelist, cliente muda de tenant.
- **Evidência:** verificar `src/modules/clientes/clienteController.js`.
- **Risco:** cliente movido entre tenants; data confusion.
- **Ficheiro sugerido:** `tests/cliente-mass-assignment.test.js`
- **Cenários:** PUT com `tenantId` no body → cliente.tenantId não muda.

#### Frontend — 6. AuthContext: login/logout/refresh + localStorage
- **Categoria:** Critical user flow
- **Comportamento não testado:** persistência de tokens, configuração do header Authorization, fallback em refresh fail.
- **Evidência:** `src/contexts/AuthContext.jsx:50-225`.
- **Risco:** logout silencioso em refresh de página, tokens em estado stale, header Authorization não actualizado após refresh.
- **Camada:** Integration (Vitest + RTL)
- **Ficheiro sugerido:** `src/contexts/__tests__/AuthContext.test.tsx`
- **Cenários:** login persiste 4 keys; logout limpa 4 keys; refresh on mount valida via `/auth/me`; refresh fail → clearAuth.

#### Frontend — 7. Axios interceptor: 401 retry com queue subscribers
- **Categoria:** Critical infrastructure
- **Comportamento não testado:** `isRefreshing` flag, fila de subscribers, retry com novo token, redirect em refresh fail persistente.
- **Evidência:** `src/services/api.js:71-151`.
- **Risco:** refresh loop infinito, race conditions de refresh múltiplo, requests perdidas durante refresh.
- **Camada:** Unit (Vitest)
- **Ficheiro sugerido:** `src/services/__tests__/api.interceptor.test.ts`
- **Cenários:** 1º 401 com TOKEN_EXPIRED → refresh + retry; 2º 401 simultâneo → aguarda mesmo refresh; refresh fail → toast + redirect.

#### Frontend — 8. ProtectedRoute: auth + roles + plano
- **Categoria:** Authorization
- **Comportamento não testado:** redirect /login se não auth, deny page para role inválida, upgrade page para plano inválido, superadmin bypass.
- **Evidência:** `src/components/ProtectedRoute.jsx:36-89`.
- **Risco:** acesso não autorizado a rotas admin, features premium acessíveis sem plano.
- **Camada:** Integration (Vitest + RTL)
- **Ficheiro sugerido:** `src/components/__tests__/ProtectedRoute.test.tsx`
- **Cenários:** unauth → Navigate /login; role mismatch → 403 card; plan mismatch → upgrade page; superadmin sempre passa.

### Edge Cases 🟡🟢

**Backend:**

| # | Test | Severidade | Ficheiro sugerido |
|---|---|---|---|
| 9 | Rate limiting em endpoints CRUD (não-auth) | 🟡 | `tests/rate-limiting-crud.test.js` |
| 10 | JWT expirado real (mock token com `exp` passado) | 🟡 | `tests/auth-token-expiry.test.js` |
| 11 | `venderPacote` falha parcial — Pagamento crashes após Transacao criar | 🟡 | `tests/vender-pacote-partial-failure.test.js` |
| 12 | Evolution API timeout — sem config `timeout` no axios.post | 🟡 | `tests/evolution-api-timeout.test.js` |
| 13 | Plano inactivo / trial expirado bloqueia CRUD | 🟡 | `tests/plan-validation.test.js` |
| 14 | Conflito agendamento — sobreposição parcial (14:00-14:30 vs 14:15-14:45) | 🟡 | `tests/agendamento-conflict-edge.test.js` |
| 15 | Webhook resolve telefone — variants ambíguas entre tenants | 🟡 | `tests/webhook-multi-tenant-resolution.test.js` |
| 16 | Password reset token sem TTL | 🟡 | `tests/auth-reset-token-expiry.test.js` |
| 17 | Transacao idempotency em retry BullMQ | 🟡 | `tests/transacao-idempotency.test.js` |
| 18 | Pacote — sessões negativas se `usarSessao` chamado 2x | 🟡 | `tests/pacote-sessoes-idempotencia.test.js` |
| 19 | OpenAI/LangChain — timeout + fallback | 🟢 | `tests/ia-fallback.test.js` |
| 20 | Error message information disclosure (revela campos únicos) | 🟢 | `tests/security-error-leakage.test.js` |
| 21 | Notification subscribe sem rate limit | 🟢 | `tests/notification-rate-limit.test.js` |

**Frontend:**

| # | Test | Severidade | Camada | Ficheiro sugerido |
|---|---|---|---|---|
| 22 | Login E2E — validação inline + redirect to `from` | 🔴 | E2E (Playwright) | `tests/e2e/auth.login.spec.ts` |
| 23 | Register E2E — password complexity + confirmPassword + phone format | 🔴 | E2E (Playwright) | `tests/e2e/auth.register.spec.ts` |
| 24 | Zod schemas — `agendamentoSchema` conditional refine (`tipoServico === 'pacote'`) | 🟡 | Unit | `src/schemas/__tests__/validationSchemas.test.ts` |
| 25 | CriarCliente — Zod validation + API error handling + isSubmitting | 🟡 | Integration | `src/pages/__tests__/CriarCliente.test.tsx` |
| 26 | CriarAgendamento — multi-step form + dependent API calls (race) | 🟡 | Integration | `src/pages/__tests__/CriarAgendamento.test.tsx` |
| 27 | VenderPacote — conditional fields (parcelado, semValidade, MBWay) | 🟡 | Integration | `src/pages/__tests__/VenderPacote.test.tsx` |
| 28 | API error mapping — `ERROR_MESSAGES` lookup, 422 nested flatten, ECONNABORTED | 🟡 | Unit | `src/services/__tests__/api.errorHandling.test.ts` |
| 29 | useAuth — restore on mount + corrupted localStorage | 🟡 | Integration | `src/hooks/__tests__/useAuth.test.tsx` |
| 30 | Logout — `finally` clearAuth mesmo com /auth/logout fail | 🟡 | Unit | `src/contexts/__tests__/AuthContext.logout.test.ts` |
| 31 | Password strength calculator (5 critérios) | 🟢 | Unit | `src/pages/__tests__/Register.passwordStrength.test.ts` |
| 32 | API success toast só em rotas non-auth | 🟢 | Unit | `src/services/__tests__/api.successToast.test.ts` |
| 33 | refreshAuth — fetch silencioso (não redirect on error) | 🟢 | Unit | `src/contexts/__tests__/AuthContext.refresh.test.ts` |

---

## Mock Health

**Backend:** sem problemas. Todos os 16 ficheiros usam `mongodb-memory-server` real, sem mocks de DB. Os mocks que existem (Evolution API, OpenAI) são adequados para integration testing.

**Frontend:** baseline = 0. Recomendação ao escrever os 13 testes propostos: **máximo 3 mocks por teste**. Se um component test precisa de mock router + mock context + mock API + mock hooks → reescrever como Integration (Vitest+RTL com providers reais) ou E2E (Playwright).

---

## Estimativa final de novos testes

| Categoria | Test files | Estimativa de test cases (cada file ~3 cenários) |
|---|---|---|
| Backend 🔴 Críticos | 5 | ~15 |
| Backend 🟡 Importantes | 7 | ~21 |
| Backend 🟢 Edge cases | 3 | ~9 |
| Frontend 🔴 Críticos (3 already counted in Critical above) + E2E auth | 5 | ~16 |
| Frontend 🟡 Importantes | 6 | ~20 |
| Frontend 🟢 Edge cases | 2 | ~6 |
| **TOTAL** | **28 ficheiros** | **~87 test cases** |

Mais **13 tests a remover** dos 108 existentes → cleanup primeiro, depois adições.

---

## Setup necessário (frontend)

- **Vitest:** `npm install -D vitest @testing-library/react @testing-library/user-event jsdom`. Config `vitest.config.ts` com `environment: 'jsdom'`, `globals: true`. Adicionar script `"test": "vitest"` ao `package.json`.
- **Playwright:** já em devDependencies. Falta `playwright.config.ts` com `baseURL: 'http://localhost:5173'`, fixtures de auth, e script `"test:e2e": "playwright test"` no `package.json`.

---

*Report gerado pela skill `test-guide` — Phase 3 output. 2026-04-25.*
