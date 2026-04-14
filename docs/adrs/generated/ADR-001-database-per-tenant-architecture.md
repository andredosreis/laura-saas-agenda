# ADR-001: Database-per-Tenant via Mongoose useDb()

**Status:** Accepted  
**Data:** 2026-02-23  
**Módulo:** TENANT  
**Autor:** André dos Reis  
**Score de Impacto:** 150 (Crítico)

---

## Contexto

O sistema Laura SaaS Agenda é uma plataforma multi-tenant onde cada profissional (tenant) possui dados completamente isolados dos demais. Na arquitectura inicial (Dezembro 2025), o isolamento era garantido por um campo `tenantId` em todos os documentos de um banco de dados partilhado — padrão conhecido como *shared database, shared schema*.

Em Fevereiro de 2026, foram identificados problemas de isolamento nessa abordagem (`fix: fix multi-tenant isolation` — 2026-02-18), onde queries sem o filtro `tenantId` correcto podiam retornar dados de outros tenants silenciosamente. A ausência de uma fronteira física entre os dados representava um risco de segurança e conformidade inaceitável para um sistema que armazena fichas de anamnese médica e dados financeiros de clientes.

A decisão foi migrar para um modelo de *database-per-tenant*, onde cada tenant possui o seu próprio banco de dados MongoDB, isolado fisicamente dos demais.

---

## Decisão

Adoptar a estratégia **database-per-tenant** utilizando o mecanismo `mongoose.connection.useDb(tenantId)`, que permite alternar dinamicamente o banco de dados utilizado por request sem criar novas conexões físicas ao MongoDB.

Cada request autenticada passa por um middleware `tenantMiddleware` que:
1. Extrai o `tenantId` do JWT (nunca do body da request)
2. Invoca `mongoose.connection.useDb(tenantId)` para obter a conexão ao banco do tenant
3. Compila os models de domínio contra essa conexão via `getModels(db)` (ver ADR-002)
4. Injeta `req.models` e `req.tenantDb` no contexto da request

Os models `Tenant` e `User` permanecem no banco partilhado `laura-saas` (conexão padrão), pois são necessários para autenticação e descoberta de tenant antes do contexto isolado estar disponível.

---

## Alternativas Consideradas

### 1. Shared Database + tenantId Filter (abordagem anterior)
- **Vantagem:** Simplicidade operacional — um único banco, queries directas
- **Desvantagem:** Isolamento garantido apenas por convenção de código; um bug numa query sem filtro `tenantId` vaza dados de todos os tenants; dificulta conformidade com LGPD (exclusão de dados de um tenant afecta o banco inteiro)
- **Descartada** após incidente de isolamento em Fev 2026

### 2. Schema-per-Tenant (PostgreSQL)
- **Vantagem:** Isolamento por schema com uma única conexão; suporte nativo a foreign keys e transacções
- **Desvantagem:** Requeria migração completa de stack (MongoDB → PostgreSQL); incompatível com a estratégia `useDb()` que já estava em uso; custo de migração proibitivo com sistema em produção
- **Descartada** por incompatibilidade com a stack escolhida

### 3. Database-per-Tenant com Conexões Separadas
- **Vantagem:** Isolamento máximo, conexão dedicada por tenant
- **Desvantagem:** Cada tenant cria uma nova conexão TCP ao MongoDB Atlas; com N tenants activos, o pool de conexões explode; MongoDB Atlas free/shared tem limites rígidos de conexões simultâneas
- **Descartada** por inviabilidade operacional no tier actual do Atlas

---

## Consequências

### Positivas
- **Isolamento físico garantido:** Um bug de código não pode vazar dados entre tenants — a separação é imposta pela base de dados
- **Conformidade LGPD simplificada:** Eliminar um tenant = `dropDatabase(tenantId)` — sem necessidade de queries de limpeza por toda a colecção
- **Escalabilidade por tenant:** Cada banco pode ser migrado para um cluster dedicado independentemente
- **Auditoria simplificada:** Logs de acesso ao banco identificam o tenant directamente

### Negativas / Trade-offs
- **Sem queries cross-tenant:** Analytics globais e relatórios agregados (ex: total de agendamentos em todos os tenants) requerem queries em N bancos separados — complexo e lento
- **Migrations amplificadas:** Uma mudança de schema precisa ser aplicada em cada banco de tenant separadamente (ver ADR sem framework de migrations)
- **Operação de N bancos:** Monitoramento, backup e alertas precisam cobrir um banco por tenant activo
- **Complexidade do Model Registry:** Todos os models de domínio precisam ser registados no factory `getModels(db)` — um model fora do registry falha silenciosamente (ver ADR-002)

---

## Implementação

```javascript
// src/middlewares/tenantMiddleware.js
export async function injectTenant(req, res, next) {
  const tenantId = req.user.tenantId; // Extraído do JWT — nunca do body
  const db = mongoose.connection.useDb(tenantId, { useCache: true });
  req.models = getModels(db);
  req.tenantDb = db;
  next();
}
```

---

## Links e Referências

- **Commit de migração:** `feat: migrate to database-per-tenant architecture` (2026-02-23)
- **Commits relacionados:** 9 commits entre Dez 2025 e Fev 2026
- **ADRs relacionados:**
  - [ADR-002: Model Registry Pattern](./ADR-002-model-registry-factory-pattern.md)
  - [ADR-003: MongoDB com Mongoose como ORM](./ADR-003-mongodb-mongoose-orm.md)
  - [ADR-008: JWT Authentication Strategy](./ADR-008-jwt-authentication-strategy.md)
