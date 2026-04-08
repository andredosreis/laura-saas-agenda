# Potential ADR: Topologia Two-Tier — Dados Globais (Tenant/User) vs Dados Isolados

**Module**: TENANT
**Category**: Architecture / Security
**Priority**: Consider (Score: 95)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema utiliza uma topologia two-tier deliberada: `Tenant` e `User` vivem no banco compartilhado `laura-saas` (conexão padrão do Mongoose), enquanto todos os dados de negócio vivem em bancos isolados `tenant_<id>`. Esta fronteira é documentada apenas em comentários no `registry.js` e não há abstração que a enforça no código.

A separação é necessária para login e descoberta de tenant antes da autenticação — você precisa do `User` para autenticar e descobrir o `tenantId`, antes de poder usar o banco tenant-scoped. Mas a fronteira tem implicações não óbvias: um bug que usa `mongoose.connection` em vez de `req.models` acessa silenciosamente o banco errado.

## Why This Might Deserve an ADR

- **Impact**: Define a fronteira de segurança mais crítica do sistema — dados de diferentes tenants jamais devem se misturar
- **Trade-offs**: A fronteira implícita pode ser violada por um developer desatento usando o model errado; não há typecheck ou lint que previna o erro
- **Complexity**: Dois contextos de conexão coexistem no mesmo processo; a distinção é puramente por convenção
- **Team Knowledge**: Todo developer precisa saber quais models são globais vs tenant-scoped — sem isso, bugs de cross-tenant são possíveis

## Evidence Found in Codebase

### Key Files
- [`src/models/registry.js`](../../../../src/models/registry.js) — Comentário documentando a separação
- [`src/models/Tenant.js`](../../../../src/models/Tenant.js) — Model global (conexão padrão)
- [`src/models/User.js`](../../../../src/models/User.js) — Model global (conexão padrão)

### Code Evidence
```javascript
// src/models/registry.js — fronteira definida apenas por comentário
// Modelos que NÃO passam por aqui (ficam na DB partilhada):
//   - Tenant  (src/models/Tenant.js)
//   - User    (src/models/User.js)
```

### Impact Analysis
- Introduzido: 2026-02-23
- Risco: uso acidental de model global em contexto tenant-scoped é silencioso
- Solução possível: lint rule ou wrapper que force o uso correto

## Questions to Address in ADR (if created)

- Como prevenir que developers usem o model errado (global vs tenant-scoped)?
- Existe log/auditoria quando a fronteira entre bancos é cruzada?
- Por que User é global em vez de replicado por tenant?

## Related Potential ADRs
- [Database-per-Tenant Architecture](../must-document/TENANT/database-per-tenant-architecture.md)
- [Model Registry Factory Pattern](../must-document/TENANT/model-registry-factory-pattern.md)
