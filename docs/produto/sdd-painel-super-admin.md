# SDD — Painel Super-Admin Multi-Tenant

**Status:** Proposed
**Data:** 2026-06-10
**Módulo:** ADMIN (`src/modules/admin/`)
**Autor:** Architect agent (a validar por André dos Reis)
**Decide:** [ADR-024 — Painel Super-Admin para Gestão Multi-Tenant](./adrs/generated/ADR-024-painel-super-admin-multi-tenant.md)
**Relacionado:** ADR-001 (database-per-tenant), ADR-002 (registry/getModels), ADR-005 (RBAC role+permissions), ADR-021 (Evolution instance por tenant), ADR-013 (BullMQ)

> Este documento é o **COMO**. A **decisão** (porquê, escopo, fases) está fechada na ADR-024 e **não é repetida** aqui — é referenciada. O SDD detalha o desenho técnico de cada peça, mapeado ao código real que já existe.

---

## 1. Objectivo

Concretizar o painel super-admin descrito na ADR-024: um **módulo dedicado e fisicamente isolado** (`src/modules/admin/`) que permite, a partir de um único lugar, listar/criar/configurar/suspender tenants e ver uso agregado — atravessando deliberadamente a fronteira de isolamento multi-tenant, sob guardas reforçadas e auditoria total.

O âmbito é maioritariamente **backend novo (rotas + agregação + escrita auditada)** mais uma **superfície frontend separada do produto**. Reaproveita o role `superadmin`, a DB partilhada (`Tenant`/`User`/`UserSubscription`) e o padrão `getTenantDB`/`getModels` já existentes.

---

## 2. Princípio nuclear (o que evita catástrofe)

> **O `superadmin` é a ÚNICA excepção sancionada ao isolamento.** Tudo é verificado no backend; tudo é auditado; o código que quebra o isolamento vive **só** dentro de `src/modules/admin/` e em mais lado nenhum.

Três regras invioláveis que tudo o resto serve:

1. **Verificação no backend, sempre.** Nenhuma rota do painel confia no frontend. `authenticate` + `requireSuperadmin` em **todas** as rotas, sem excepção.
2. **Contenção física da quebra de isolamento.** A regra "toda query inclui `tenantId`" (`.claude/rules/multi-tenant.md`) continua inviolável fora deste módulo. Só `src/modules/admin/` pode iterar tenants e abrir DBs alheias via `getTenantDB`. Isto é garantido por revisão (`multi-tenant-guard`), não por convenção.
3. **Tudo deixa rasto.** Leitura **e** escrita de dados de tenant gravam em `AuditLog` (DB partilhada). Sem audit log, a acção não acontece (ver §5.2 sobre política de falha).

---

## 3. O que já existe (reaproveitar, NÃO reconstruir)

Verificado no código real em 2026-06-10. A Fase 1 da ADR-024 está **parcialmente construída** — o SDD reconhece-o e parte daí.

| Peça | Onde | Estado | Nota |
|---|---|---|---|
| Role `superadmin` | `src/models/User.js:60` (enum) | ✅ existe | `authorize()` faz bypass para `superadmin` (`src/middlewares/auth.js:77`) |
| `requireSuperadmin` | `src/modules/admin/requireSuperadmin.js` | ✅ existe | 401 sem user, 403 se role ≠ superadmin, com `logger.warn`. Pronto a usar |
| Model `AuditLog` | `src/models/AuditLog.js` | ✅ existe | DB partilhada, append-only, `record()` estático, índices por tenant/actor/action/data |
| DB partilhada | `Tenant`, `User`, `UserSubscription` em `laura-saas` | ✅ existe | Acessíveis sem resolver tenant — base da listagem |
| Agregação cross-tenant | `getTenantDB(tenantId)` + `getModels(db)` | ✅ existe | `src/config/tenantDB.js`, `src/models/registry.js`. Reutiliza o pool, só muda namespace |
| Transacção de criação tenant+user | `register()` em `src/modules/auth/authController.js:71-205` | ✅ existe | Lógica a **extrair** para um service partilhado, não a duplicar |
| Criação de superadmin protegida | `src/modules/users/usersController.js:66` | ✅ existe | Só superadmin cria superadmin (defense-in-depth) |
| Config WhatsApp por tenant | `Tenant.whatsapp.{instanceName,instanceToken,...}` | ✅ existe | ADR-021; índice único sparse em `whatsapp.instanceName` |

