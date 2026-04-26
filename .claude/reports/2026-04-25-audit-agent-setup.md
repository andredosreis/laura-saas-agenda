# Audit do setup de agents — meta-revisão

**Data:** 2026-04-25
**Severidade:** 🟡 Importante
**Origem:** Audit ad-hoc — validar coerência do recém-criado sistema de agents (8 agents + protocolo de reports)
**Estado:** Concluída — Gaps 1-5 executados pelo utilizador

---

## Agents envolvidos e ordem

1. `architect-agent` (modo `audit`) — analisar o próprio setup de agents que construímos hoje, verificar coerência e detectar contradições

---

## Findings por agent

### architect-agent (audit)

**Verificações feitas (verify-before-flag aplicado):**
- `grep` por menções de Zod / Evolution / Sentry / BullMQ em `.claude/agents/*.md`
- Inspecção de orchestrator references (delegation chains)
- Cross-check com memórias activas (`project_zod_adoption.md`, `project_observability_backup.md`, `project_whatsapp_evolution.md`, `feedback_git.md`)
- Cross-check com ADRs existentes

---

**🟢 Pontos fortes do setup**

1. **Frontmatter consistente** nos 8 agents — Claude Code consegue auto-invocar
2. **Delegation chains usam nomes reais** (zero referências fantasma a `@pm`/`@sm`/`@architect` AIOS)
3. **`git_restrictions` formal em todos** — codifica `feedback_git.md` correctamente
4. **Quality gates concretos** (PASS/CONCERNS/FAIL/WAIVED) com critérios verificáveis
5. **Architect tem regra `verify-before-flag`** — corrige o falso positivo do CRON do audit anterior
6. **Reports protocol** com lifecycle claro (criar → append → finalizar → SHA)
7. **Tabela de agents no orchestrator** lista cada um com modos típicos
8. **Brownfield posture preservada** — nenhum agent propõe rewrites

---

**🟡 Inconsistências e gaps detectados**

**Gap 1 — Backend-agent não menciona Zod, Sentry, BullMQ, Evolution API**

Verificação:
```
grep "Zod" backend-agent.md     → 0 hits
grep "Sentry" backend-agent.md  → 0 hits
grep "BullMQ" backend-agent.md  → 0 hits
grep "Evolution" backend-agent.md → 0 hits
```

Mas:
- `project_zod_adoption.md` (memória) — pilot Zod em backend desde 2026-04-24, módulos clientes/auth/financeiro já usam
- `project_observability_backup.md` — Sentry configurado em 2026-04-24
- `package.json` — bullmq + ioredis em produção, `src/queues/` + `src/workers/` activos
- `project_whatsapp_evolution.md` — Evolution API é a fonte actual

**Severidade:** 🟡 — backend-agent vai ignorar tooling em produção quando implementa features. Pode escrever código que não usa Zod num módulo onde Zod já é padrão.

**Acção:** adicionar à secção "Project Context" do backend-agent menção explícita a:
- `src/utils/evolutionClient.js` para integrações WhatsApp
- Zod schemas em `src/modules/<módulo>/<módulo>Schemas.js` (pilot por módulo)
- BullMQ queues em `src/queues/` para jobs assíncronos
- Sentry instrumentation em `src/instrument.js` (graceful degrade se DSN ausente)

---

**Gap 2 — Trigger automático do multi-tenant-guard não está formalizado**

Cenário típico: backend-agent altera `clienteController.js` → fim. Mas devia haver auto-trigger para multi-tenant-guard fazer regression-check antes do quality gate.

No orchestrator, a tabela de agents lista multi-tenant-guard mas o **fluxo de delegação não diz "sempre que backend tocar em controllers/models/routes/CRON, invocar multi-tenant-guard"**.

**Severidade:** 🟡 — risco de skip do guard na pressa.

**Acção:** adicionar ao orchestrator uma regra explícita:
> Após `backend-agent` (modo execute) tocar em `src/controllers/`, `src/models/`, `src/routes/`, `src/modules/*/`, ou qualquer ficheiro com Mongoose query → invocar **automaticamente** `multi-tenant-guard` em modo `regression-check` antes de delegar a `quality-agent`.

---

**Gap 3 — Overlap entre quality-agent NFR Security e security-agent**

O quality-agent inclui no NFR Security checklist:
- tenantId em queries
- Rate limit em rotas públicas
- Helmet + CORS
- Webhook x-api-token
- JWT 1h+7d, bloqueio 5 tentativas

Mas isto é **exactamente o domínio do security-agent**. Pergunta: quem audita?

**Risco:** o utilizador chama o quality-agent, ele dá PASS no NFR Security superficialmente (porque copia checklist) sem chamar o security-agent que tem o conhecimento profundo de cada item.

**Severidade:** 🟡 — não bloqueia, mas dilui responsabilidade.

**Acção:** quality-agent NFR Security deve **delegar a security-agent** se a alteração tocar auth/middleware/webhook/JWT, em vez de ter checklist próprio. Manter checklist apenas para "smell test" rápido.

---

**Gap 4 — db-migration-agent é zombie**

A migração shared-DB → DB-per-tenant **já foi feita** (ADR-001 status Accepted, datado 2026-02-23). O agent está pronto para algo que está concluído.

**Severidade:** 🔵 dívida técnica — não estraga nada manter, mas confunde Claude Code (descrição diz "Use exclusivamente para a migração X" e essa migração não vai voltar a acontecer).

