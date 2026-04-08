# Potential ADR: Deploy Split — Backend no Render, Frontend no Vercel

**Module**: INFRA
**Category**: Infrastructure / Architecture
**Priority**: Must Document (Score: 130)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema utiliza uma estratégia de deploy split: backend Node.js hospedado no **Render** e frontend React/Vite hospedado no **Vercel**. Esta decisão foi consolidada em **28 de outubro de 2025** (`T19: Configuração produção - Backend Render integrado`) e formalizada com o arquivo `render.yaml` adicionado em **16 de janeiro de 2026**.

Os commits revelam a complexidade desta arquitetura: múltiplos ajustes de CORS para permitir comunicação entre os dois domínios (`Refactor CORS configuration in app.js for production`, `Update CORS configuration to allow requests from laura-saas-agenda-mfqt.vercel.app`), além de problemas com variáveis de ambiente no Vercel (`fix: Suporta VITE_VAPID_PUBLIC se Vercel bloquear _KEY`, `fix: Remove --env-file flag incompatível com Render`). O Vercel Speed Insights foi adicionado em outubro de 2025.

O Render free tier tem limitações conhecidas (cold start de ~30s após inatividade), documentadas no roadmap de melhorias como ponto de atenção para produção.

## Why This Might Deserve an ADR

- **Impact**: Define onde e como o sistema roda em produção — afeta latência, disponibilidade, custos e operação
- **Trade-offs**: Render free tier tem cold start e sleep após inatividade; Vercel é otimizado para frontend mas tem limitações de serverless para backend stateful
- **Complexity**: CORS entre domínios distintos; variáveis de ambiente gerenciadas em dois lugares; deploy pipeline separado
- **Team Knowledge**: Todo desenvolvedor precisa saber como fazer deploy, configurar env vars e depurar problemas de CORS/rede
- **Future Implications**: Migração para plano pago do Render ou para alternativas (Railway, Fly.io, VPS) quando cold start impactar negócio

## Evidence Found in Codebase

### Key Files
- [`render.yaml`](../../../../render.yaml) — Configuração de deploy no Render
- [`laura-saas-frontend/vercel.json`](../../../../laura-saas-frontend/vercel.json) — Configuração de deploy no Vercel (se existir)
- [`src/app.js`](../../../../src/app.js) — Configuração CORS com domínios de produção

### Impact Analysis
- Deploy Render configurado: 2025-10-28
- render.yaml formalizado: 2026-01-16
- Commits de CORS fix para produção: ~5 commits
- Problema: cold start no Render free tier afeta UX
- Env vars: gerenciadas independentemente em Render e Vercel

## Questions to Address in ADR (if created)

- Por que Render para backend em vez de Railway, Fly.io ou Heroku?
- Por que Vercel para frontend em vez de Netlify ou Cloudflare Pages?
- Como é gerenciado o cold start do Render free tier?
- Qual o plano de upgrade quando o negócio crescer?
- Como são sincronizadas as variáveis de ambiente entre os dois provedores?

## Related Potential ADRs
- [ES Modules no Backend Node.js](../../consider/INFRA/es-modules-backend.md)
- [Web Push PWA](../NOTIF/web-push-pwa-notification-strategy.md)