### Lacunas a fechar

| Lacuna | Decisão de desenho |
|---|---|
| `requireSuperadmin` existe mas **nenhuma rota o usa** (módulo admin não está montado em `app.js`) | Criar `adminRoutes.js` e montá-lo **fora** do loop `apiResources` (ver §6.1) |
| `AuditLog.record()` existe mas **ninguém chama** | Definir helper `logAdminAction(req, action, {...})` e chamá-lo em cada rota (ver §6.3) |
| Não há controller nem rotas admin | Construir `adminController.js` (leitura) e escrita faseada (ver §6) |
| Lógica de criação tenant+user só vive dentro de `register()` (acoplada a JWT/email/refresh) | Extrair núcleo para `src/modules/admin/tenantProvisioningService.js`, reutilizado por `register` e pelo painel |
| Agregação cross-tenant pode ficar pesada com N tenants | Limitar concorrência + cache curto (ver §6.4) |
| Sem superfície frontend | Páginas separadas sob `/admin/*` (ver §7) |
| `authenticate` só injecta `req.db`/`req.models` quando há `tenantId` | Rotas admin **não dependem** de `req.models`; resolvem DBs alvo via `getTenantDB(targetTenantId)` explicitamente (ver §6.4) |

---

## 4. Princípio de desenho do módulo (isolamento físico)

```
src/modules/admin/
├── requireSuperadmin.js          # ✅ já existe — guarda de todas as rotas
├── adminRoutes.js                # 🆕 router único do painel (montado fora de apiResources)
├── adminController.js            # 🆕 leitura: listar/detalhe/métricas (Fase 2)
├── adminWriteController.js       # 🆕 escrita: criar/configurar/suspender (Fase 3)
├── tenantProvisioningService.js  # 🆕 núcleo transaccional Tenant+User (extraído de authController)
├── crossTenantMetrics.js         # 🆕 agregação cross-tenant via getTenantDB/getModels
├── auditHelper.js                # 🆕 logAdminAction(req, action, meta) → AuditLog.record
└── adminSchemas.js               # 🆕 schemas Zod de input (criar tenant, configurar plano)
```

**Regra de ouro:** este é o **único** directório autorizado a chamar `getTenantDB` com um `tenantId` que não vem de `req.user.tenantId`. Qualquer ocorrência desse padrão fora de `src/modules/admin/` é um achado 🔴 do `multi-tenant-guard`.

---

## 5. Segurança (guardas obrigatórias da ADR-024)

### 5.1 Cadeia de middleware (todas as rotas)

```js
// src/modules/admin/adminRoutes.js
router.use(authenticate, requireSuperadmin, adminLimiter);
```

- `authenticate` (`src/middlewares/auth.js`) — popula `req.user` a partir do JWT. **Atenção:** o payload usa `req.user.userId` (não `_id`) — ver `generateAccessToken` em `authController.js:33`. O `auditHelper` e logs devem ler `req.user.userId`.
- `requireSuperadmin` — **redundante** com `authorize('superadmin')`, e existe à mesma de propósito: é **defesa em profundidade**. `authorize` é um helper genérico do produto; uma alteração futura ao seu comportamento (ex: novo bypass) não pode, por acidente, abrir o painel. `requireSuperadmin` é uma guarda dedicada, explícita, testada isoladamente, que faz uma só coisa: `role === 'superadmin'` ou nada passa.
- `adminLimiter` — rate limiter **próprio** do painel (Fase 5). Os limiters existentes (`src/middlewares/rateLimiter.js`) são por rota pública de auth; o admin precisa do seu (ex: 100 req / 5 min por IP), separado.

### 5.2 Audit log: leitura E escrita

- **Escrita** (criar/suspender/configurar): a auditoria é **bloqueante** — se `AuditLog.record()` falhar, a operação **falha** (500). Rasto fiável é requisito, não best-effort. Padrão: gravar audit log na **mesma transacção** que a escrita quando aplicável, ou imediatamente a seguir com falha propagada.
- **Leitura** (listar/detalhe/métricas): a auditoria é **best-effort** — regista-se a acção (`tenant.view`, `tenants.list`) mas uma falha do audit log **não** bloqueia a leitura (loga-se via `logger` e continua). Justificação: não negar visibilidade operacional por um log indisponível; o `AuditLog.record()` já foi desenhado para "não engolir erros" e deixar o chamador decidir.

