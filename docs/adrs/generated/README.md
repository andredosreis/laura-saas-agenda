# Architecture Decision Records — Laura SaaS Agenda

> Registo de decisões arquitecturais significativas tomadas no desenvolvimento da plataforma Laura SaaS Agenda.
> Cada ADR documenta o contexto, a decisão, as alternativas consideradas e as consequências — incluindo trade-offs negativos.

**Formato:** Baseado no template de Michael Nygard, com secção de "Alternativas Consideradas" obrigatória.  
**Processo:** ADRs são criados quando uma decisão tem impacto em múltiplos módulos, é difícil de reverter, ou requer contexto explícito para futuros developers.

---

## Índice

### Status

| # | ADR | Módulo | Status | Data | Score |
|---|-----|--------|--------|------|-------|
| 001 | [Database-per-Tenant via Mongoose useDb()](./ADR-001-database-per-tenant-architecture.md) | TENANT | ✅ Accepted | 2026-02-23 | 150 |
| 002 | [Model Registry Pattern — Factory getModels(db)](./ADR-002-model-registry-factory-pattern.md) | TENANT | ✅ Accepted | 2026-02-23 | 110 |
| 003 | [MongoDB com Mongoose como Banco de Dados e ORM](./ADR-003-mongodb-mongoose-orm.md) | DATA | ✅ Accepted | 2025-04-25 | 150 |
| 004 | [JWT Authentication com Access Token de 1 Hora](./ADR-004-jwt-authentication-strategy.md) | AUTH | ✅ Accepted | 2025-12-31 | 140 |
| 005 | [RBAC com Sistema Duplo — Role Hierarchy + Granular Permissions](./ADR-005-rbac-dual-system-role-permissions.md) | AUTH | ✅ Accepted | 2025-12-31 | 100 |
| 006 | [Z-API como Gateway WhatsApp](./ADR-006-z-api-whatsapp-integration.md) | WA | ✅ Accepted — Migração planeada | 2025-06-09 | 145 |
| 007 | [Estratégia Two-Tier LLM — Classificador + Function Calling](./ADR-007-two-tier-llm-strategy.md) | AI | ✅ Accepted — v1.1 em evolução | 2025-06-29 | 140 |
| 008 | [Web Push (VAPID) + PWA como Estratégia de Notificações](./ADR-008-web-push-pwa-notification-strategy.md) | NOTIF | ✅ Accepted | 2025-10-25 | 135 |
| 009 | [Deploy Split — Backend no Render, Frontend no Vercel](./ADR-009-split-deploy-render-vercel.md) | INFRA | ✅ Accepted | 2025-10-28 | 130 |
| 010 | [Express 4 como Framework REST da API](./ADR-010-express-4-rest-framework.md) | API | ✅ Accepted | 2025-04-25 | 115 |
| 011 | [Desacoplamento Agendamento/Financeiro + Modular Monolith](./ADR-011-modular-monolith-agendamento-financeiro.md) | ARCH | ✅ Accepted | 2026-04-12 | 145 |
| 012 | [Containerização Docker com Evolução para Microserviços](./ADR-012-docker-containerization-strategy.md) | INFRA | ✅ Accepted — Implementação planeada Fase 2 | 2026-04-12 | 130 |
| 013 | [Notification Pipeline com BullMQ + Redis](./ADR-013-notification-pipeline-bullmq.md) | NOTIF | ✅ Accepted — Implementação planeada Fase 2 | 2026-04-12 | 135 |
| 017 | [Lembretes Automáticos de Parcelas via WhatsApp (Evolution)](./ADR-017-lembretes-whatsapp-parcelas.md) | NOTIF | 🟡 Proposed | 2026-04-23 | 125 |
| 020 | [Limite Explícito de 100 em Listagens de Clientes — Trajectória até Busca Server-Side](./ADR-020-listagem-paginacao-clientes-limit-100.md) | API | ✅ Accepted — Fase 1 | 2026-04-27 | 80 |

---

## ADRs Pendentes (alta prioridade)

Identificados pela análise do codebase — ainda não formalizados:

| Módulo | Decisão | Urgência |
|--------|---------|----------|
| WA | Migração Z-API → Evolution API (self-hosted Docker) | Alta |
| DATA | Estratégia de Migrations de Schema (migrate-mongo) | Alta |
| INFRA | CRON co-localizado no processo Express — risco de cold start | Alta |
| AUTH | Feature Gating por Plano via Middleware (requirePlan + checkLimit) | Média |
| TENANT | Topologia Two-Tier — Dados Globais vs Dados Isolados | Média |

---

## Módulos em análise

| Módulo | Status |
|--------|--------|
| TENANT, AUTH, WA, AI, NOTIF, INFRA, API, DATA | ✅ Analisados |
| SCHED, CRM, PKG, FIN | ⏳ Pendentes |
| FE-CORE, FE-DASH, FE-SCHED, FE-CRM, FE-PKG, FE-FIN | ⏳ Pendentes |

---

## Como criar um novo ADR

1. Copiar o template abaixo para um novo ficheiro `ADR-NNN-titulo-kebab-case.md`
2. Preencher todas as secções — especialmente **Alternativas Consideradas** e **Consequências negativas**
3. Fazer referência ao ADR noutros documentos relevantes (HLD, FDD, código)
4. Actualizar este índice

```markdown
# ADR-NNN: Título da Decisão

**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-NNN  
**Data:** YYYY-MM-DD  
**Módulo:** TENANT | AUTH | WA | AI | NOTIF | INFRA | API | DATA  
**Autor:** André dos Reis  
**Score de Impacto:** 0-150

---

## Contexto
[Por que esta decisão foi necessária? Qual o problema a resolver?]

## Decisão
[O que foi decidido? Como funciona?]

## Alternativas Consideradas
[Pelo menos 2 alternativas com vantagens, desvantagens e razão da rejeição]

## Consequências
### Positivas
### Negativas / Trade-offs

## Links e Referências
[Commits, ficheiros, ADRs relacionados]
```

---

*Gerados com base na análise do histórico de git e codebase via claude-mkt-place ADR plugin.*  
*Última actualização: 2026-04-08*
