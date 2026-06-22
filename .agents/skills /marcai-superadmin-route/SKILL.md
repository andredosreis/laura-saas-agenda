---
name: marcai-superadmin-route
description: >-
  Playbook de segurança para o painel super-admin do Marcai (ADR-024). Use ao
  criar ou alterar QUALQUER rota, handler, model ou middleware em
  `src/modules/admin/` — a única superfície do sistema que atravessa
  deliberadamente o isolamento multi-tenant (o superadmin lê/gere todos os
  tenants via `getTenantDBAdmin`). Carrega os 4 gates que têm de nascer com cada
  rota: requireSuperadmin (404), AuditLog append-only, sweep test parametrizado
  e confinamento cross-tenant read-only. NÃO use para recursos tenant-scoped
  (clientes, agendamentos, financeiro, leads…) — esses seguem o isolamento
  normal `{ tenantId }` do CLAUDE.md; aqui a rede de segurança normal está
  deliberadamente DESLIGADA.
---

# Playbook — Rota do painel super-admin (`src/modules/admin/`)

> **Regra cardinal:** `src/modules/admin/` é o **único** lugar do Marcai onde o
> cross-tenant é *sancionado*. O filtro `{ tenantId }` e o 404-automático que
> protegem o resto do sistema estão **desligados** aqui — por isso este módulo
> tem gates próprios, que têm de **nascer com cada rota**, não ser auditados
> depois. Blindar à nascença é mais barato que auditar 15 rotas em produção.

Refs: ADR-024 (painel super-admin), ADR-001 (DB-per-tenant num cluster +
control-plane partilhado `laura-saas`).

---

## Quando usar / quando NÃO usar

**USE** ao tocar em rota / handler / model / middleware de `src/modules/admin/`.

**NÃO use** para recursos tenant-scoped (Cliente, Agendamento, Pacote, Lead,
Financeiro…). Esses seguem o isolamento normal: `{ tenantId: req.user.tenantId }`
em toda query, cross-tenant → 404. Ver `.claude/rules/multi-tenant.md`.

### Fora deste playbook (fronteira negativa — **abre ADR / vê outro doc**)

| Fora de escopo | Onde vive |
|---|---|
| Hardening do **token** superadmin (2FA, TTL curto, IP allowlist, **rate limiting** das rotas admin) | ADR-024 Fase 5 (guarda obrigatória). Os gates abaixo **assumem token superadmin confiável** — não defendem contra um JWT roubado nem contra brute-force/sondagem. |
| Mutações **cross-DB** / onboarding de tenant (Fase 4) | Padrão outbox/saga, **adiado**. Este playbook só permite mutação no control-plane. |
| Idempotência / reconciliação de **side-effects externos** (Evolution API) | A chamada externa fica **fora** da transação e é idempotente; a reconciliação está fora de escopo. |

---

## Os 4 gates (referência rápida)

Cada gate é **🤖 automático** (impossível de esquecer) ou **👤 humano** (revisão).
Um playbook que mistura os dois sem os marcar mente sobre a sua própria solidez.

| # | Gate | Mecanismo | Corre em | Tipo |
|---|------|-----------|----------|------|
| 1 | **requireSuperadmin** — `role === 'superadmin'`, **404** p/ os restantes | `router.use(authenticate, requireSuperadmin)` no topo do `adminRouter` (fail-closed, router-level) | runtime | 🤖 |
| 2 | **AuditLog** — toda ação (read, write **e** negação) | 3 escritores compõem a cobertura: **negações** → `requireSuperadmin` (best-effort); **reads** → middleware `res.on('finish')` (best-effort); **mutações** → factory `adminMutation()` na **mesma transação/conexão** (fail-closed) | runtime | 🤖 |
| 3 | **Teste 404** — não-superadmin não vê nada | sweep parametrizado sobre `adminRouter.stack` → 404 em **todas** as rotas | CI | 🤖 |
| 4 | **Confinamento cross-tenant** — `getTenantDBAdmin` só em `admin/`, **read-only** | 2 accessors + `no-restricted-imports` (estático) **+** credencial Mongo read-only na conexão do painel (infra) | pre-commit + runtime | 🤖 |
| — | Qualidade do diff `before/after` no audit | revisão de PR | PR | 👤 |