`action` segue a convenção pontilhada já presumida pelo model: `tenant.create`, `tenant.suspend`, `tenant.reactivate`, `tenant.plan.update`, `tenant.view`, `tenants.list`, `tenant.metrics.view`, `tenant.whatsapp.configure`.

### 5.3 404 não-revelador

Acesso a um `tenantId` inexistente devolve **404** com mensagem genérica (`{ success: false, error: 'Tenant não encontrado' }`) — mesma postura de `.claude/rules/multi-tenant.md`. Aqui o 404 não é por isolamento (o superadmin pode ver tudo) mas por **higiene**: não confirmar/negar existência via códigos distintos.

### 5.4 Login separado + 2FA (Fase 5)

A ADR exige superfície de auth separada. Desenho:
- **Fase 1-4:** reutiliza o login existente; o painel só abre se o JWT trouxer `role === 'superadmin'`. Aceitável porque o superadmin é um `User` normal com role elevado.
- **Fase 5:** login dedicado `/admin/login` + 2FA (TOTP). Decisão de implementação de 2FA fica para ADR própria se introduzir lib nova — **não** decidir aqui.

### 5.5 Testes de autorização obrigatórios (`quality-agent`)

Para **cada** rota do painel, no mínimo:
1. `admin` (não superadmin) → **403** (nunca alcança o controller).
2. `recepcionista`/`terapeuta` → **403**.
3. Sem token → **401**.
4. Superadmin → **200/201**.
5. `targetTenantId` inexistente → **404**.

A ausência destes testes é 🔴 Crítico (mesma régua de `.claude/rules/testing.md`).

---

## 6. Backend

Regras aplicáveis e citadas: `.claude/rules/express-routes.md`, `express-controllers.md`, `express-middlewares.md`, `mongoose-models.md`, `mongoose-queries.md`, `express-common-conventions.md`, `multi-tenant.md`. Em particular: contrato `{ success, data/error }`; imports ESM com `.js`; paginação ≤100; sem secrets hardcoded; sem `await` em loop.

### 6.1 Montagem das rotas (separação de superfície)

O painel **não** entra no array `apiResources` de `src/app.js` (linhas 93-119), porque esse loop faz dual-mount em `/api` **e** `/api/v1` junto das rotas do produto. Para manter a separação de superfície exigida pela ADR-024, monta-se explicitamente — à semelhança das rotas internas `/api/internal/*` (app.js:123-124):

```js
// src/app.js — fora do loop apiResources
import adminRoutes from './modules/admin/adminRoutes.js';
app.use('/api/admin', adminRoutes);   // superfície dedicada, sem dual-mount, sem alias de produto
```

Caminho canónico: **`/api/admin/*`**. Não há versão `/api/v1/admin` nem alias legacy — é uma superfície nova, nasce limpa.

### 6.2 `requireSuperadmin` — já existe

Vive em `src/modules/admin/requireSuperadmin.js`. Sem alterações de fundo. Apenas confirmar que lê `req.user.userId` no log (já faz fallback `req.user.userId || req.user._id`). **Porque é redundante com `authorize` mas existe à mesma:** ver §5.1 (defesa em profundidade).

### 6.3 `AuditLog` — já existe; falta o helper de chamada

Model em `src/models/AuditLog.js` (DB partilhada, append-only, `record()` estático). Adicionar um helper fino para uniformizar as chamadas e capturar contexto do request:

```js
// src/modules/admin/auditHelper.js
import AuditLog from '../../models/AuditLog.js';

export async function logAdminAction(req, action, { targetTenantId = null, metadata = {} } = {}) {
  return AuditLog.record({
    actorUserId: req.user.userId,        // payload JWT usa userId
    actorEmail:  req.user.email,
    action,
    targetTenantId,
    metadata,
    ip: req.ip,
  });
}
```

Imutabilidade: garantida na aplicação (sem rotas de update/delete; `updatedAt: false` no schema). **Não** expor nenhum endpoint que modifique `AuditLog`. Leitura do audit log (consulta) é Fase 2+ e é também ela auditada? Não — ler o próprio audit log não se auto-audita (evita recursão); regista-se via `logger`.

### 6.4 Agregação cross-tenant — desenho de performance

Métricas por tenant (nº clientes, agendamentos, mensagens) vivem **dentro** da DB de cada tenant — é preciso abrir cada DB e contar. Riscos: N tenants → N conexões lógicas + N×M `countDocuments`. Desenho:

