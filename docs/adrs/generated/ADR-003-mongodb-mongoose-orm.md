# ADR-003: MongoDB com Mongoose como Banco de Dados e ORM

**Status:** Accepted  
**Data:** 2025-04-25  
**Módulo:** DATA  
**Autor:** André dos Reis  
**Score de Impacto:** 150 (Crítico)

---

## Contexto

Na fase inicial do projecto (Abril 2025), foi necessário escolher a tecnologia de persistência de dados. O sistema Laura SaaS Agenda gere entidades com estruturas variáveis e em evolução — fichas de anamnese médica com campos opcionais, pacotes de sessões com regras de negócio complexas, e um modelo de domínio que evoluiu significativamente ao longo do desenvolvimento (ex: rename de "Pacote" para "Serviço" em Janeiro 2026, introdução de `CompraPacote` e `Pagamento` em Janeiro 2026).

A escolha de base de dados é a decisão de infraestrutura mais fundamental do projecto — todos os 14 modelos de domínio, todas as queries, e a estratégia de multi-tenancy dependem desta escolha.

---

## Decisão

Adoptar **MongoDB** como base de dados principal, acessado via **Mongoose** como ODM (Object Document Mapper), hospedado no **MongoDB Atlas** (tier partilhado na fase inicial).

O Mongoose fornece:
- Definição de schemas com validação integrada
- Middleware de schema (pre/post hooks) para lógica cross-cutting
- Mecanismo `useDb()` que habilita directamente a estratégia database-per-tenant (ADR-001)
- Índices compostos para isolamento por tenant

---

## Alternativas Consideradas

### 1. PostgreSQL + Prisma
- **Vantagem:** Schema estrito com migrations formais; foreign keys nativas; transacções ACID; ecossistema maduro no Node.js
- **Desvantagem:** Schema-per-tenant é mais complexo de implementar que `useDb()`; a flexibilidade de schema do MongoDB é vantajosa para um domínio em evolução rápida; Prisma adiciona uma camada de abstracção que conflitua com a estratégia de multi-tenancy escolhida
- **Descartada** por incompatibilidade com a estratégia de isolamento via `useDb()` e por rigidez de schema num domínio ainda em definição

### 2. MongoDB sem Mongoose (driver nativo)
- **Vantagem:** Menos overhead, acesso directo à API do MongoDB
- **Desvantagem:** Sem validação de schema, sem middleware hooks, sem abstracção de queries — requer mais código boilerplate em cada operação; `useDb()` existe no driver nativo mas o padrão de Model Registry seria mais complexo de implementar
- **Descartada** pela perda de produtividade sem justificação de performance

### 3. Supabase (PostgreSQL gerido)
- **Vantagem:** PostgreSQL com API REST automática, autenticação integrada, tier gratuito generoso
- **Desvantagem:** Dependência de vendor; row-level security (RLS) para multi-tenancy é mais complexa de configurar que `useDb()`; migração futura seria difícil
- **Descartada** por lock-in e incompatibilidade com a estratégia de multi-tenancy

---

## Consequências

### Positivas
- **Flexibilidade de schema:** Evolução do modelo de domínio (campos opcionais, rename de entidades) sem migrations bloqueantes — crítico na fase de product discovery
- **Habilita database-per-tenant:** O mecanismo `useDb()` do Mongoose é o alicerce da estratégia de isolamento (ADR-001) — sem MongoDB, esta estratégia não seria viável com a mesma simplicidade
- **Escalabilidade horizontal:** MongoDB Atlas suporta sharding e replicação com configuração mínima
- **Atlas como serviço gerido:** Backups automáticos, failover, e monitoramento sem infraestrutura própria

### Negativas / Trade-offs
- **Sem integridade referencial nativa:** Não há foreign keys — a integridade entre documentos (ex: `Agendamento.clienteId` referência um `Cliente` válido) é responsabilidade da aplicação
- **Joins custosos:** Queries que relacionam múltiplas colecções requerem `$lookup` (aggregation pipeline) — mais verbosas e menos performáticas que JOINs relacionais
- **Migrations sem framework:** A flexibilidade de schema significa que mudanças estruturais (adicionar campos obrigatórios, renomear campos) não têm enforcement automático — requerem scripts manuais (ver ADR sobre ausência de migration framework)
- **Paradigma de documentos:** Desenvolvedores com background relacional precisam adaptar o modelo mental para documentos aninhados vs tabelas normalizadas

### Modelos de domínio actuais (14 schemas)
`Agendamento`, `Cliente`, `Pacote`, `CompraPacote`, `Pagamento`, `Transacao`, `HistoricoAtendimento`, `Tenant`, `User`, `UserSubscription`, `Conversa`, `Configuracao`, `Disponibilidade`, `WebPushSubscription`

---

## Links e Referências

- **Presente desde:** commit inicial (2025-04-25)
- **Ficheiros chave:**
  - `src/models/` — 14 schemas Mongoose
  - `src/app.js` — Configuração de conexão MongoDB
  - `seeds/` — Seeds do banco de dados
- **ADRs relacionados:**
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md)
  - [ADR-002: Model Registry Pattern](./ADR-002-model-registry-factory-pattern.md)