> **Único gate humano:** a qualidade do `before/after` gravado no AuditLog. Tudo
> o resto é estrutural — o agente não precisa de "lembrar-se".

---

## Pré-flight (une o Bloco A e o Bloco B)

```
Os primitivos (requireSuperadmin 404, model AuditLog, factory adminMutation,
os 2 accessors, credenciais restritas, sweep test) já existem e estão provados?
        │
        ├── NÃO  → faz o BLOCO A (setup run-once) primeiro
        └── SIM  → vai direto ao BLOCO B (por cada rota nova)
```

---

## Estado de implementação (reconciliação com o código real)

A Fase 1 das fundações está **implementada e testada** (ADR-024). Este doc foi
escrito antes de ler o código committado — onde divergir nos **nomes**, vale o
código:

| Este doc diz | Lê no código |
|---|---|
| `admin/auditLog.model.js` | **`src/models/AuditLog.js`** (control-plane, junto de Tenant/User) |
| `AuditLog.create([...],{session})` | leitura/negação via **`AuditLog.record({...})`**; só a Fase 3 transacional usa `create([...],{session})` |
| `actorId` | **`actorUserId`** |
| `sharedConnection` | **`mongoose.connection`** (default = `laura-saas`); transação via `mongoose.startSession()` |
| `userAgent` / `requestId` / `before`/`after` (campos) | não existem no model; `before/after` vão em **`metadata`** (Mixed). A Fase 3 decide se promove a campos |

**Construído e verde (Fase 1):** `src/models/AuditLog.js` (+ campo `status`),
`requireSuperadmin` (404 + audita negação), `auditMiddleware`, `adminRouter`
montado no `apiResources`, sweep test. **Fase 2 (em curso):** `GET /admin/tenants`.

**Realidade de conexão:** `getTenantDB` usa `mongoose.connection.useDb()` — mesma
conexão/pool RW. Logo a justificação "tenant é outra conexão → sem atomicidade" é
imprecisa para o `getTenantDB` de produto; a *decisão* (mutações só control-plane)
mantém-se. O `getTenantDBAdmin` read-only (A5) precisa de uma **conexão separada**
(`createConnection(MONGO_TENANT_RO_URI)`), não de `useDb`.

---

## BLOCO A — Setup (run-once) · mapeia ADR-024 Fase 1

Cria os primitivos **uma vez**. Idempotente: se já existir e estiver provado,
salta. Cada primitivo tem o seu próprio gate de aceitação.

### A1 — `requireSuperadmin` (já existe — **corrigir + auditar a negação**)

- **⚠ AÇÃO 1:** `src/modules/admin/requireSuperadmin.js` devolve hoje **403** →
  mudar para **404** com mensagem genérica (`Recurso não encontrado`).
  *Porquê 404 e não 403:* **"403 entregaria um mapa ao atacante"** — não revelar
  a existência da superfície mais perigosa do sistema a um não-superadmin.
- **⚠ AÇÃO 2 (dono da "negação auditada"):** ao rejeitar, o `requireSuperadmin`
  **escreve ele próprio** uma entrada `status: 'denied'` (actor, path, ip)
  **antes** de devolver 404 — best-effort (`.catch(() => {})`, sem transação; não
  há nada a proteger). É o **único** componente que vê a negação: o
  `auditMiddleware` (A7) corre **depois** e nunca chega a executar para um
  não-superadmin (short-circuit do 404). Sem isto, *"negações são auditadas"* é
  uma promessa órfã — perdes exatamente o sinal de ataque (um `recepcionista` a
  sondar `/api/admin/*`) que justificou todo o desenho.
- Verifica **apenas** `req.user.role === 'superadmin'`. É um middleware
  **dedicado**, distinto de `authorize()` — que o superadmin *contorna*, pelo que
  `authorize('superadmin')` é semanticamente errado. Nunca usar `authorize` aqui.