```js
// src/modules/admin/crossTenantMetrics.js
import pLimit from 'p-limit';            // ou implementação interna equivalente
import { getTenantDB } from '../../config/tenantDB.js';
import { getModels } from '../../models/registry.js';

const limit = pLimit(8);                 // concorrência limitada — nunca await-em-loop, nunca N-paralelo total

export async function metricsForTenants(tenantIds) {
  // sem await em loop (regra); Promise.all com limite de concorrência
  return Promise.all(tenantIds.map(id => limit(async () => {
    const db = getTenantDB(id);          // reutiliza pool, só muda namespace (não cria TCP)
    const { Cliente, Agendamento, Mensagem } = getModels(db);
    const [clientes, agendamentos, mensagens] = await Promise.all([
      Cliente.estimatedDocumentCount(),
      Agendamento.estimatedDocumentCount(),
      Mensagem.estimatedDocumentCount(),
    ]);
    return { tenantId: id, clientes, agendamentos, mensagens };
  })));
}
```

Decisões de desenho:
- **Concorrência limitada** (`pLimit(8)`) — respeita "sem `await` em loop" mas não dispara N queries em paralelo descontrolado contra o cluster Atlas.
- **`estimatedDocumentCount()`** (metadata da coleção, O(1)) em vez de `countDocuments()` exacto quando o número aproximado chega para o dashboard. Para detalhe de um único tenant pode usar-se `countDocuments` exacto.
- **Métricas agregadas da lista NÃO são calculadas cross-tenant on-the-fly.** A listagem (§6.5) lê só a DB partilhada (`Tenant`/`UserSubscription`), que é barata. As métricas de uso pesadas só se calculam:
  - no **detalhe** de um tenant (1 DB), ou
  - num **endpoint de métricas dedicado** com **cache curto** (ex: TTL 5 min em memória ou via key-value do Redis já existente — ADR-013/BullMQ usa Redis). Decisão de cache em §10 (a validar).
- **Nota de escala (ADR-024):** com poucos clientes isto é trivial. O cache e os limites são preparação, não urgência.

### 6.5 Tabela de rotas (mapeada às capacidades da ADR-024)

Todas sob `/api/admin`, todas com `authenticate + requireSuperadmin + adminLimiter`. Contrato `{ success, data/error }`. Paginação ≤100.

| Método + path | Fase | Lê/Escreve | Audit action | Request (resumo) | Response `data` |
|---|---|---|---|---|---|
| `GET /api/admin/tenants` | 2 | DB partilhada | `tenants.list` (best-effort) | `?page&limit&q&status&plano` | `[{id,nome,slug,plano,status,createdAt}]` + `pagination` |
| `GET /api/admin/tenants/:id` | 2 | DB partilhada + 1 DB tenant | `tenant.view` (best-effort) | `:id` | `{tenant, subscription, metrics:{clientes,agendamentos,mensagens}}` |
| `GET /api/admin/metrics` | 2 | cross-tenant agregado | `tenant.metrics.view` (best-effort) | — | `{totalTenants, porPlano, porStatus, uso[]}` |
| `POST /api/admin/tenants` | 3 | DB partilhada (transacção) | `tenant.create` (bloqueante) | `{nomeEmpresa,nome,email,password,telefone,plano}` | `{tenant, user}` (sem segredos) |
| `PATCH /api/admin/tenants/:id/plano` | 3 | DB partilhada | `tenant.plan.update` (bloqueante) | `{tipo,limites,preco,ciclo}` | `{tenant}` |
| `PATCH /api/admin/tenants/:id/status` | 3 | DB partilhada | `tenant.suspend`/`tenant.reactivate` (bloqueante) | `{status:'suspenso'|'ativo'}` | `{tenant}` |
| `PUT /api/admin/tenants/:id/whatsapp` | 4 | DB partilhada + Evolution | `tenant.whatsapp.configure` (bloqueante) | `{instanceName,instanceToken,provider}` | `{whatsapp}` |
| `GET /api/admin/audit-logs` | 2 | DB partilhada (`AuditLog`) | — (não auto-audita) | `?page&limit&targetTenantId&action` | `[AuditLog]` + `pagination` |

