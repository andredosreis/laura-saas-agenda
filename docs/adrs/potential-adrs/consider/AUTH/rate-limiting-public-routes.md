# Potential ADR: Rate Limiting nas Rotas Públicas de Autenticação

**Module**: AUTH
**Category**: Security
**Priority**: Consider (Score: 90)
**Date Identified**: 2026-04-08

---

## What Was Identified

Rate limiting foi adicionado às rotas públicas de autenticação em **21 de fevereiro de 2026** (`feat: add rate limiting to public auth routes (#2)`), como medida de proteção contra ataques de força bruta e enumeração de usuários. A adição tardia (6+ meses após a implementação do sistema de auth) e o número de PR (#2) sugerem que foi uma melhoria de segurança incremental, não parte do design original.

## Why This Might Deserve an ADR

- **Impact**: Proteção de todas as rotas de login/registro — impacto na segurança do sistema
- **Trade-offs**: Rate limiting pode bloquear usuários legítimos em redes compartilhadas (NAT); requer configuração cuidadosa de limites
- **Complexity**: Implementação simples (express-rate-limit), mas decisão de limites (requests/window) tem implicações de UX
- **Team Knowledge**: Deve-se saber que o limite existe para não surpreender em testes e para ajustar se necessário

## Evidence Found in Codebase

### Key Files
- [`src/middlewares/rateLimitMiddleware.js`](../../../../src/middlewares/rateLimitMiddleware.js) — Configuração de rate limit
- [`src/routes/authRoutes.js`](../../../../src/routes/authRoutes.js) — Aplicação do middleware

### Impact Analysis
- Introduzido: 2026-02-21
- PR: #2 (indica revisão de código)
- Afeta: rotas /auth/login, /auth/register

## Questions to Address in ADR (if created)

- Quais são os limites configurados (requests por janela de tempo)?
- Como usuários legítimos bloqueados são tratados?
- Existe rate limiting em outras rotas além de auth?

## Related Potential ADRs
- [JWT Authentication Strategy](../must-document/AUTH/jwt-authentication-strategy.md)
