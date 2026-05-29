# ADR-024: Painel Super-Admin para Gestão Multi-Tenant

**Status:** Proposed
**Data:** 2026-05-29
**Módulo:** ADMIN
**Autor:** André dos Reis
**Score de Impacto:** 130 (Alto)

---

## Contexto

À medida que o Marcai passa de testes para vários clientes pagantes, surge a necessidade de **gerir todos os tenants a partir de um único lugar** — criar novos clientes, configurar os seus planos e limites, suspender/reactivar, e acompanhar o uso de cada um.

Hoje, a criação e configuração de um tenant é feita de forma dispersa:
- Um tenant nasce no fluxo de **registo** (`authController`), que cria `Tenant` + `User` admin numa transacção.
- Ajustes de plano, limites ou estado implicam mexer directamente na base de dados ou em scripts de manutenção (`scripts/maintenance/`, `migrationController`).
- Não há visão agregada de "quantos clientes tenho, em que plano, com que uso".

**Mal-entendido corrigido (importante):** a arquitectura é **database-per-tenant dentro de um único cluster** (ADR-001) — **não** um cluster por cliente. Criar um cliente = criar uma base `tenant_<id>` no mesmo cluster Atlas, não provisionar infraestrutura nova. O painel super-admin é precisamente a ferramenta que torna esta operação um clique em vez de um processo manual.

O sistema **já tem o alicerce** para isto:
- O role **`superadmin`** já existe e contorna o `authorize()` (acesso a todos os recursos) — é a excepção sancionada à regra de isolamento multi-tenant.
- `Tenant`, `User` e `UserSubscription` vivem na **DB partilhada** (`laura-saas`), acessíveis sem resolver um tenant específico.
- O padrão `getTenantDB(tenantId)` + `getModels(db)` permite agregar métricas atravessando as DBs de cada tenant quando necessário.

---

## Decisão

Construir um **painel super-admin** como um **módulo dedicado e isolado**, que atravessa deliberadamente a fronteira de isolamento multi-tenant — mas sob guardas de segurança reforçadas.

### Princípios de desenho

1. **O `superadmin` é a única excepção legítima ao isolamento.** Todas as rotas do painel exigem `role === 'superadmin'`, verificado no backend (nunca confiar no frontend).
2. **Acesso cross-tenant é auditado.** Toda acção de superadmin (criar/suspender tenant, mudar plano, ver dados de um cliente) é registada num **audit log** imutável na DB partilhada: quem, quando, o quê, sobre que tenant.
3. **Separação de superfície.** O painel super-admin é um conjunto de rotas e páginas **distintas** das do produto normal — idealmente com login próprio e, no futuro, 2FA obrigatório.
4. **Reutiliza a infraestrutura existente.** Sem novo cluster, sem nova base de dados global — usa a DB partilhada e o padrão `getTenantDB`/`getModels` já existentes.

### Capacidades do painel (escopo)

| Capacidade | Fonte de dados |
|---|---|
| Listar todos os tenants (nome, plano, estado, data, uso) | DB partilhada (`Tenant`, `UserSubscription`) |
| Criar novo tenant + user admin (substitui criação manual) | DB partilhada (transacção `Tenant`+`User`) |
| Configurar plano, limites e estado de um tenant | DB partilhada (`Tenant`) |
| Suspender / reactivar tenant | DB partilhada (`Tenant.plano.status`) |
| Ver métricas de uso por tenant (nº clientes, agendamentos, mensagens) | Agregação cross-tenant via `getTenantDB` |
| Configurar integrações por tenant (instância WhatsApp/Evolution — ADR-021) | DB partilhada + Evolution API |
| Audit log de acções super-admin | DB partilhada (novo model `AuditLog`) |

---

## Alternativas Consideradas

### 1. Continuar com scripts de manutenção + edição manual na DB
- **Vantagem:** zero desenvolvimento
- **Desvantagem:** propenso a erro humano, não escala, sem auditoria, sem visão agregada; inviável com vários clientes
- **Descartada:** é exactamente a dor que motiva esta ADR

### 2. Cluster (ou base de dados) por cliente, provisionado manualmente
- **Vantagem:** isolamento físico máximo
- **Desvantagem:** trabalho operacional enorme por cliente; custo multiplicado; **contraria a arquitectura DB-per-tenant existente** (ADR-001), que já dá isolamento lógico forte num só cluster
- **Descartada:** o utilizador chegou a considerar isto e concluiu (correctamente) que "dá um trabalhão" — não é necessário nem desejável

### 3. Reutilizar o painel de admin normal com flags de role
- **Vantagem:** menos páginas novas
- **Desvantagem:** mistura a superfície de superadmin (cross-tenant, perigosa) com a do produto (tenant-scoped); aumenta o risco de fuga de isolamento por engano; dificulta auditoria e 2FA dedicado
- **Não adoptada:** a separação de superfícies é um requisito de segurança, não um luxo