Notas de contrato/desenho por rota:
- **Validação de `ObjectId`** antes de qualquer query por `:id` (`mongoose.Types.ObjectId.isValid`) → 400 (`.claude/rules/mongoose-queries.md`).
- **Nunca `req.body` directo no Model** (mass assignment) — desestruturar campos permitidos; validar com Zod (`adminSchemas.js`) seguindo o padrão de `usersSchemas.js`.
- **`POST /tenants`** reutiliza `tenantProvisioningService.create()` (§6.6) — **não** duplica a lógica de `register`.
- **`PATCH /status`** só altera `Tenant.plano.status`. Suspender **não** apaga dados (a DB `tenant_<id>` mantém-se). Efeito prático: o `login`/`requirePlan` do produto já bloqueiam `status` suspenso/cancelado (`auth.js:118`, `authController.js:281`) — a suspensão é coerente com o que o produto já respeita.
- **`GET /audit-logs`** é só-leitura, paginada, ordenada por `createdAt: -1` (índice já existe).
- **Dados sensíveis nunca na resposta**: `User` devolvido sem `passwordHash`/`refreshTokens` (usar `.select('-passwordHash -refreshTokens')` ou `toSafeObject()` já existente).

### 6.6 Extracção da transacção de provisioning

`register()` (`authController.js:71`) hoje cria `Tenant` + `User` admin com rollback manual (apaga o tenant se o user falhar — linhas 114-130), gera slug único, envia email de verificação, emite tokens. Para o painel, só interessa o **núcleo** (Tenant+User). Desenho:

```js
// src/modules/admin/tenantProvisioningService.js
// Núcleo partilhado: cria Tenant + User admin de forma atómica.
// Usar transacção Mongoose (mongoose.startSession) conforme .claude/rules/mongoose-models.md
// — substitui o rollback manual por commit/abort real (melhoria oportunista, não obrigatória nesta fase).
export async function provisionTenant({ nomeEmpresa, nome, email, password, telefone, plano }) { ... }
```

- `register()` passa a chamar `provisionTenant()` e a tratar só do que é específico do registo (email de verificação, tokens). **Brownfield:** refactor incremental, sem mudar o contrato de `register`.
- A criação pelo painel **não** emite tokens de sessão do novo tenant nem faz login automático — só provisiona. Decisão: o admin do novo tenant recebe email de definição de password (reutilizar fluxo `aceitar-convite`/reset já existente). **A validar** (§10).

---

## 7. Frontend

Regras aplicáveis: `.claude/rules/react-components.md`, `react-hooks.md`. Usar `useAuth`, `api.js`; design system indigo/purple/slate; `.tsx` para ficheiros novos; sem `fetch` directo; sem `localStorage` fora do `AuthContext`.

### 7.1 Superfície separada do produto

- Rotas sob **`/admin/*`** em `App.tsx`, com um **layout próprio** (`AdminLayout`) distinto do `ProtectedLayout` do produto. Não reutilizar a sidebar do produto — a superfície admin é visualmente e estruturalmente separada (requisito ADR-024).
- **Guarda de rota:** um `RequireSuperadmin` (wrapper de `ProtectedRoute`) que lê `useAuth()` e redirecciona se `user.role !== 'superadmin'`. **É só UX** — a fonte de verdade é o backend; o frontend nunca é a guarda real.
- `api.js` já injecta o Bearer token e trata refresh/401 — reutilizar tal e qual. Chamadas vão para `/api/admin/*` (o cliente admin pode ter um pequeno wrapper que prefixa, mas usa a mesma instância axios e interceptors).

### 7.2 Páginas

| Página | Rota | Fase | Conteúdo |
|---|---|---|---|
| Lista de tenants | `/admin/tenants` | 2 (read-only) | Tabela paginada: nome, plano, estado (badge), data, uso resumido. Filtros por status/plano + busca. |
| Detalhe de tenant | `/admin/tenants/:id` | 2 (read-only) | Dados do tenant, subscription, métricas (clientes/agendamentos/mensagens), audit log do tenant. |
| Criar tenant | `/admin/tenants/novo` | 3 (escrita) | Form (empresa, admin nome/email/telefone, plano). Submete `POST /api/admin/tenants`. |
| Editar plano/estado | `/admin/tenants/:id/editar` | 3 (escrita) | Plano/limites + botões suspender/reactivar (confirmação obrigatória). |
| Config WhatsApp | dentro do detalhe | 4 | `instanceName`/`instanceToken`/provider (ADR-021). |
| Audit log global | `/admin/audit` | 2 | Tabela paginada de `AuditLog` com filtros. |