- Mantém os dois casos separados:
  - sem `req.user` (token ausente/inválido) → **401**. **Não "corrigir" para
    404:** o 401 vem do `authenticate` global (toda rota protegida da API dá 401
    sem token), logo não revela nada *específico* do admin. Trocá-lo por 404 aqui
    cria uma inconsistência com o resto da API — que é, ela própria, um sinal.
  - autenticado mas `role !== 'superadmin'` → **404** (+ audit `denied`).

### A2 — Model `AuditLog` (append-only **na mesma conexão da mutação**)

- Registado na **`sharedConnection`** (`laura-saas`) — **não** numa conexão
  separada. Isto é crítico: uma `session` vive numa conexão (a regra do Q5), por
  isso o audit transacional do A3 **só é atómico se o `AuditLog` estiver na mesma
  conexão da mutação**. Registá-lo via uma `MONGO_AUDIT_URI` separada quebraria a
  atomicidade do Gate 2 **silenciosamente** (a `session` da `sharedConnection`
  não é válida noutra conexão → erro `transaction number does not match`, ou
  `session` ignorada e audit fora da transação).
- Campos: `actorId`, `actorEmail`, `action` (enum), `targetTenantId`,
  `targetResourceId?`, `before?` / `after?` (diff **mínimo** — GDPR),
  `status` (**enum** `'ok' | 'denied' | 'error'`), `metadata?` (objeto livre —
  ex.: IDs de uma listagem, mensagem de erro), `ip`, `userAgent?`, `requestId`,
  `timestamp`.
- **Append-only sem perder atomicidade — via privilégios por-coleção, não por
  conexão separada.** *"Se o superadmin pode apagar o próprio AuditLog, a
  auditoria é teatro."* A credencial da `sharedConnection` usa uma **custom role
  Atlas scoped por coleção**:
  - `readWrite` nos models de control-plane (`Tenant`, `User`, `UserSubscription`);
  - **`insert` + `find`, sem `update`/`remove`,** na coleção `auditlogs`.
  Assim a `sharedConnection` faz o **insert atómico** do audit (mesma `session` da
  mutação) **e continua incapaz de o apagar**. Nenhuma rota de mutação sobre o log.
  *(Hash-chain de tamper-evidence = passo futuro.)*
- `process.env.MONGO_AUDIT_URI` **não desaparece** — passa a ser o **caminho de
  leitura** do painel sobre o log (conexão read-only, find), nunca de escrita. A
  escrita do audit é **sempre** na `sharedConnection`, na `session` da mutação.
- **Gate de aceitação A2:** dois testes — (i) `update`/`remove` sobre `auditlogs`
  com a credencial da `sharedConnection` **é rejeitado pelo Mongo**; (ii) o
  `insert` do audit **dentro da transação** da mutação **commita atomicamente**.

### A3 — Factory `adminMutation()` (escrita transacional auditada)

O coração do Gate 2 para mutações. Garante que **a escrita do model e o
AuditLog correm na mesma `session`/transação, antes do commit** — e marca
`req.audit.committed` para o middleware `finish` **não duplicar**. Mutação que
**falha deixa rasto** `status: 'error'` (best-effort, fora da transação — não há
nada commitado a proteger).

```js
// src/modules/admin/adminMutation.js  (ESM — extensão .js obrigatória)
import mongoose from 'mongoose';
import AuditLog from '../../models/AuditLog.js';         // default connection = laura-saas (control-plane)

// Envolve um handler de mutação: transação na sharedConnection, trabalho + audit
// na MESMA session, commit atómico. work() devolve
// { data, targetTenantId, targetResourceId?, before?, after? } e contém SÓ ops de DB.
export const adminMutation = (action, work) => async (req, res, next) => {
  const session = await mongoose.startSession();
  const base = {
    actorId: req.user.userId, actorEmail: req.user.email, action,
    ip: req.ip, userAgent: req.get('user-agent'), requestId: req.id,
  };
  try {
    let payload, target = {};
    await session.withTransaction(async () => {
      const ctx = await work(req, { session }); // withTransaction re-executa em erro transiente
      payload = ctx.data; target = ctx;
      await AuditLog.create([{
        ...base, status: 'ok', targetTenantId: ctx.targetTenantId,
        targetResourceId: ctx.targetResourceId, before: ctx.before, after: ctx.after,
      }], { session });
    });
    req.audit.committed = true;                 // o finish-middleware salta
    res.json({ success: true, data: payload });
  } catch (err) {
    await AuditLog.create({                      // best-effort, FORA da txn
      ...base, status: 'error', targetTenantId: target.targetTenantId,
      metadata: { message: err.message },
    }).catch(() => {});
    req.audit.committed = true;
    next(err);
  } finally { session.endSession(); }
};
```