### 4. Ferramenta externa (Retool, Forest Admin, Metabase) ligada à DB
- **Vantagem:** rápido de montar, UI pronta
- **Desvantagem:** dá acesso amplo à DB a uma ferramenta terceira (risco GDPR — dados pessoais UE); custo de licença; menos controlo sobre auditoria e regras de negócio
- **Considerada para protótipo interno**, mas não para produção com dados de clientes reais

---

## Consequências

### Positivas
- **Operação de clientes deixa de ser manual:** criar/configurar um tenant passa a ser um clique, sem tocar na DB nem em scripts.
- **Visão agregada do negócio:** quantos clientes, em que planos, com que uso — base para decisões e faturação.
- **Auditoria de acessos privilegiados:** o audit log dá rasto de todas as acções cross-tenant — essencial para confiança e GDPR.
- **Reutiliza o que já existe:** role `superadmin`, DB partilhada, padrão de modelos — desenvolvimento incremental, sem nova infra.

### Negativas / Trade-offs
- **Superfície de altíssimo risco:** uma falha de autorização aqui expõe **todos** os tenants. Exige revisão de segurança rigorosa e testes dedicados.
- **Quebra deliberada do isolamento:** o código do painel viola intencionalmente a regra "toda query inclui `tenantId`". Tem de estar **fisicamente separado** do código do produto, para que a regra continue inviolável fora deste módulo.
- **Responsabilidade de auditoria:** o audit log tem de ser fiável e imutável — mais um componente a manter.
- **Necessita de autenticação reforçada:** login separado e (idealmente) 2FA para superadmin — trabalho adicional.

### Guardas de segurança obrigatórias
> 1. Middleware `requireSuperadmin` em **todas** as rotas do painel, verificando `req.user.role === 'superadmin'` no backend.
> 2. Audit log de toda acção (write **e** leitura de dados de tenant).
> 3. Acesso a recurso inexistente continua a devolver 404 (não revelar).
> 4. Rate limiting próprio e login separado do produto.
> 5. Testes de autorização dedicados: um user não-superadmin **nunca** alcança nenhuma rota do painel (403/404).

---

## Plano de Implementação

Faseado, do mais seguro/fundacional para o mais avançado.

### Fase 1 — Fundações de segurança
1. Middleware `requireSuperadmin` (`src/modules/admin/` ou `src/shared/middlewares/`).
2. Model `AuditLog` na DB partilhada (quem, quando, acção, tenant alvo, metadata).
3. Testes de autorização: garantir que não-superadmin é sempre bloqueado.

### Fase 2 — Leitura (read-only primeiro, menos arriscado)
1. Rotas super-admin: listar tenants (paginação ≤100), ver detalhe de um tenant, métricas de uso (agregação cross-tenant via `getTenantDB`).
2. Frontend: páginas de listagem + detalhe (reutilizar design system Tailwind).

### Fase 3 — Escrita controlada
1. Criar tenant + user admin (mover/reutilizar a lógica transaccional do registo).
2. Configurar plano/limites/estado; suspender/reactivar.
3. Cada acção grava no audit log.

### Fase 4 — Integrações por tenant
1. Configurar instância WhatsApp/Evolution por tenant (ADR-021) a partir do painel.
2. (Futuro) Onboarding guiado de cliente novo ponta-a-ponta.

### Fase 5 — Hardening
1. Login separado para superadmin + 2FA.
2. Rate limiting dedicado.
3. Revisão de segurança completa do módulo.

---

## Links e Referências

- **Decidido em:** sessão de 2026-05-29 (separado da ADR-023 a pedido do utilizador)
- **Contexto:** produto em fase de testes, poucos clientes — implementação incremental sem urgência de infra cara
- **ADRs relacionados:**
  - [ADR-001: Database-per-Tenant Architecture](./ADR-001-database-per-tenant-architecture.md) — um cluster, muitos tenants; o painel gere tenants, não clusters
  - [ADR-002: Model Registry Factory Pattern](./ADR-002-model-registry-factory-pattern.md) — `getTenantDB`/`getModels` usados na agregação cross-tenant
  - [ADR-005: RBAC Dual System (Role + Permissions)](./ADR-005-rbac-dual-system-role-permissions.md) — o role `superadmin` é a base de autorização do painel
  - [ADR-021: Evolution Instance per Tenant](./ADR-021-evolution-instance-per-tenant.md) — configuração de WhatsApp por tenant no painel
  - [ADR-023: Consolidação da Infraestrutura num VPS Único (Contabo)](./ADR-023-consolidacao-vps-contabo.md) — onde o painel correrá; capacity planning fica numa nota separada, não nesta ADR