- **Fase 1-2 é read-only** — marcado claramente. Botões de escrita só aparecem na Fase 3 e exigem diálogo de confirmação (suspender um tenant é destrutivo do ponto de vista do cliente).
- Estados de loading/erro inline + toasts conforme `react-components.md`. Nunca `alert()`.
- Lógica reutilizável (fetch tenants, mutate) em custom hooks (`useAdminTenants.ts`), não em páginas.

---

## 8. Fora de âmbito (anti scope-creep)

A ADR-024 já delimita; reforço explícito do que **NÃO** entra neste SDD:

- **Faturação/billing automático** (Stripe charge, faturas, dunning). Os campos `stripeCustomerId`/`stripeSubscriptionId` existem no `Tenant` mas integração de cobrança é decisão própria (ADR futura).
- **Self-service de onboarding do cliente** (signup público guiado, wizard ponta-a-ponta). O painel é operação interna; o registo público continua a ser o `register` existente.
- **Provisionamento de infra** (cluster/DB por cliente) — a ADR-024 rejeitou-o; database-per-tenant no cluster único (ADR-001) mantém-se.
- **2FA e login dedicado** ficam **definidos** aqui mas a **implementação** é Fase 5 (e 2FA pode exigir ADR se trouxer lib nova).
- **Edição arbitrária de dados de tenant** (mexer em clientes/agendamentos de um cliente pelo painel). O painel gere o **tenant** (plano, estado, instância), não o **conteúdo** de cada tenant. Acesso a conteúdo é só leitura de métricas agregadas.
- **Realtime** (websockets para o painel) — polling/refresh manual chega.

---

## 9. Fases de implementação (alinhadas com ADR-024)

> Estado real: Fase 1 está **parcialmente feita** (`requireSuperadmin` + `AuditLog` existem; falta montar e usar).

### Fase 1 — Fundações de segurança (quase feita)
- **Já existe:** `src/modules/admin/requireSuperadmin.js`, `src/models/AuditLog.js`.
- **Falta:** `auditHelper.js`; `adminRoutes.js` (esqueleto) montado em `app.js` como `/api/admin`; testes de autorização (não-superadmin → 403, sem token → 401) com `quality-agent`.
- **Toca:** `src/modules/admin/`, `src/app.js`, `tests/`.

### Fase 2 — Leitura (read-only, menos arriscado)
- `adminController.js`: `GET /tenants` (paginado, DB partilhada), `GET /tenants/:id`, `GET /metrics`, `GET /audit-logs`.
- `crossTenantMetrics.js` com concorrência limitada + `estimatedDocumentCount`.
- Frontend: `AdminLayout`, `/admin/tenants`, `/admin/tenants/:id`, `/admin/audit` (só leitura).
- Audit best-effort nas leituras.
- **Toca:** `src/modules/admin/`, `laura-saas-frontend/src/pages/admin/`, `App.tsx`, `tests/`.

### Fase 3 — Escrita controlada
- `tenantProvisioningService.js` (extrair de `authController.register`) com transacção Mongoose.
- `adminWriteController.js`: `POST /tenants`, `PATCH /tenants/:id/plano`, `PATCH /tenants/:id/status`.
- Audit **bloqueante** em cada escrita.
- Frontend: formulários criar/editar + confirmações.
- **Toca:** `src/modules/admin/`, `src/modules/auth/authController.js` (refactor para chamar o service), frontend, `tests/` (isolamento + autorização + transacção).

### Fase 4 — Integrações por tenant
- `PUT /tenants/:id/whatsapp` — configurar instância Evolution (ADR-021), validar `instanceName` (regex slug já no schema), provisionar via `evolutionClient`.
- **Toca:** `src/modules/admin/`, `src/utils/evolutionClient.js` (reutilizar), frontend.

### Fase 5 — Hardening
- `adminLimiter` dedicado; login separado `/admin/login` + 2FA (TOTP).
- Revisão de segurança completa (`security-agent` + `security-review`).
- **Toca:** `src/middlewares/`, `src/modules/admin/`, frontend, infra.

---

## 10. Riscos / Notas / Decisões a validar