- **`work()` contém SÓ operações de DB.** O `withTransaction` re-executa o
  callback em erros transientes — um side-effect lá dentro correria **duas vezes**.
  O efeito externo (Evolution) fica **fora** da transação e idempotente.
- **Mutação só no control-plane `laura-saas`.** A transação só é atómica numa
  conexão; o audit está em `laura-saas`, logo a mutação também tem de estar.
  Mutar dentro de um `tenant_<id>` é **outra conexão** → sem atomicidade →
  **fora de escopo** (Fase 4 / saga).

### A3b — `auditMiddleware` + `req.audit` (read-path do Gate 2 · **a cola entre os gates**)

O outro escritor do Gate 2 — e a **cola** que impede escrita dupla. Inicializa
`req.audit` (a superfície de enriquecimento que A3 e os handlers usam) e, no fim
do request, grava **uma** entrada best-effort para **leituras**. Sem isto
definido, A7 monta um middleware fantasma e o read-path do Gate 2 não existe.

```js
// src/modules/admin/auditMiddleware.js  (ESM — extensão .js obrigatória)
import { AuditLog } from './auditLog.model.js'; // sharedConnection (A2)

export const auditMiddleware = (req, res, next) => {
  req.audit = {
    committed: false,                 // A3 põe a true (mutação já gravou na transação)
    data: {},
    set(fields) { Object.assign(this.data, fields); }, // handler: req.audit.set({ action, targetTenantId, metadata })
  };

  res.on('finish', () => {
    if (req.audit.committed) return;  // ⬅ a cola: mutação já auditou (A3) → não duplicar
    AuditLog.create({                 // best-effort: leitura NÃO bloqueia por falha de audit
      actorId: req.user.userId, actorEmail: req.user.email,
      // 1 entrada por request: semântica se o handler a declarou, senão derivada
      action: req.audit.data.action ?? `${req.method} ${req.baseUrl}${req.path}`,
      targetTenantId: req.audit.data.targetTenantId,
      metadata: req.audit.data.metadata,
      status: res.statusCode < 400 ? 'ok' : 'error',
      ip: req.ip, userAgent: req.get('user-agent'), requestId: req.id,
    }).catch(() => {});
  });

  next();
};
```

- **A cola, explícita:** `req.audit.committed` é a *única* coordenação entre os
  dois escritores. `adminMutation` (A3) põe-no a `true` em **sucesso e erro** →
  o `finish` salta → sem escrita dupla. As **negações nunca chegam aqui**
  (short-circuit do `requireSuperadmin`, A1, que audita ele próprio).
- **Toda leitura fica auditada:** se o handler de leitura não chamar
  `req.audit.set(...)`, grava-se uma `action` derivada de `METHOD path` — "1
  entrada por request", nunca zero.
- **Best-effort** (`.catch(() => {})`): a leitura não falha por causa do audit.
  Contraste deliberado com mutações, que são **fail-closed** (A3).
- Montado **depois** do `requireSuperadmin` no `adminRouter` (A7).

### A4 — Dois accessors de DB (confinamento estático — Gate 4)

```js
getCurrentTenantDB(req)        // produto: resolve do JWT (req.user.tenantId)
getTenantDBAdmin(tenantId)     // só admin/: tenantId EXPLÍCITO, conexão read-only
```

