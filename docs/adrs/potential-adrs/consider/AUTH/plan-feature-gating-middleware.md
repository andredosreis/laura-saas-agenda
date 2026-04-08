# Potential ADR: Feature Gating por Plano via Middleware (requirePlan + checkLimit)

**Module**: AUTH
**Category**: Architecture / Business
**Priority**: Consider (Score: 95)
**Date Identified**: 2026-04-08

---

## What Was Identified

O controle de acesso por plano (trial, basic, pro) e os limites de uso (maxClientes, maxAgendamentosMes) são enforçados como **middlewares na camada de auth**, não na camada de negócio. `requirePlan(...plans)` valida o tipo e status do plano; `checkLimit(limitType)` conta uso atual contra os limites configurados em `Tenant.limites`.

Os limites são armazenados como inteiros no documento Tenant (`-1` = ilimitado). O plano é também embutido no JWT access token (`plano: tenant.plano.tipo`) para checagem rápida, mas isso cria risco de dados desatualizados quando um tenant faz upgrade — o token antigo ainda carrega o plano anterior até expirar (1h).

`requirePlan` e `checkLimit` fazem consultas separadas ao Tenant no banco de dados, duplicando queries para cada request protegida.

## Why This Might Deserve an ADR

- **Impact**: Afeta monetização e entrega de features — lógica de negócio embutida em infraestrutura de auth
- **Trade-offs**: Middleware é conveniente mas mistura concerns (auth vs. billing vs. feature flags); dados de plano no JWT ficam stale por até 1h após upgrade
- **Complexity**: Duas queries DB separadas por request (`requirePlan` + `checkLimit`); poderia ser uma query consolidada
- **Team Knowledge**: Desenvolvedores adicionando novas features precisam saber quais middlewares aplicar; não há documentação sobre quando usar `requirePlan` vs `requirePermission`
- **Future Implications**: Com múltiplos planos e features, a lógica de gating em middleware pode se tornar um labirinto

## Evidence Found in Codebase

### Key Files
- [`src/middlewares/authMiddleware.js`](../../../../src/middlewares/authMiddleware.js) — requirePlan(), checkLimit()
- [`src/models/Tenant.js`](../../../../src/models/Tenant.js) — Tenant.limites e Tenant.plano

### Code Evidence
```javascript
// Tenant.limites no schema
limites: {
    maxUsuarios: { type: Number, default: 1 },
    maxClientes: { type: Number, default: 50 },
    maxAgendamentosMes: { type: Number, default: 100 },
    iaAtiva: { type: Boolean, default: false },
}
// checkLimit faz query live no DB — não usa JWT (correto para dados atualizados)
// mas duplica a query que requirePlan já fez na mesma request
const tenant = await Tenant.findById(req.tenantId);
```

### Impact Analysis
- Implementado: 2025-12-31
- Dados de plano no JWT: stale por até 1h após upgrade
- Queries duplicadas: requirePlan + checkLimit = 2 consultas Tenant por request

## Questions to Address in ADR (if created)

- Por que feature gating em middleware em vez de service layer?
- Como lidar com o problema de plano stale no JWT após upgrade?
- Como consolidar as duas queries de Tenant em uma?
- Existe um sistema de notificação quando limites são atingidos?

## Related Potential ADRs
- [JWT Authentication Strategy](../must-document/AUTH/jwt-authentication-strategy.md)
- [RBAC Dual-System](../must-document/AUTH/rbac-dual-system-role-permissions.md)