**Riscos:**
- **Superfície de altíssimo risco** — uma falha de autorização expõe **todos** os tenants. Mitigação: `requireSuperadmin` dedicado + testes de autorização por rota + revisão `security-agent` + `multi-tenant-guard` confirma que `getTenantDB(targetTenantId)` só ocorre em `src/modules/admin/`.
- **Quebra deliberada de isolamento contida** — só este módulo viola a regra do `tenantId`. Se o padrão "abrir DB de outro tenant" aparecer fora daqui, é vulnerabilidade.
- **GDPR (dados pessoais UE)** — o superadmin pode aceder a métricas (e, no detalhe, a contagens) de dados de clientes. Por isso a auditoria de leitura **é requisito legal**, não só técnico. Aceder a *conteúdo* pessoal (não só contagens) está fora de âmbito (§8); se for preciso no futuro, abrir ADR com base legal.
- **Sem urgência de infra** (ADR-024) — poucos clientes; agregação cross-tenant é trivial hoje. Os limites de concorrência e cache são preparação, não otimização prematura crítica.

**Decisões de desenho a validar contigo antes de implementar:**
1. **Caminho das rotas:** `/api/admin/*` montado **fora** do dual-mount `apiResources` (separação de superfície). Confirmas?
2. **Política de falha do audit log:** bloqueante na escrita, best-effort na leitura. Aceitas este trade-off?
3. **Criação de tenant pelo painel:** o admin do novo tenant recebe email de definição de password (fluxo reset/convite existente) em vez de password definida pelo superadmin. Confirmas?
4. **Métricas pesadas:** detalhe usa contagem exacta; listagem só DB partilhada; endpoint `/metrics` agregado com cache curto (TTL ~5 min, via Redis já existente do BullMQ). Validar se o cache entra já na Fase 2 ou só quando houver muitos tenants.
5. **`estimatedDocumentCount` vs `countDocuments`** nas métricas de lista — aceitas contagem aproximada (mais barata) para o overview?
6. **Suspensão = só muda `plano.status`** (não toca dados). Confirmas que é o comportamento desejado (reactivação restaura acesso integral)?
7. **2FA na Fase 5** pode exigir lib nova (TOTP) → ADR própria. Concordas em adiar a decisão de 2FA?
8. **Refactor de `register`** para chamar `tenantProvisioningService` — mexer em código de produção em produção. Validar apetite (a alternativa é duplicar a lógica, que viola DRY e diverge com o tempo).

---

## 11. Mapa de agentes (quem implementa o quê)

Coordenação pelo **`orchestrator`**. Cada parte vai para o agente especializado:

| Parte | Agente |
|---|---|
| `requireSuperadmin` (rever), `adminLimiter`, política de audit, login separado + 2FA, revisão de segurança final | `security-agent` |
| Módulo `src/modules/admin/` (rotas, controllers, `tenantProvisioningService`, `crossTenantMetrics`, `auditHelper`), refactor de `register`, montagem em `app.js` | `backend-agent` |
| Confirmar que o acesso cross-tenant (`getTenantDB(targetTenantId)`) ocorre **SÓ** em `src/modules/admin/` e está devidamente contido | `multi-tenant-guard` |
| Superfície `/admin/*` (AdminLayout, páginas, hooks, guarda de rota UX) | `frontend-agent` |
| Testes de autorização por rota (403/401/404), isolamento, transacção de provisioning, mocks de Evolution | `quality-agent` |
| Migração/script (se for preciso semear o primeiro `superadmin`) | `backend-agent` (com referência a ADR-024 no commit) |

---

## 12. Referências

- **Decisão:** [ADR-024](./adrs/generated/ADR-024-painel-super-admin-multi-tenant.md)
- **Código real citado:** `src/middlewares/auth.js` (authenticate/authorize/requirePlan), `src/modules/auth/authController.js` (register), `src/config/tenantDB.js` (getTenantDB), `src/models/registry.js` (getModels), `src/models/Tenant.js`, `src/models/User.js` (role enum), `src/modules/admin/requireSuperadmin.js`, `src/models/AuditLog.js`, `src/app.js` (apiResources + dual-mount), `src/middlewares/rateLimiter.js`, `src/modules/users/usersController.js` (criação protegida de superadmin).
- **ADRs:** ADR-001, ADR-002, ADR-005, ADR-021, ADR-013.
- **Regras:** `.claude/rules/{multi-tenant,express-routes,express-controllers,express-middlewares,mongoose-models,mongoose-queries,react-components,react-hooks,express-common-conventions,testing}.md`.
- **Formato:** segue o tom de `docs/fdd-conversas-inbox.md`.
```
