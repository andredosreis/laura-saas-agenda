# Potential ADR: Model Registry Pattern — Factory getModels(db)

**Module**: TENANT
**Category**: Architecture / ORM
**Priority**: Must Document (Score: 110)
**Date Identified**: 2026-04-08

---

## What Was Identified

Para suportar a estratégia database-per-tenant, todos os modelos Mongoose de domínio são compilados contra a conexão específica do tenant via uma factory `getModels(db)` em `src/models/registry.js`. Isso é necessário porque o Mongoose não permite reutilizar um model compilado numa conexão diferente — cada banco de dados requer sua própria instância do model.

O padrão foi introduzido junto com a migração para database-per-tenant em **23 de fevereiro de 2026**. Os schemas de domínio exportam separadamente o objeto `Schema` (e.g. `export { ClienteSchema }`) para que o registry possa compilá-los sob qualquer conexão. Os modelos `Tenant` e `User` são explicitamente excluídos do registry e permanecem no banco compartilhado.

## Why This Might Deserve an ADR

- **Impact**: Qualquer novo model de domínio DEVE ser registrado no registry — é um ponto de extensão obrigatório e não óbvio
- **Trade-offs**: A factory garante isolamento correto, mas cria acoplamento implícito; adicionar um model requer editar o registry, os schemas e os controllers
- **Complexity**: O mecanismo de cache do Mongoose (`useCache: true`) evita recompilação, mas desenvolvedores precisam entender o lifecycle dos models por conexão
- **Team Knowledge**: A distinção entre modelos globais (Tenant, User) e modelos tenant-scoped (todos os outros) é invisível sem documentação
- **Future Implications**: Novos módulos de domínio quebrarão silenciosamente se não forem adicionados ao registry

## Evidence Found in Codebase

### Key Files
- [`src/models/registry.js`](../../../../src/models/registry.js) — Factory getModels(db)
- [`src/middlewares/tenantMiddleware.js`](../../../../src/middlewares/tenantMiddleware.js) — Injeta `req.models` via registry

### Code Evidence
```javascript
// src/models/registry.js
// Modelos que NÃO passam por aqui (ficam na DB partilhada):
//   - Tenant  (src/models/Tenant.js)
//   - User    (src/models/User.js)
export function getModels(db) {
  return {
    Cliente: db.model('Cliente', ClienteSchema),
    Agendamento: db.model('Agendamento', AgendamentoSchema),
    // ... demais models de domínio
  };
}
```

### Impact Analysis
- Introduzido: 2026-02-23
- Afeta: todos os controllers de domínio via `req.models`
- Risco: model adicionado fora do registry não será acessível nos controllers

## Questions to Address in ADR (if created)

- Como garantir que novos developers saibam que devem registrar modelos aqui?
- Por que não usar um auto-discovery de models por diretório?
- Como funciona o cache do Mongoose e quando ele pode ser um problema?

## Related Potential ADRs
- [Database-per-Tenant Architecture](./database-per-tenant-architecture.md)
- [MongoDB com Mongoose como ORM](../DATA/mongodb-mongoose-orm.md)
