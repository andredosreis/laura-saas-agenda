# ADR-010: Express 4 como Framework REST da API

**Status:** Accepted  
**Data:** 2025-04-25  
**Módulo:** API  
**Autor:** André dos Reis  
**Score de Impacto:** 115 (Alto)

---

## Contexto

Na fase inicial do projecto (Abril 2025), foi necessário escolher um framework HTTP para o backend Node.js. A escolha define a estrutura de toda a API, o modelo de middleware, o roteamento, e o error handling. Com o sistema já em produção e 15+ grupos de rotas implementados, esta decisão tem alto custo de reversão.

O sistema usa ESM (ES Modules) no backend, o que restringe ligeiramente a compatibilidade com algumas bibliotecas mais antigas.

---

## Decisão

Adoptar **Express 4** como framework HTTP principal para a API REST.

A API estrutura-se em 15+ grupos de rotas montados em `src/app.js`, todos no path `/api/` sem versionamento. O pipeline de middleware de autenticação tem 5 camadas sequenciais por request autenticada:

```
authenticate → authorize → injectTenant → requirePlan → checkLimit
```

---

## Alternativas Consideradas

### 1. Fastify
- **Vantagem:** Performance significativamente superior ao Express (benchmarks mostram 2-3x mais requests/segundo); validação de schema JSON integrada; logging via Pino nativo
- **Desvantagem:** Ecossistema de plugins menor; curva de aprendizagem adicional para o padrão de plugins do Fastify; migração do código existente teria custo alto
- **Não adoptado** — Express foi a escolha natural pelo conhecimento prévio; Fastify identificado como alternativa de longo prazo

### 2. NestJS
- **Vantagem:** Framework opinativo com estrutura clara (modules, controllers, services, providers); TypeScript first; injecção de dependências; decorators
- **Desvantagem:** Over-engineering para o tamanho actual do projecto; curva de aprendizagem acentuada; abstracção excessiva obscurece o que acontece em cada request; incompatível com a filosofia de "código legível sem framework mágico"
- **Descartado** por overhead de complexidade desproporcional

### 3. Hono
- **Vantagem:** Extremamente leve; TypeScript nativo; compatível com Edge runtimes (Cloudflare Workers)
- **Desvantagem:** Ecossistema jovem; menos recursos para multi-tenancy; compatibilidade com MongoDB/Mongoose menos testada
- **Descartado** por imaturidade do ecossistema para o caso de uso

### 4. Express 5 (beta)
- **Vantagem:** Versão mais recente; melhorias em async error handling (sem necessidade de `next(err)` manual)
- **Desvantagem:** API em beta, breaking changes em middleware async; documentação incompleta; bibliotecas de terceiros ainda não testadas com Express 5
- **Não adoptado** — identificado como upgrade natural quando Express 5 atingir estabilidade

---

## Consequências

### Positivas
- **Maturidade e ecossistema:** Express 4 tem o maior ecossistema de middleware do Node.js; compatibilidade com todas as bibliotecas necessárias (helmet, express-rate-limit, cors, etc.)
- **Conhecimento da equipa:** Curva de aprendizagem zero — Express é o framework mais documentado do ecossistema Node.js
- **Flexibilidade:** Sem opiniões fortes sobre estrutura — permite adaptar a arquitectura às necessidades do sistema
- **Pipeline de middleware claro:** O modelo de middleware do Express é intuitivo para raciocinar sobre o fluxo de uma request

### Negativas / Trade-offs
- **Sem versionamento de API:** Todas as rotas estão em `/api/` sem `/api/v1/` — qualquer breaking change nas rotas força migração simultânea de todos os clientes (frontend PWA); **risco crescente** à medida que o produto evolui e novos clientes são adicionados
- **Performance inferior ao Fastify:** Para o volume actual (1 tenant activo) não é relevante; pode tornar-se relevante com 100+ tenants activos simultâneos
- **Pipeline de auth com queries duplicadas:** `requirePlan` e `checkLimit` fazem consultas separadas ao documento `Tenant` no banco de dados em cada request protegida — 2 queries adicionais por request que poderiam ser consolidadas numa só
- **Express 5 sem plano de migração:** Express 4 não terá suporte activo indefinidamente; migração para Express 5 tem breaking changes em async error handling que afectarão todos os controllers

### Decisão pendente: versionamento de API
> A ausência de versionamento (`/api/v1/`) é um risco crescente. Recomendado introduzir prefixo `/api/v1/` antes de onboarding de novos tenants, enquanto existe apenas um cliente activo e a migração tem custo mínimo.

---

## Links e Referências

- **Presente desde:** commit inicial (2025-04-25)
- **Produção desde:** 2025-10-28
- **Ficheiros chave:**
  - `src/app.js` — Setup Express com 15+ grupos de rotas
  - `src/middlewares/authMiddleware.js` — Pipeline de 5 camadas de auth
- **ADRs relacionados:**
  - [ADR-004: JWT Authentication Strategy](./ADR-004-jwt-authentication-strategy.md)
  - [ADR-005: RBAC com Sistema Duplo](./ADR-005-rbac-dual-system-role-permissions.md)
