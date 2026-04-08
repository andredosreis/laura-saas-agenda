# Potential ADR: JWT Authentication com Access Token de 1 hora

**Module**: AUTH
**Category**: Security / Architecture
**Priority**: Must Document (Score: 140)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema utiliza JSON Web Tokens (JWT) armazenados no `localStorage` do browser como mecanismo de autenticação. O access token tem duração de **1 hora**, decisão que foi explicitamente ajustada em **23 de janeiro de 2026** (`feat: enhance session expiration handling with user notifications and extend access token duration to 1 hour`). A escolha pelo `localStorage` em vez de cookies HttpOnly é um trade-off de segurança documentado como risco conhecido no projeto.

A estratégia foi implementada inicialmente em **dezembro de 2025** (`feat: Implement user authentication, tenant management`) como parte da introdução de multi-tenancy. O sistema inclui tratamento de expiração com notificação ao usuário (`enhance session expiration handling`), indicando que a UX de re-autenticação foi considerada.

Em **21 de fevereiro de 2026**, rate limiting foi adicionado às rotas públicas de auth (`feat: add rate limiting to public auth routes`), evidenciando preocupação crescente com segurança da camada de autenticação.

## Why This Might Deserve an ADR

- **Impact**: Afeta todos os módulos — toda request autenticada depende desta estratégia
- **Trade-offs**: `localStorage` é vulnerável a XSS (vs HttpOnly cookies que mitigam XSS); JWT stateless simplifica escalabilidade mas impede revogação imediata de tokens
- **Complexity**: 1h de expiração é curta o suficiente para limitar dano, longa o suficiente para UX aceitável — este equilíbrio deve ser documentado
- **Team Knowledge**: Crítico para qualquer trabalho em autenticação, segurança ou integração de novas funcionalidades
- **Future Implications**: Migração para refresh tokens ou HttpOnly cookies requereria mudanças em frontend e backend

## Evidence Found in Codebase

### Key Files
- [`src/middlewares/authMiddleware.js`](../../../../src/middlewares/authMiddleware.js) — Verificação e decodificação do JWT
- [`src/controllers/authController.js`](../../../../src/controllers/authController.js) — Geração de tokens
- [`laura-saas-frontend/src/contexts/AuthContext.tsx`](../../../../laura-saas-frontend/src/contexts/AuthContext.tsx) — Armazenamento e gerenciamento no frontend

### Impact Analysis
- Implementado: 2025-12-31
- Duração do token ajustada para 1h: 2026-01-23
- Rate limiting adicionado: 2026-02-21
- Commits relacionados: ~8 commits
- Risco documentado: JWT em localStorage suscetível a XSS

## Questions to Address in ADR (if created)

- Por que localStorage em vez de HttpOnly cookies?
- Por que 1 hora especificamente para o access token?
- Existe refresh token? Se não, por quê?
- Como o rate limiting mitiga ataques de força bruta?
- Qual o plano de migração para uma estratégia mais segura?

## Related Potential ADRs
- [Database-per-Tenant Architecture](../TENANT/database-per-tenant-architecture.md)
- [Rate Limiting em Rotas Públicas](../../consider/AUTH/rate-limiting-public-routes.md)
