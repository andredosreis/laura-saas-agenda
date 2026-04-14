# ADR-002: Model Registry Pattern — Factory getModels(db)

**Status:** Accepted  
**Data:** 2026-02-23  
**Módulo:** TENANT  
**Autor:** André dos Reis  
**Score de Impacto:** 110 (Alto)

---

## Contexto

A estratégia database-per-tenant (ADR-001) exige que cada model Mongoose seja compilado contra a conexão específica do tenant em cada request. O Mongoose não permite reutilizar um model compilado numa conexão diferente — tentar fazê-lo resulta em erro ou, pior, no model a escrever silenciosamente no banco errado.

Sem um padrão centralizado, cada controller precisaria de importar schemas e compilar models manualmente com `db.model(name, schema)`, criando duplicação e alto risco de inconsistência — especialmente a distinção crítica entre models globais (`Tenant`, `User`) e models tenant-scoped (todos os restantes).

---

## Decisão

Adoptar um **Model Registry Pattern** implementado como uma factory function `getModels(db)` em `src/models/registry.js`.

A factory recebe a conexão tenant-scoped (`db`) e retorna um objecto com todos os models de domínio compilados contra essa conexão. O middleware `tenantMiddleware` invoca `getModels(db)` e injeta o resultado em `req.models`, disponibilizando os models correctos para todos os controllers da request.

A distinção entre models globais e tenant-scoped é documentada explicitamente no registry:

```javascript
// src/models/registry.js
// MODELOS GLOBAIS (banco partilhado 'laura-saas' — NÃO registar aqui):
//   - Tenant  → src/models/Tenant.js  (import directo)
//   - User    → src/models/User.js    (import directo)
//
// MODELOS TENANT-SCOPED (registar aqui OBRIGATORIAMENTE):
export function getModels(db) {
  return {
    Cliente:            db.model('Cliente',            ClienteSchema),
    Agendamento:        db.model('Agendamento',        AgendamentoSchema),
    Pacote:             db.model('Pacote',             PacoteSchema),
    CompraPacote:       db.model('CompraPacote',       CompraPacoteSchema),
    Pagamento:          db.model('Pagamento',          PagamentoSchema),
    Transacao:          db.model('Transacao',          TransacaoSchema),
    HistoricoAtendimento: db.model('HistoricoAtendimento', HistoricoAtendimentoSchema),
    // ... demais models de domínio
  };
}
```

Os schemas de domínio exportam separadamente o objecto `Schema` (ex: `export { ClienteSchema }`) para permitir compilação pelo registry em qualquer conexão.

---

## Alternativas Consideradas

### 1. Import directo de models em cada controller
- **Vantagem:** Simples, sem abstracção extra
- **Desvantagem:** Cada controller teria de importar e compilar `db.model(name, schema)` manualmente; nenhuma garantia de que o model correcto (tenant-scoped vs global) seria usado; código duplicado em dezenas de controllers
- **Descartada** por risco de inconsistência e duplicação

### 2. Auto-discovery de models por directório
- **Vantagem:** Adicionar um novo model seria automático, sem editar o registry
- **Desvantagem:** Quebra a distinção explícita entre models globais e tenant-scoped; um model adicionado ao directório errado seria silenciosamente registado no contexto errado; menos controlo e rastreabilidade
- **Descartada** por perda de explicitidade na fronteira de segurança

---

## Consequências

### Positivas
- **Ponto único de verdade:** Todos os models tenant-scoped estão listados num único lugar — auditoria e onboarding simplificados
- **Uso de cache do Mongoose:** O flag `useCache: true` em `useDb()` evita recompilação de schemas em requests repetidas para o mesmo tenant, mantendo performance
- **Fronteira de segurança explícita:** A separação global vs tenant-scoped é documentada no próprio código, não apenas em docs externos
- **Controllers limpos:** Controllers recebem `req.models.Cliente`, `req.models.Agendamento` — sem necessidade de imports ou compilação manual

### Negativas / Trade-offs
- **Ponto de extensão obrigatório:** Todo novo model de domínio **deve** ser adicionado ao registry — um model fora do registry não será acessível via `req.models` e causará erros em runtime, não em compile time
- **Acoplamento do registry:** Adicionar um model requer editar três lugares: o ficheiro de schema, o registry, e potencialmente o controller — sem tooling que enforque isso
- **Invisibilidade para novos developers:** A regra "Tenant e User não entram no registry" não tem enforcement automático — depende de documentação e code review

### Regra crítica para novos developers
> **Todo model de domínio de negócio (Clientes, Agendamentos, Pacotes, etc.) DEVE ser registado em `src/models/registry.js`. Nunca usar `import` directo destes models em controllers — usar sempre `req.models.NomeDoModel`.**

---

## Links e Referências

- **Commit de introdução:** `feat: migrate to database-per-tenant architecture` (2026-02-23)
- **Ficheiros chave:**
  - `src/models/registry.js` — Factory function
  - `src/middlewares/tenantMiddleware.js` — Injecção de `req.models`
- **ADRs relacionados:**
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md)
  - [ADR-003: MongoDB com Mongoose como ORM](./ADR-003-mongodb-mongoose-orm.md)
