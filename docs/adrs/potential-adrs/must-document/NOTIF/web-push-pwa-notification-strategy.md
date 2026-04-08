# Potential ADR: Web Push (VAPID) + PWA como Estratégia de Notificações Mobile

**Module**: NOTIF
**Category**: Architecture / Technology
**Priority**: Must Document (Score: 135)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema adotou Progressive Web App (PWA) com Web Push Notifications via protocolo VAPID como estratégia principal para notificações push em dispositivos móveis, em vez de desenvolver apps nativos (iOS/Android). Esta decisão foi implementada em **25 de outubro de 2025** (`feat(pwa): Phase 1 + Service Worker base`), com notificações Web Push concluídas em **28 de outubro de 2025** (`T17: Web Push Notificações - Testes Locais Completos`).

A adoção de PWA está diretamente ligada ao posicionamento do produto como SaaS web-first, evitando o overhead de publicação em App Store/Google Play e manutenção de bases de código separadas. Os commits subsequentes revelam complexidade operacional: problemas com VAPID keys no Vercel (`debug: Adiciona logs para diagnosticar VAPID key no Vercel`), necessidade de suporte a múltiplas variáveis de ambiente (`fix: Suporta VITE_VAPID_PUBLIC se Vercel bloquear _KEY`), e adição de ícones iOS para instalação (`T18: Ícones iOS - Apple Touch Icons adicionados`).

O service worker foi atualizado múltiplas vezes (commits de `update service worker revision` em fev 2026), indicando evolução contínua da estratégia de cache e notificações.

## Why This Might Deserve an ADR

- **Impact**: Define o canal de notificação proativa com profissionais/pacientes; afeta UX mobile e engajamento
- **Trade-offs**: PWA não suporta Web Push no Safari iOS (limitação histórica, melhorando em iOS 16.4+); sem acesso a recursos nativos como câmera avançada, Bluetooth
- **Complexity**: VAPID keys precisam ser gerenciadas como segredos; Service Worker tem lifecycle complexo; compatibilidade cross-browser
- **Team Knowledge**: Service Worker e Push API são tecnologias menos familiares; a decisão PWA vs nativo impacta todo roadmap de mobile
- **Future Implications**: Se o produto precisar de recursos nativos (câmera, GPS), a decisão PWA pode precisar ser revisitada

## Evidence Found in Codebase

### Key Files
- [`laura-saas-frontend/public/sw.js`](../../../../laura-saas-frontend/public/sw.js) — Service Worker
- [`laura-saas-frontend/public/manifest.json`](../../../../laura-saas-frontend/public/manifest.json) — PWA Manifest
- [`src/services/notificationService.js`](../../../../src/services/notificationService.js) — Backend VAPID e envio de push
- [`laura-saas-frontend/src/services/pushNotification.ts`](../../../../laura-saas-frontend/src/services/pushNotification.ts) — Subscrição no frontend

### Impact Analysis
- PWA Phase 1: 2025-10-25
- Web Push funcional: 2025-10-28
- Ícones iOS: 2025-10-28
- Service Worker atualizado: múltiplas vezes até 2026-02-23
- Problema VAPID no Vercel: resolvido com variável alternativa

## Questions to Address in ADR (if created)

- Por que PWA em vez de React Native ou apps nativos?
- Como é gerenciada a rotação de VAPID keys?
- Qual a estratégia para iOS Safari (onde Web Push tinha limitações)?
- Como o sistema lida com usuários que negam permissão de notificação?
- Existe canal de fallback (email, SMS) quando push falha?

## Related Potential ADRs
- [Split Deploy Render+Vercel](../INFRA/split-deploy-render-vercel.md)
