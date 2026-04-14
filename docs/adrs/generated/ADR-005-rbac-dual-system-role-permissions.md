# ADR-005: RBAC com Sistema Duplo — Role Hierarchy + Granular Permissions

**Status:** Accepted  
**Data:** 2025-12-31  
**Módulo:** AUTH  
**Autor:** André dos Reis  
**Score de Impacto:** 100 (Alto)

---

## Contexto

O sistema serve profissionais autónomos que podem ter colaboradores (recepcionistas, terapeutas) com acessos diferenciados. A arquitectura multi-tenant exige que o controlo de acesso funcione dentro do contexto de cada tenant — um `admin` de um tenant não deve ter qualquer acesso ao tenant de outro profissional.

Ao mesmo tempo, o sistema tem um nível de administração global (`superadmin`) para gestão da plataforma. Esta dualidade — acesso global da plataforma vs acesso scoped por tenant — precisava ser modelada num sistema de autorização coerente.

---

## Decisão

Adoptar um **sistema de autorização duplo** que combina:

**1. Hierarquia de roles** para controlo de acesso por nível:
```
superadmin > admin > gerente > recepcionista > terapeuta
```

**2. Mapa de permissões granulares** (`User.permissoes`) com flags booleanas por funcionalidade, para customização fine-grained dentro dos roles intermediários.

Os dois mecanismos são expostos via middlewares separados:
- `authorize(...roles)` — verifica se o role do utilizador está na lista permitida
- `requirePermission(permission)` — verifica uma permissão granular específica

**Regra crítica:** `superadmin` e `admin` fazem bypass de **todas** as verificações de permissão via `hasPermission()` — retornam `true` sem consultar o mapa de permissões. Os roles intermediários (`gerente`, `recepcionista`, `terapeuta`) são verificados contra o mapa granular.

```javascript
// src/models/User.js
UserSchema.methods.hasPermission = function (permission) {
  if (this.role === 'superadmin' || this.role === 'admin') {
    return true; // Bypass total — admin tem acesso a tudo
  }
  return this.permissoes[permission] === true;
};
```

---

## Alternativas Consideradas

### 1. RBAC puro (apenas roles, sem permissões granulares)
- **Vantagem:** Simplicidade — um middleware, uma verificação
- **Desvantagem:** Inflexível para o caso de uso de "recepcionista que só pode ver agendamentos mas não dados financeiros" — requereria criar roles muito específicos ou dar acesso demasiado amplo
- **Descartada** por falta de granularidade para o modelo de negócio

### 2. ABAC (Attribute-Based Access Control)
- **Vantagem:** Máxima flexibilidade — políticas baseadas em atributos do utilizador, recurso e contexto
- **Desvantagem:** Complexidade de implementação significativamente maior; overkill para o tamanho actual do sistema; difícil de debugar
- **Descartada** por complexidade desproporcional ao problema actual

### 3. Sistema unificado (role + permission numa só verificação)
- **Vantagem:** Elimina a dualidade e o risco de inconsistência entre `authorize()` e `requirePermission()`
- **Desvantagem:** Requeria redesenho completo do sistema de auth; não havia tempo de implementação na fase actual
- **Não implementado** — identificado como melhoria futura

---

## Consequências

### Positivas
- **Flexibilidade operacional:** O tenant admin pode customizar permissões dos colaboradores sem intervenção da plataforma
- **Granularidade por funcionalidade:** Possível restringir acesso a módulos específicos (financeiro, anamnese) por utilizador
- **Hierarquia clara:** A cadeia `superadmin > admin > ...` é intuitiva para onboarding de novos utilizadores

### Negativas / Trade-offs
- **Dualidade confusa:** Um developer pode usar `authorize('admin')` onde deveria usar `requirePermission('editarCliente')` — ambos compilam mas têm semânticas diferentes; code review é a única barreira
- **Admin bypass invisível:** Um `admin` comprometido tem acesso irrestrito a todos os dados do tenant sem qualquer log de permissão específica — risco de over-privilege
- **Queries duplicadas:** `requirePlan` e `checkLimit` (middleware de plano) fazem consultas separadas ao Tenant, adicionando latência por request protegida
- **Sem resource-level permissions:** Não é possível definir "este terapeuta só vê os seus próprios agendamentos" — acesso é all-or-nothing por módulo

### Risco documentado
> O bypass total de permissões para `admin` é uma decisão deliberada de simplicidade operacional. O risco é que um utilizador `admin` comprometido tem acesso irrestrito. Mitigação: rate limiting nas rotas de auth, rotação de JWT, e auditoria de logins via Pino/Sentry.

---

## Links e Referências

- **Implementado:** 2025-12-31
- **Ficheiros chave:**
  - `src/models/User.js` — Schema de roles e permissões
  - `src/middlewares/authMiddleware.js` — `authorize()`, `requirePermission()`, `checkLimit()`
- **ADRs relacionados:**
  - [ADR-004: JWT Authentication Strategy](./ADR-004-jwt-authentication-strategy.md)
