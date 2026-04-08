# Potential ADR: Express 4 como Framework REST da API

**Module**: API
**Category**: Technology / Framework
**Priority**: Must Document (Score: 115)
**Date Identified**: 2026-04-08

---

## What Was Identified

O backend utiliza **Express 4** como framework HTTP principal, estruturando a API em 15+ grupos de rotas montados em `src/app.js`. Esta é a escolha de framework mais fundamental da camada de servidor, presente desde o commit inicial e consolidada em produção no Render em **28 de outubro de 2025** (`T19: Configuração produção - Backend Render integrado`).

Notavelmente, a API não utiliza versionamento (`/api/v1/`) — todas as rotas estão no path raiz `/api/`. O sistema usa Express 4.x sem plano documentado de migração para Express 5 (lançado em 2024), que quebra algumas APIs de middleware. O pipeline de middleware inclui 5 camadas sequenciais de auth: `authenticate → authorize → injectTenant → requirePlan → checkLimit`.

## Why This Might Deserve an ADR

- **Impact**: Framework central — toda a API, middleware, roteamento e error handling dependem do Express
- **Trade-offs**: Express 4 é estável e maduro mas sem suporte ativo de longo prazo; ausência de versionamento de API dificulta evolução sem breaking changes
- **Complexity**: Pipeline de 5 middlewares de auth faz múltiplas queries DB por request (`requirePlan` e `checkLimit` consultam Tenant separadamente)
- **Team Knowledge**: O padrão de pipeline de middlewares e a ausência de versionamento de API afetam qualquer desenvolvedor que adicione novas rotas
- **Future Implications**: Migração para Express 5 tem breaking changes em error handling; ausência de versionamento pode forçar migrações simultâneas de todos os clientes

## Evidence Found in Codebase

### Key Files
- [`src/app.js`](../../../../src/app.js) — Setup Express com 15+ grupos de rotas
- [`src/middlewares/authMiddleware.js`](../../../../src/middlewares/authMiddleware.js) — Pipeline de 5 camadas

### Code Evidence
```javascript
// src/app.js — sem versionamento de API
app.use('/api/agendamentos', authenticate, agendamentoRoutes);
app.use('/api/clientes', authenticate, clienteRoutes);
// ... 13+ outros grupos sem /v1/
```

### Impact Analysis
- Presente desde: 2025-04-25 (commit inicial)
- Versão: Express 4.x
- Sem versionamento de API (risco de breaking changes)
- Pipeline de auth: 2 queries DB desnecessárias por request (requirePlan + checkLimit)

## Questions to Address in ADR (if created)

- Por que Express em vez de Fastify, Hapi ou NestJS?
- Por que não há versionamento de API (`/api/v1/`)?
- Existe plano de migração para Express 5?
- Como otimizar o pipeline de middleware para reduzir queries DB redundantes?

## Related Potential ADRs
- [ES Modules no Backend](../../consider/INFRA/es-modules-backend.md)
- [JWT Authentication Strategy](../AUTH/jwt-authentication-strategy.md)
