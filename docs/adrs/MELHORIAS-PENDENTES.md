# Melhorias Pendentes — Laura SaaS Agenda

> Documento gerado em 2026-04-16. Consolida todas as implementações pendentes identificadas nas ADRs e estado actual do código.

---

## Checklist de Progresso

### Fase 1 — Segurança & Estabilidade (Quick Wins)

- [x] **Helmet.js** — instalado e adicionado a `src/app.js` com `app.use(helmet())` + payload limitado a 10kb
- [x] **Rate Limiting global** — `loginLimiter`, `registerLimiter`, `forgotPasswordLimiter` já aplicados em `src/routes/authRoutes.js` (confirmado, estava feito)
- [x] **Graceful Shutdown** — handlers `SIGTERM` e `SIGINT` adicionados a `src/server.js`
- [x] **errorHandler melhorado** — categoriza ValidationError → 400, CastError → 400, 11000 → 409, JWT errors → 401; segue contrato `{ success, error }`
- [x] **Fallback OpenAI** ⚠️ CRÍTICO — `chatWithLaura` em `src/utils/openaiHelper.js` retorna mensagem padrão em vez de lançar excepção

### Fase 2 — ADR-011: Desacoplamento Agendamento/Financeiro

Decisão aceite em [ADR-011](generated/ADR-011-modular-monolith.md) (2026-04-12).

- [x] **`pacoteId` opcional** — `required: false` já estava no schema `src/models/Agendamento.js` (confirmado)
- [x] **Estado `Avaliacao`** — adicionado ao enum de status em `src/models/Agendamento.js`
- [x] **Validação de pacote no controller** — controller `createAgendamento` já não exige pacote (confirmado); corrigido mass assignment em `updateAgendamento`
- [x] **Fluxo financeiro condicional** — controller já cria transação apenas se `compraPacote` existe (linhas 204–239 confirmadas)
- [ ] **Reorganização `src/modules/`** — opcional, adiado (custo alto, benefício baixo agora)

### Fase 3 — Cobertura de Testes (~17% → ~30% actual)

- [x] **Testes de middlewares** — criado `tests/middlewares.test.js` (helmet headers, authenticate, errorHandler CastError, contrato de resposta); corrigido `validateObjectId.js` para seguir contrato `{ success, error }`
- [x] **Testes de dashboard** — criado `tests/dashboard.test.js` (todos os endpoints, isolamento de tenant, estrutura de resposta)
- [x] **Testes de transações (financeiro)** — criado `tests/transacoes.test.js` (CRUD, isolamento tenant, ID inválido, relatório por período)
- [x] **Testes ADR-011** — criado `tests/agendamento-avaliacao.test.js` (agendamento sem pacote, status Avaliacao, isolamento tenant)
- [x] **Isolamento multi-tenant** — teste `Tenant B → 404` incluído em `tests/agendamento-avaliacao.test.js` e `tests/transacoes.test.js`

**Resultado final: 94 testes, 10 suites, 100% pass rate.**

### Fase 4 — CI/CD Melhorado

- [x] **Pipeline separado backend/frontend** — dois jobs independentes em `.github/workflows/ci.yml`
- [x] **Coverage threshold** — `jest --coverage --coverageThreshold='{"global":{"lines":25}}'` no job backend
- [x] **Lint frontend** — `npm run lint` no job frontend
- [x] **Build frontend (TypeScript check + Vite)** — `npm run build` com `VITE_API_URL` de placeholder

---

## Detalhe por Fase

---

## Fase 5 — Infra: Docker + BullMQ (Planeada, sprint separado)

Conforme [ADR-012](generated/ADR-012-docker-containerization.md) e [ADR-013](generated/ADR-013-notification-pipeline-bullmq.md). Requer decisão sobre:

- Redis: Upstash free tier vs Docker local vs Render Redis
- Worker separado: `src/worker.js` com BullMQ consumers
- Deploy: manter Render free vs Render paid vs Fly.io
- docker-compose.yml com serviços: api, worker, redis, evolution (Z-API replacement)

**Estimativa:** 1–2 dias de trabalho, inclui mudanças em infra de produção.

---

## ADRs com Riscos Documentados Não Resolvidos

| ADR | Risco | Mitigação Pendente |
|-----|-------|--------------------|
| ADR-004 (JWT) | localStorage vulnerável a XSS | CSP headers (resolvido com Helmet — Fase 1) |
| ADR-005 (RBAC) | Dualidade `authorize()` vs `requirePermission()` confusa | Unificar ou documentar claramente — sem sprint definido |
| ADR-005 (RBAC) | Sem resource-level permissions (terapeuta vê todos os agendamentos) | Feature futura — ADR nova necessária |
| ADR-006 (Z-API) | Risco de ban WhatsApp, processamento síncrono | Migração para Evolution API (ADR-012 Fase 2) |
| ADR-009 (Deploy) | Cold start Render free → CRON 19h pode não disparar | UptimeRobot ping ou Render paid — sem sprint definido |
| ADR-010 (Express) | Sem versionamento `/api/v1/` | Antes de onboarding novos tenants — sem sprint definido |

---

## Ordem de Execução Recomendada

```
Fase 1 (2h)  → Fase 2 (3h) → Fase 3 (4h) → Fase 4 (1h) → Fase 5 (separado)
   ^segurança      ^ADR-011      ^testes        ^CI/CD         ^infra
```

Total estimado fases 1–4: **~10 horas de desenvolvimento**.
