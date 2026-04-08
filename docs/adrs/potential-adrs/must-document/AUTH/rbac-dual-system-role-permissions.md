# Potential ADR: RBAC com Sistema Duplo — Role Hierarchy + Granular Permissions

**Module**: AUTH
**Category**: Security / Architecture
**Priority**: Must Document (Score: 100)
**Date Identified**: 2026-04-08

---

## What Was Identified

O sistema de autorização combina dois mecanismos sobrepostos: uma hierarquia de roles (`superadmin > admin > gerente > recepcionista > terapeuta`) e um mapa de permissões granulares (`User.permissoes`) com flags booleanas por funcionalidade. O middleware `authorize(...roles)` faz checagem de role; `requirePermission(permission)` faz checagem granular. Critically, `superadmin` e `admin` bypassam **ambas** as verificações via `hasPermission()` — retornando `true` sem consultar o mapa de permissões.

Implementado em **31 de dezembro de 2025** como parte da fundação de auth multi-tenant, o sistema de permissões granulares existe principalmente para os roles intermediários (`gerente`, `recepcionista`, `terapeuta`), permitindo customização fine-grained de acesso por usuário dentro de um tenant.

## Why This Might Deserve an ADR

- **Impact**: Controla acesso a todas as funcionalidades do sistema para todos os usuários não-admin
- **Trade-offs**: Dois sistemas sobrepostos geram inconsistência — um dev pode usar `authorize('admin')` onde deveria usar `requirePermission('editarCliente')`, criando brechas silenciosas
- **Complexity**: O bypass para admin é invisível; um `admin` mal configurado tem acesso total sem auditoria das permissões
- **Team Knowledge**: A dualidade role+permission não é intuitiva; a regra "admin bypassa tudo" precisa ser documentada explicitamente
- **Future Implications**: Expandir para ABAC (attribute-based) ou resource-level permissions exigirá refatoração significativa

## Evidence Found in Codebase

### Key Files
- [`src/models/User.js`](../../../../src/models/User.js) — Schema de roles e permissões
- [`src/middlewares/authMiddleware.js`](../../../../src/middlewares/authMiddleware.js) — authorize(), requirePermission(), checkLimit()

### Code Evidence
```javascript
// src/models/User.js
UserSchema.methods.hasPermission = function (permission) {
    if (this.role === 'superadmin' || this.role === 'admin') {
        return true; // Bypass all permission checks
    }
    return this.permissoes[permission] === true;
};
```

### Impact Analysis
- Implementado: 2025-12-31
- Hierarquia: superadmin > admin > gerente > recepcionista > terapeuta
- Risk: admin bypass pode ser over-privilege se um tenant admin for comprometido

## Questions to Address in ADR (if created)

- Por que manter dois sistemas (role + permission) em vez de um unificado?
- Por que admin bypassa permissões? Qual é o cenário de uso?
- As permissões granulares são customizáveis por tenant ou são globais?
- Existe plano para permissions a nível de recurso (e.g., só ver seus próprios agendamentos)?

## Related Potential ADRs
- [JWT Authentication Strategy](./jwt-authentication-strategy.md)
- [Plan Feature Gating via Middleware](../../consider/AUTH/plan-feature-gating-middleware.md)
