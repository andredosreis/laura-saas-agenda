# ADR-012: Containerização Docker com Evolução para Microserviços

**Status:** Accepted — Implementação planeada Fase 2  
**Data:** 2026-04-12  
**Módulo:** INFRA  
**Autor:** André dos Reis  
**Score de Impacto:** 130 (Alto)

---

## Contexto

O sistema actual corre num único processo Node.js no Render free tier, com o frontend no Vercel. Esta arquitectura tem limitações conhecidas e documentadas:

- **Cold start do Render free tier:** processo em sleep após 15 minutos de inactividade — o CRON de lembretes das 19h pode não disparar
- **CRON co-localizado no processo HTTP:** se o processo da API cair, os lembretes param também
- **Evolution API pendente:** a migração Z-API → Evolution API requer um container Docker próprio
- **Sem isolamento de dependências:** o ambiente de desenvolvimento não garante paridade com produção

A reorganização em Modular Monolith (ADR-011) cria as fronteiras necessárias para que cada módulo possa eventualmente tornar-se um container independente.

---

## Decisão

Adoptar **Docker como estratégia de containerização progressiva**, começando com um `docker-compose.yml` local para desenvolvimento e evoluindo para produção conforme o volume crescer.

**Fase 1 — Docker Compose local (desenvolvimento):**

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports: ["5000:5000"]
    depends_on: [mongo, redis]
    environment:
      - NODE_ENV=development

  worker:
    build: .
    command: node src/worker.js
    depends_on: [redis]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  evolution:
    image: atendai/evolution-api:latest
    ports: ["8080:8080"]
```

**Fase 2 — Produção containerizada (quando volume justificar):**

Migração do Render para VPS (Hetzner ou DigitalOcean) com Docker Compose em produção — elimina cold start, permite Evolution API no mesmo servidor, e reduz custo.

**Fase 3 — Microserviços (futuro):**

Cada módulo do Modular Monolith (ADR-011) torna-se um container independente:

```
containers/
  api/          ← Express API (agendamento, clientes)
  financeiro/   ← Módulo financeiro
  worker/       ← BullMQ worker (notificações)
  redis/        ← Fila persistente
  evolution/    ← Gateway WhatsApp
  ia/           ← IA service (futuro)
```

---

## Alternativas Consideradas

### 1. Manter Render + Vercel sem Docker
- **Vantagem:** Zero overhead operacional agora
- **Desvantagem:** Cold start não resolvido; Evolution API impossível no Render free tier; ambiente local não reflecte produção
- **Descartada** como solução de longo prazo — aceitável apenas no curto prazo

### 2. Kubernetes imediato
- **Vantagem:** Orquestração enterprise-grade; auto-scaling; rolling deployments
- **Desvantagem:** Curva de aprendizagem enorme; overhead operacional desproporcional para um sistema com um tenant activo; custo mínimo de $50-100/mês
- **Descartada** — identificada como evolução possível quando houver 50+ tenants activos

### 3. Docker Compose progressivo (decisão adoptada)
- **Vantagem:** Começa simples (local), evolui naturalmente (produção), sem reescrita quando escalar
- **Desvantagem:** VPS requer gestão de servidor (SSL, firewall, updates) — overhead operacional moderado
- **Adoptada** por ser o caminho mais natural dado o Modular Monolith (ADR-011)

---

## Consequências

### Positivas
- **Paridade dev/prod:** Docker Compose local garante que o ambiente de desenvolvimento é idêntico à produção
- **Evolution API desbloqueada:** pode correr no mesmo servidor que a API sem custo adicional de plataforma
- **CRON resiliente:** worker em container separado — o CRON não depende do processo HTTP
- **Caminho claro para microserviços:** container = microserviço em potência

### Negativas / Trade-offs
- **Gestão de VPS:** SSL (Let's Encrypt), firewall, updates do SO — responsabilidade operacional nova
- **Redis como dependência:** BullMQ requer Redis — nova peça de infraestrutura a gerir
- **Curva de aprendizagem Docker:** Dockerfile, docker-compose, volumes, networks — conhecimento necessário antes de avançar

### Decisão de VPS recomendada
> **Hetzner Cloud CX22** — €3.92/mês, 2 vCPU, 4GB RAM, baseado na Alemanha (RGPD). Suficiente para API + Worker + Redis + Evolution API com margem. Muito mais económico que Render paid tier.

---

## Links e Referências

- **Data da decisão:** 2026-04-12
- **Dependência directa:** Migração Z-API → Evolution API (planeada Abril 2026)
- **ADRs relacionados:**
  - [ADR-009: Deploy Split Render + Vercel](./ADR-009-split-deploy-render-vercel.md)
  - [ADR-011: Modular Monolith](./ADR-011-modular-monolith-agendamento-financeiro.md)
  - [ADR-013: Notification Pipeline BullMQ](./ADR-013-notification-pipeline-bullmq.md)
