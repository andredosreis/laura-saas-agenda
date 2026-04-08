# Potential ADR: MongoDB com Mongoose como Banco de Dados e ORM

**Module**: DATA
**Category**: Technology / Infrastructure
**Priority**: Must Document (Score: 150)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema utiliza **MongoDB** como banco de dados principal, acessado via **Mongoose** como ODM (Object Document Mapper). Esta é a escolha de infraestrutura de dados mais fundamental do projeto, presente desde o commit inicial em **abril de 2025** e que habilita diretamente a estratégia de database-per-tenant implementada via `mongoose.connection.useDb()`.

A escolha de MongoDB (schema-flexible) é especialmente relevante dado que o domínio do sistema evoluiu significativamente: o commit de **13 de janeiro de 2026** (`Update terminology from "Pacote" to "Serviço"`) demonstra evolução de modelo de domínio que seria mais custosa em banco relacional. O commit de **10 de janeiro de 2026** (`Implement multi-tenant purchase package model with session management`) adiciona modelos complexos de sessão e pagamento que se beneficiam da flexibilidade do documento.

O projeto possui 14 schemas Mongoose documentados no CLAUDE.md: Agendamento, Cliente, Pacote, CompraPacote, Pagamento, Transacao, HistoricoAtendimento, Tenant, User, UserSubscription, entre outros.

## Why This Might Deserve an ADR

- **Impact**: Toda a camada de dados do sistema — 14 modelos, todas as queries, toda a lógica de negócio persistida
- **Trade-offs**: Schema flexibility facilita iteração rápida mas dificulta integridade referencial; MongoDB escala horizontalmente mas joins são custosos; habilita useDb() para multi-tenancy
- **Complexity**: Sem foreign keys — integridade referencial é responsabilidade da aplicação; migrações são mais complexas sem schema enforcement
- **Team Knowledge**: Todo desenvolvedor precisa entender o paradigma de documentos vs relacional; agregações MongoDB têm sintaxe própria
- **Future Implications**: A escolha de MongoDB é pré-requisito da estratégia database-per-tenant; migrar seria uma refatoração massiva

## Evidence Found in Codebase

### Key Files
- [`src/models/`](../../../../src/models/) — 14 schemas Mongoose
- [`src/app.js`](../../../../src/app.js) — Configuração de conexão MongoDB
- [`seeds/`](../../../../seeds/) — Seeds do banco

### Impact Analysis
- Presente desde: 2025-04-25 (commit inicial)
- 14 schemas ao longo do projeto
- Habilita: database-per-tenant via useDb()
- Evolução de schema sem migration: múltiplos commits

## Questions to Address in ADR (if created)

- Por que MongoDB em vez de PostgreSQL + Prisma (opção comum no ecossistema)?
- Como é garantida a integridade referencial sem foreign keys?
- Qual a estratégia de índices para performance?
- Como são feitas migrações de schema sem downtime?
- A flexibilidade de schema foi um fator decisivo para a escolha?

## Related Potential ADRs
- [Database-per-Tenant Architecture](../TENANT/database-per-tenant-architecture.md)
