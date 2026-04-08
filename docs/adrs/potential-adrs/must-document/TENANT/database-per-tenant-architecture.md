# Potential ADR: Database-per-Tenant Architecture via Mongoose useDb()

**Module**: TENANT
**Category**: Architecture
**Priority**: Must Document (Score: 150)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema adotou uma estratégia de isolamento total de dados onde cada tenant (profissional/clínica) possui seu próprio banco de dados MongoDB, em vez de um banco compartilhado com filtro por `tenantId`. A decisão foi implementada por meio do mecanismo `mongoose.connection.useDb()`, que permite alternar dinamicamente o banco de dados utilizado por request, sem criar novas conexões físicas.

Esta decisão foi introduzida em **23 de fevereiro de 2026**, via commit `feat: migrate to database-per-tenant architecture`, representando uma migração significativa da abordagem anterior (shared database com campo `tenantId`). Os commits anteriores de **18 de fevereiro de 2026** (`fix: fix multi-tenant isolation`) e **dezembro de 2025** (`feat: Implement user authentication, tenant management`) revelam que houve problemas de isolamento na arquitetura original que motivaram a migração.

A evolução é clara: iniciou-se com shared database + `tenantId` field (Dez 2025), passaram por problemas de isolamento (Fev 2026), e migraram para database-per-tenant (23 Fev 2026) — 9 commits ao total relacionados a tenancy.

## Why This Might Deserve an ADR

- **Impact**: Afeta todos os 19 módulos do sistema — cada query, cada model, cada controller passa pelo contexto de tenant
- **Trade-offs**: Isolamento total de dados vs complexidade operacional (N bancos para gerenciar, backup por tenant, monitoramento)
- **Complexity**: Requer middleware de resolução de tenant em cada request; Model Registry pattern para evitar recompilação de schemas
- **Team Knowledge**: Qualquer desenvolvedor que tocar no backend precisa entender o padrão `useDb()` para não vazar dados entre tenants
- **Future Implications**: Dificulta queries cross-tenant (analytics globais, relatórios agregados); facilita LGPD (exclusão de tenant = drop do banco)

## Evidence Found in Codebase

### Key Files
- [`src/middlewares/tenantMiddleware.js`](../../../../src/middlewares/tenantMiddleware.js) — Resolução de tenant por request
- [`src/models/index.js`](../../../../src/models/index.js) — Model Registry com useDb()
- [`src/app.js`](../../../../src/app.js) — Pipeline de middleware

### Impact Analysis
- Introduzido: 2026-02-23
- Commits relacionados: 9 commits ao longo de ~3 meses
- Migrado de: shared database com `tenantId` filter
- Migrado para: `mongoose.connection.useDb(tenantId)` por request
- Afeta: 100% das rotas autenticadas

## Questions to Address in ADR (if created)

- Por que database-per-tenant em vez de schema-per-tenant ou shared-database?
- Como foi feita a migração dos dados existentes?
- Qual a estratégia de backup e disaster recovery por tenant?
- Como funciona o Model Registry para evitar recompilação de schemas?
- Qual o impacto em analytics/relatórios que precisam de dados agregados?

## Related Potential ADRs
- [JWT Authentication Strategy](../AUTH/jwt-authentication-strategy.md)
- [MongoDB com Mongoose como ORM](../DATA/mongodb-mongoose-orm.md)