**Acção:** opções:
- (a) Renomear/reescopar para `db-migration-agent` genérico (futuras migrações Mongoose com backfill-before-constraint, novas collections, etc.)
- (b) Mover para `.claude/agents/archive/` para histórico
- (c) Deixar como está com nota visível "histórico — não invocar"

**Recomendação:** (a) — reescopar para "DB schema migrations & data ops" generalista. Marcai vai precisar de mais migrações ao longo do tempo (campo novo em coleção existente, novo índice, backfill).

---

**Gap 5 — Reports README ainda contém template "modelo" que não está alinhado com README real**

Verificação: `.claude/reports/README.md` existe e está correcto. **Não é um gap de drift.** Apenas: o utilizador apagou um report antigo (`2026-04-25-audit-architect-system.md`), o README ficou intacto. ✅

---

**Gap 6 — Quality-agent "Console Check" é vapor**

O quality-agent tem secção "Console Check (Frontend)" com checklist de browser console errors. Mas o agent **não tem capacidade de abrir um browser** — depende do utilizador rodar a app e olhar.

**Severidade:** 🔵 — não estraga, mas a secção aparenta ser executada pelo agent quando não é.

**Acção:** renomear para "Console Check — manual (utilizador executa)" para clarificar que é instrução para o utilizador, não automação.

---

**🟢 Decisões deliberadas que NÃO são gaps (mantêm-se)**

1. **Não criados** `pm`, `po`, `sm`, `analyst`, `data-engineer`, `squad-creator`, `ux-design-expert`, `devops` — over-engineering para solo dev (decisão do utilizador na sessão)
2. **Sem CodeRabbit integration** — CLI não instalado no host
3. **Multi-tenant-guard não escreve código** — by design, é audit-only
4. **Quality-agent é advisory** — by design, gate decisions são recomendação, não bloqueio rígido

---

## Veredicto da audit

🟡 **CONCERNS** — sistema é coerente e usável, mas tem **6 gaps** que merecem correcção antes de ser considerado "production-ready" para o workflow do utilizador. Quatro são correcções pequenas (1-2 edits cada). Dois são decisões a pedir ao utilizador.

### Plano de execução proposto (ordem de impacto)

| # | Acção | Severidade | Quem |
|---|---|---|---|
| 1 | Adicionar Evolution API + Zod + BullMQ + Sentry ao Project Context do `backend-agent` | 🟡 | architect propõe edit, orchestrator coordena |
| 2 | Adicionar regra de auto-trigger `multi-tenant-guard` ao orchestrator | 🟡 | orchestrator edita |
| 3 | Refactor `quality-agent` NFR Security para delegar a `security-agent` em vez de checklist próprio | 🟡 | architect propõe |
| 4 | Renomear secção "Console Check" para clarificar que é manual | 🔵 | edit pequeno |
| 5 | **Decisão do utilizador:** db-migration-agent — reescopar / archivar / manter? | 🔵 | utilizador |
| 6 | Após decisão #5, executar action correspondente | 🔵 | conforme #5 |

---

## Ficheiros tocados

Audit produziu plano. Plano executado na mesma sessão após aprovação do utilizador:

```
M  .claude/agents/backend-agent.md         Gap 1: tabela "Tooling em uso" com Zod/BullMQ/Sentry/Evolution/Pino/Luxon
M  .claude/agents/orchestrator.md          Gap 2: secção "Auto-triggers" com 5 regras de delegação encadeada + escopo db-migration actualizado na tabela
M  .claude/agents/quality-agent.md         Gap 3: NFR Security delega a security-agent (smell test apenas)
                                           Gap 4: Console Check renomeado e clarificado como manual (utilizador executa)
M  .claude/agents/db-migration-agent.md    Gap 5: reescopado para migrações Mongoose genéricas (backfill-before-constraint, novos índices, rename) + secção histórica preservada
```

---

## Pendências para o utilizador

- [x] ~~Aprovar edits de Gap 1~~ — feito
- [x] ~~Aprovar regra de auto-trigger~~ — feito
- [x] ~~Aprovar refactor NFR Security~~ — feito
- [x] ~~Aprovar renomeação Console Check~~ — feito
- [x] ~~Decidir db-migration-agent~~ — utilizador escolheu reescopar (opção a)

Pendências reais que ficam:
- [ ] **Validação prática** — usar os agents numa próxima melhoria real e ver se os auto-triggers e gates funcionam como esperado
- [ ] **Decisões pendentes do audit anterior** ainda não tratadas (sincronização docs CLAUDE.md/ARQUITETURA.md/ADRs vs Mongoose 9, Express 5, BullMQ implemented status). Próxima sessão.

## Commit message proposto

```
chore(agents): refinar setup após meta-audit do architect-agent

Aplica 5 gaps identificados pelo architect-agent:
- backend-agent: contexto explícito de Zod/BullMQ/Sentry/Evolution
- orchestrator: auto-triggers para multi-tenant-guard e security-agent
- quality-agent: NFR Security delega a security-agent (sem duplicação)
- quality-agent: Console Check clarificado como manual (utilizador)
- db-migration-agent: reescopado para migrações Mongoose genéricas
  (backfill-before-constraint, novos índices, rename) + histórico
  da migração shared→tenant preservado como referência

Refs: .claude/reports/2026-04-25-audit-agent-setup.md
```

---

*Report gerado pelo orchestrator em 2026-04-25, finalizado 2026-04-25 22:42.*
