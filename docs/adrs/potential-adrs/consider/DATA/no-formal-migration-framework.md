# Potential ADR: Ausência de Framework Formal de Migrations de Schema

**Module**: DATA
**Category**: Architecture / Operations
**Priority**: Consider (Score: 90)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema não utiliza um framework de migrations de banco de dados (como migrate-mongo, db-migrate ou Mongock). As mudanças de schema são realizadas via scripts Node.js ad-hoc em `src/migrations/` (e.g., `createLauraTenant.js`, `migrateFromTestToLaura.js`) sem versionamento, rollback automatizado ou rastreamento de estado de execução.

Evidências de evolução de schema sem registro formal são encontradas nos commits: o campo `tenantId` foi adicionado post-hoc ao `Agendamento` com comentário `🆕 MULTI-TENANT`; o commit de **13 de janeiro de 2026** renomeia "Pacote" para "Serviço" (`Update terminology from "Pacote" to "Serviço"`) sem migration correspondente nos dados existentes. A migração para database-per-tenant (`migrateFromTestToLaura.js`) foi um script pontual, não reproduzível automaticamente.

## Why This Might Deserve an ADR

- **Impact**: Toda evolução de schema em produção é um processo manual e não auditado — risco crescente com cada novo tenant e cada nova feature
- **Trade-offs**: Scripts ad-hoc têm flexibilidade máxima mas zero garantias de idempotência, rollback ou rastreamento de estado
- **Complexity**: Com database-per-tenant, uma migration precisa ser executada em N bancos de dados — processo manual é inviável em escala
- **Team Knowledge**: Não há processo definido para aplicar mudanças de schema em produção; cada desenvolvedor improvisa
- **Future Implications**: À medida que o número de tenants cresce, a ausência de migrations automatizadas torna-se um bloqueador operacional crítico

## Evidence Found in Codebase

### Key Files
- [`src/migrations/`](../../../../src/migrations/) — Scripts ad-hoc sem framework
- [`src/models/Agendamento.js`](../../../../src/models/Agendamento.js) — Campos adicionados com comentários `🆕`

### Impact Analysis
- Presente desde: início do projeto
- Problema agravado por: database-per-tenant (N bancos para migrar)
- Commits revelando evolução não-rastreada: "Pacote → Serviço" (Jan 2026), campos tenantId adicionados (Fev 2026)
- Framework recomendado: migrate-mongo (compatível com MongoDB)

## Questions to Address in ADR (if created)

- Como é o processo atual para aplicar mudanças de schema em produção?
- Como funciona a migration em todos os bancos tenant-scoped?
- Existe plano para adotar migrate-mongo ou framework similar?
- Como será feito rollback se uma migration falhar?

## Related Potential ADRs
- [Database-per-Tenant Architecture](../must-document/TENANT/database-per-tenant-architecture.md)
- [MongoDB com Mongoose como ORM](../must-document/DATA/mongodb-mongoose-orm.md)