- `getTenantDBAdmin` é importável **só** em `src/modules/admin/`
  (`eslint no-restricted-imports`). Fora de `admin/`, importá-lo é erro de lint.
- Isto resolve a metade "fora de admin/". A outra metade ("read-only dentro de
  admin/") é A5.
- **⚠ Isto é uma migração, não "criar um ficheiro".** Substituir o atual
  `getTenantDB` por `getCurrentTenantDB(req)` obriga a **renomear todos os
  call-sites de produto** existentes. Faz o sweep antes (`grep -rn getTenantDB
  src/`), num commit só, com testes a passar. Run-once, mas não trivial.

### A5 — Credencial Mongo read-only para o painel→`tenant_<id>` (Gate 4b · infra)

- A conexão de `getTenantDBAdmin` usa `process.env.MONGO_TENANT_RO_URI`
  (find, **sem** write). Qualquer `.save()`/`.create()`/update/delete é
  **rejeitado pelo próprio Mongo** — não por disciplina.
- *Porquê infra e não linter:* o import é permitido em `admin/`; é a *escrita*
  no objeto devolvido que é proibida, e isso é indetetável estaticamente. Logo,
  `getTenantDBAdmin` no painel é **read-only por construção** (métricas).
- **Gate de aceitação A5:** teste que prova que um write via `getTenantDBAdmin`
  é rejeitado.

### A6 — Sweep test parametrizado (Gate 3)

```js
// tests/admin-superadmin-sweep.test.js
// Introspeciona adminRouter.stack e afirma 404 para TODA rota sem superadmin.
for (const route of listRoutes(adminRouter)) {
  // params (:id) recebem um valor concreto — ex. /tenants/:id → /tenants/x.
  // O requireSuperadmin rejeita ANTES de resolver o param, logo "x" basta.
  const path = route.path.replace(/:[^/]+/g, 'x');
  it(`${route.method} ${path} → 404 sem superadmin`, async () => {
    const res = await request(app)[route.method](`/api/v1/admin${path}`)
      .set('Authorization', `Bearer ${tokenRecepcionista}`); // autenticado, não-superadmin
    expect(res.status).toBe(404);
  });
}
```

- A rota nova fica coberta **de graça**, no minuto em que é montada.
- **Cobertura de audit NÃO vem do sweep** (não há como sintetizar bodies
  válidos). Vem da **composição** (ver A7 + Gate 2): *"composição prova
  cobertura."*

### A7 — Montar o `adminRouter` + checks estáticos

```js
// src/modules/admin/adminRoutes.js
const router = Router();
router.use(authenticate, requireSuperadmin); // Gate 1 (+ audita negações, A1) — fail-closed
router.use(auditMiddleware);                  // Gate 2 read-path (A3b) — req.audit + finish best-effort
// ... rotas (ver Bloco B)
```

- **Check estático (pre-commit):** **proibido `router.post/put/delete/patch`
  cru** em `src/modules/admin/` — toda mutação passa por `adminMutation()`. É
  isto que torna a cobertura de audit *estrutural* (não esquecível).
- Montagem no `apiResources` de `app.js` (dual-mount `/api/admin` + `/api/v1/admin`).

---

## BLOCO B — Por cada rota nova (o loop · o coração)

Os gates já estão montados no `adminRouter` (A7). Não os repitas por-rota.
Identifica primeiro: **é leitura ou mutação?** Os caminhos divergem.

### Rota de LEITURA

1. **Fonte:** control-plane (`Tenant`/`User`/`UserSubscription` em `laura-saas`)
   **ou** métricas cross-tenant via `getTenantDBAdmin(tenantId)` (read-only).
   Agregar sobre N tenants → `Promise.all` (nunca `await` em loop), **com bound**.
2. Adiciona a rota ao `adminRouter`. Paginação ≤100 se for listagem; ordena
   sempre. Resposta `{ success: true, data }`.
3. **Audit:** automático via middleware `finish` (best-effort). Enriquece a
   semântica: `req.audit.set({ action: 'tenant.read', targetTenantId, metadata })`.
   *(Lista = 1 entrada por request; IDs no metadata. "Audit rastreia ações, não
   registos.")*
4. **Nada de teste a escrever** — o sweep (A6) cobre o 404 automaticamente.

### Rota de MUTAÇÃO

1. **Fonte TEM de ser control-plane (`laura-saas`).** Mutação dentro de um
   `tenant_<id>`? → **PARA**: fora de escopo (Fase 4 / saga).
2. **NÃO uses `router.post/put/delete` direto** (o check estático rejeita-o).
   Usa a factory: `router.post('/tenants/:id/suspend', adminMutation('tenant.suspend', work))`.
3. O `work` corre na `session` da transação e devolve
   `{ data, targetTenantId, before, after }`. O AuditLog grava na **mesma
   transação** — atómico. `before/after` = **diff mínimo** (GDPR).
4. **Tenant inexistente → 404** para todos (o superadmin não inventa realidade);
   tenant **suspenso** → superadmin acede e gere (necessário para reactivar). Um
   404 destes é resultado de **negócio** dentro do handler — distinto da
   **negação de acesso** (não-superadmin), que é auditada `status: 'denied'` pelo
   `requireSuperadmin` (A1), não aqui.
5. **Side-effect externo** (Evolution) → **fora** da transação, idempotente.

---

## Anti-patterns (erros específicos deste módulo — recusa-os)

| ❌ Errado | ✅ Certo | Porquê |
|---|---|---|
| `requireSuperadmin` colado por-rota | `router.use(...)` no topo | Por-rota é esquecível — e o esquecimento é o failure mode (expõe todos os tenants) |
| `authorize('superadmin')` | `requireSuperadmin` dedicado | O superadmin *contorna* `authorize()` — usá-lo é semanticamente furado |
| `403` para não-superadmin | `404` | "403 entregaria um mapa ao atacante" |
| `await AuditLog.create()` à mão num handler de mutação | factory `adminMutation()` | Escrita à mão é esquecível **e** não-atómica |
| `res.on('finish')` a auditar mutação | audit dentro da transação | `finish` corre **pós-commit** — perde atomicidade; mutação fica sem rasto |
| `getTenantDB` cru em `admin/` | `getTenantDBAdmin` (read-only) | Conexão de produto permite escrita; a do painel não |
| **escrita** via `getTenantDBAdmin` | mutação só no control-plane | Cross-DB não é atómico com o audit → fora de escopo |
| `router.post/put/delete` cru em `admin/` | `adminMutation()` | É o que torna a cobertura de audit *estrutural* |

---

## Definition of Done

**Estáticos (pre-commit):**
- [ ] `no-restricted-imports`: `getTenantDBAdmin` só em `src/modules/admin/`.
- [ ] Sem `router.post/put/delete/patch` cru em `src/modules/admin/` (toda
      mutação via `adminMutation`).

**Runtime (CI, com as credenciais restritas):**
- [ ] `npm test` — sweep parametrizado: **todas** as rotas do `adminRouter`
      devolvem **404** sem superadmin.
- [ ] Negação (não-superadmin) → grava entrada `status: 'denied'` (Gate 2 / A1).
- [ ] `update`/`remove` sobre `auditlogs` com a credencial da `sharedConnection`
      → **rejeitado** pelo Mongo (append-only).
- [ ] Write via `getTenantDBAdmin` → **rejeitado** pelo Mongo (read-only).
- [ ] Unit test de `adminMutation`: audit + mutação **commitam atomicamente** na
      mesma `session`; falha da mutação → **rollback** + entrada `status: 'error'`
      best-effort fora da transação.

**Revisão (👤 — o único gate humano):**
- [ ] O `before/after` gravado é um diff **mínimo e GDPR-safe** (sem dados
      pessoais a mais).

---

## Invocação

Auto-load primário (dispara ao tocar em `src/modules/admin/`) + `/marcai-superadmin-route`
manual de backup. O auto-load é a **camada suave** que traz o contexto certo;
os **gates** é que blindam — não dependem da skill estar carregada.
