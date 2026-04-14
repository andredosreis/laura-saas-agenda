# ADR-009: Deploy Split — Backend no Render, Frontend no Vercel

**Status:** Accepted  
**Data:** 2025-10-28  
**Módulo:** INFRA  
**Autor:** André dos Reis  
**Score de Impacto:** 130 (Alto)

---

## Contexto

O sistema Laura SaaS Agenda é composto por dois artefactos distintos: um backend Node.js/Express (API stateful com conexão persistente ao MongoDB) e um frontend React/Vite (SPA estático). Cada artefacto tem requisitos de hosting diferentes.

O backend requer: execução de processo Node.js contínuo, variáveis de ambiente seguras, suporte a WebSockets (futuro), e capacidade de executar CRON jobs. O frontend requer: servir ficheiros estáticos, CDN global para performance, e deploy automático a partir do repositório Git.

A decisão de hosting foi consolidada em Outubro de 2025 com o commit `T19: Configuração produção - Backend Render integrado`, após período de desenvolvimento local.

---

## Decisão

Adoptar uma **estratégia de deploy split**:
- **Backend Node.js → Render** (free tier na fase inicial, `render.yaml` como infrastructure-as-code)
- **Frontend React/Vite → Vercel** (free tier, deploy automático a partir do GitHub)

O `render.yaml` formaliza a configuração do backend como código, versionado no repositório:

```yaml
# render.yaml
services:
  - type: web
    name: laura-saas-backend
    env: node
    buildCommand: npm install
    startCommand: npm start
```

---

## Alternativas Consideradas

### 1. Vercel para backend + frontend (monorepo)
- **Vantagem:** Um único provedor; configuração unificada; sem CORS cross-origin
- **Desvantagem:** Vercel executa backend como Serverless Functions — incompatível com conexões persistentes ao MongoDB (cada invocação cria nova conexão), CRON jobs (sem estado entre invocações), e o modelo de `mongoose.connection.useDb()` que depende de conexão persistente
- **Descartada** por incompatibilidade arquitectural com o backend stateful

### 2. Railway para backend + Vercel para frontend
- **Vantagem:** Railway tem melhor DX que Render; sem cold start no free tier
- **Desvantagem:** Railway eliminou o free tier em 2023; custo mínimo de $5/mês — incompatível com a fase inicial de custo zero
- **Descartada** por custo na fase inicial

### 3. Fly.io para backend + Vercel para frontend
- **Vantagem:** Free tier generoso; Docker nativo; sem cold start; suporte a regiões próximas de Portugal
- **Desvantagem:** Curva de aprendizagem mais acentuada (Docker + flyctl); configuração mais complexa que Render
- **Não adoptada** — identificada como alternativa de migração se o cold start do Render se tornar crítico para o negócio

### 4. VPS própria (DigitalOcean, Hetzner)
- **Vantagem:** Controlo total; sem cold start; custo fixo previsível; permite Evolution API Docker no mesmo servidor
- **Desvantagem:** Responsabilidade de manutenção do servidor (updates, SSL, firewall); overhead operacional incompatível com equipa de uma pessoa
- **Considerada para fase futura** — especialmente relevante quando a migração para Evolution API (Docker) for implementada

---

## Consequências

### Positivas
- **Custo zero** na fase inicial — ambos os provedores têm free tier suficiente para 1 tenant activo
- **Deploy automático** — commits para `main` disparam deploy automático em ambos os provedores
- **Especialização:** Render optimizado para backends Node.js persistentes; Vercel optimizado para frontends React com CDN global
- **Infrastructure-as-code:** `render.yaml` versiona a configuração do backend no repositório

### Negativas / Trade-offs
- **CORS cross-origin obrigatório:** Backend (render.app) e frontend (vercel.app) têm domínios distintos — CORS precisa de ser configurado explicitamente; resultou em ~5 commits de fix de CORS em produção
- **Variáveis de ambiente em dois lugares:** Segredos geridos independentemente no dashboard do Render e do Vercel — sem sincronização; erro humano de configuração é frequente
- **Cold start do Render free tier:** O Render coloca o serviço em sleep após 15 minutos de inactividade — o primeiro request após inactividade tem latência de ~30s; **impacto crítico:** CRON de lembretes das 19h pode falhar silenciosamente se não houver tráfego antes dessa hora (ver ADR sobre CRON co-localizado)
- **Sem domínio próprio no free tier:** URLs de produção incluem sufixos dos provedores (`render.app`, `vercel.app`) — impacto na percepção de profissionalismo

### Problema de CRON no Render free tier (risco activo)
> O CRON de lembretes WhatsApp executa às 19h dentro do processo Express. No Render free tier, o processo entra em sleep após 15 minutos de inactividade. Se não houver requests entre ~18h45 e 19h, o CRON **não dispara** — os clientes não recebem lembretes. **Mitigação imediata:** implementar um ping externo (UptimeRobot, Render Health Check) para manter o processo activo. **Solução definitiva:** Render paid tier (sem sleep) ou migração para Fly.io/VPS.

---

## Links e Referências

- **Deploy Render configurado:** 2025-10-28
- **render.yaml formalizado:** 2026-01-16
- **Commits de CORS fix:** ~5 commits para produção
- **Ficheiros chave:**
  - `render.yaml` — Configuração de deploy no Render
  - `vercel.json` — Configuração de deploy no Vercel
  - `src/app.js` — Configuração CORS com domínios de produção
- **ADRs relacionados:**
  - [ADR-008: Web Push PWA](./ADR-008-web-push-pwa-notification-strategy.md)
