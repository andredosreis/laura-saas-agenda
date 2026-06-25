# Re-skin da Consola Admin (Fase 1) — Design

**Data:** 2026-06-22
**Branch sugerida:** `F12-admin-console-reskin` (a partir de `main`/branch actual)
**Estado:** Aprovado para planeamento

## Contexto e motivação

A consola super-admin (F10/F11) foi construída com uma paleta própria cream/rust/mono
("Consola de Operador"), deliberadamente distinta do design system da app. O André
reavaliou essa decisão: **as cores fogem ao padrão** da app e ele prefere alinhamento.
Além disso, gostou da **organização/layout** do mockup em `docs/produto/exemplo-dashboard/`
(strip de KPIs, distribuição por plano, cards) — quer essa riqueza de informação, mas
nas cores certas.

Esta fase faz **re-skin visual + um strip de KPIs derivados client-side**. Não toca em
lógica de negócio, rotas, mutações ou isolamento multi-tenant.

## Decisões (tomadas com o utilizador)

1. **Direcção visual:** alinhar ao design system da app — indigo/purple/slate dark + glass.
2. **Âmbito:** re-skin das páginas actuais + KPIs que se derivam já da lista de tenants.
   Financeiro (MRR, valor a receber, "quem não pagou", "trials a expirar em N dias")
   fica **deferido** — precisa de endpoint de agregados que não existe.
3. **Superfícies:** painel e tabela em slate **sólido** (legibilidade); efeito **glass**
   (backdrop-blur) apenas nos cards de KPI e de distribuição.

## Confirmação técnica (4 pontos verificados contra o código)

1. **Tokens já na config** — `src/index.css @theme` tem `--color-primary-500` (#6366f1),
   `--color-dark-50/400/500/800/900`, `--color-success/warning/error`, `--font-sans`,
   `--font-console-mono`. Re-skin = trocar hex por tokens; **zero tokens novos**.
2. **Sem fetch duplicado** — um **único** GET ao endpoint de tenants alimenta KPIs,
   distribuição e tabela (ver "Dados" abaixo). Não há um segundo hook a repetir o fetch.
3. **Cap coerente total-vs-página** — KPIs, distribuição e tabela operam sobre o **mesmo**
   conjunto carregado (≤100); `total` vem de `countDocuments()` no backend (exacto sempre).
   Um único aviso quando `total > 100`. Não há divergência entre o que a tabela pagina e
   o que os KPIs contam.
4. **Zero toque em backend** — o endpoint `GET /admin/tenants` já aceita `limit` até 100
   (`Math.min(100, …)` em `adminController.js`). Usa-se `limit=100`; nenhum ficheiro de
   `src/` é alterado.

## Tokens disponíveis (já em `src/index.css @theme`)

Não é preciso criar paleta nova — os tokens do design system já existem:

- `primary-*` — indigo (500 = `#6366f1`)
- `dark-*` — slate (900 = `#0f172a`, 800 = `#1e293b`, 700 = `#334155`, 400 = `#94a3b8`, 50 = `#f8fafc`)
- `accent-*` — amber (500 = `#f59e0b`)
- `success` `#10b981`, `warning` `#f97316`, `error` `#ef4444`
- `--font-sans` (Inter), `--font-console-mono` (IBM Plex Mono)
- gradientes: `from-primary-500 to-purple-600` (purple built-in do Tailwind)

## Superfície afectada (8 ficheiros, frontend apenas)

| Ficheiro | Mudança |
|---|---|
| `components/admin/ConsoleChrome.tsx` | shell escuro (header + painel) |
| `components/admin/ConsoleUI.tsx` | helpers + `STATUS_STYLES`/`PLAN_STYLES`/`Avatar`/`StatBlock`/`ConsoleCard` remapeados; **+ novos** `KpiCard`, `PlanDistributionBar` |
| `pages/admin/TenantsListPage.tsx` | re-skin + strip de overview; passa a derivar KPIs e a paginar a tabela **client-side** sobre o conjunto único carregado |
| `pages/admin/TenantDetailPage.tsx` | re-skin |
| `pages/admin/AuditLogPage.tsx` | re-skin |
| `components/admin/CreateTenantForm.tsx` | re-skin (modal/inputs/botões) |
| `components/admin/EditPlanLimitsForm.tsx` | re-skin |
| `components/admin/SuspendReactivateControls.tsx` | re-skin (incl. `ConfirmDialog`) |
| `hooks/useAdminTenants.ts` | ajustar: 1 fetch `limit=100`, expõe `tenants[]` + `total` (sem segundo hook) |

## Mapa de cores (cream/rust → tokens app)

| Actual (hex) | Novo (token/classe) |
|---|---|
| fundo `#211f1c` | `bg-dark-900` |
| painel `#f4f1ec` (claro) | `bg-dark-800` |
| header painel `#fbf9f6` | `bg-dark-800` / `bg-white/5` |
| bordas `#e8e2da` / `#34302b` | `border-white/10` (ou `border-dark-700`) |
| texto `#221f1d` / `#f4f1ec` | `text-dark-50` |
| subtexto `#9a938c` / `#8f877d` | `text-dark-400` |
| accent `#bd5d33` / `#a14d27` | `text-primary-400` / `bg-primary-500`, gradiente `to-purple-600` |
| input `bg-white border #ddd5ca` | `bg-dark-900 border-white/10`, focus `ring-primary-500/40` |
| botão `bg-#221f1d` | `bg-gradient-to-r from-primary-500 to-purple-600` |

**Pills de estado** (`STATUS_STYLES`) no tema escuro (fundo translúcido + texto claro):

| status | fundo | texto | dot |
|---|---|---|---|
| `trial` | `amber-500/15` | `amber-300` | `amber-400` |
| `ativo` / `ok` | `emerald-500/15` | `emerald-300` | `emerald-400` |
| `suspenso`/`expirado`/`error` | `red-500/15` | `red-300` | `red-400` |
| `cancelado` | `dark-600/40` | `dark-300` | `dark-400` |
| `denied` | `amber-500/15` | `amber-300` | `amber-400` |

**Badges de plano** (`PLAN_STYLES`): `basico`→slate (`dark-700`/`dark-300`),
`pro`→indigo (`primary-500/20`/`primary-300`), `elite`→purple (`purple-500/20`/`purple-300`),
`custom`→slate. **Avatar:** gradiente `from-primary-500 to-purple-600`, texto branco.

**Tipografia:** corpo passa a `font-sans` (Inter). `font-console-mono` (IBM Plex Mono)
mantém-se **apenas** em valores numéricos / IDs / slugs / datas (KPIs, célula slug,
paginação) — toque de back-office sem fugir ao design system.

## Strip de overview (novo) — topo da `TenantsListPage`

Layout (acima da tabela existente):

```
┌ Total ──────┐ ┌ Em Trial ──┐ ┌ Activos ───┐ ┌ Suspensos ─┐   ← KpiCard (glass)
│  16         │ │  3         │ │  11        │ │  2         │
└─────────────┘ └────────────┘ └────────────┘ └────────────┘
┌ Distribuição por plano ─────────────────────────────────┐   ← PlanDistributionBar
│ ▓▓▓▓░░░░████   Básico 5 · Pro 7 · Elite 4 · Custom 0     │      (glass)
└──────────────────────────────────────────────────────────┘
[ tabela de tenants existente, re-skinada ]
```

- **`KpiCard`** — card glass (`bg-white/5 backdrop-blur border-white/10 rounded-2xl`),
  label mono uppercase `text-dark-400`, valor grande `text-dark-50` (accent indigo
  opcional em "Suspensos" quando > 0).
- **`PlanDistributionBar`** — barra horizontal empilhada (segmentos por plano nas cores
  dos badges) + legenda com contagens. Sem segmentos quando total = 0 (mostra estado vazio).

**SEM** nesta fase: MRR, valor a receber, cards "Ver quem não pagou" / "Trials a
expirar". São financeiros e ficam para uma fase futura com endpoint dedicado.

## Dados dos KPIs e tabela — fonte única (sem fetch duplicado)

`useAdminTenants` passa a fazer **um único** GET `/admin/tenants?limit=100` (o máximo
permitido pelo backend) e expõe `{ tenants, total, loading, error, refetch }`.
A `TenantsListPage` deriva tudo desse mesmo array:

- `total` ← `pagination.total` (exacto sempre — backend faz `countDocuments()`)
- `trial` / `ativos` / `suspensos` ← contagem por `plano.status` em `tenants`
- distribuição ← contagem por `plano.tipo` em `tenants`
- **tabela** ← filtro de pesquisa + paginação (20/página) **client-side** sobre `tenants`

Assim KPIs, distribuição e tabela partilham um só fetch e um só conjunto de dados —
nenhum segundo pedido ao endpoint. (Bónus: a pesquisa passa a filtrar todos os tenants
carregados, não só a página actual — o comportamento actual filtra só a página, um
defeito latente que isto corrige.)

- Estados: `loading` (skeleton nos KPIs + spinner na tabela), `error` (inline, não rebenta).

### Cap honesto e coerente (sem truncagem silenciosa)

Tudo opera sobre o **mesmo** conjunto de ≤100 tenants, logo o cap é uniforme: KPIs,
distribuição e tabela mostram exactamente o que está carregado. Se `total > 100`, o strip
mostra **um** aviso visível — ex.: `"A mostrar 100 de N tenants — adicionar endpoint de
stats"` — em vez de números enganadores ou de uma tabela que pagina mais do que os KPIs
contam. Marca explícita para, no futuro, criar `GET /admin/overview` (agregação no
backend) quando a escala passar de 100.

## Fora de âmbito (explícito)

- Qualquer endpoint backend novo (incl. agregados financeiros / `/admin/overview`).
- MRR, valor a receber, atrasos, "quem não pagou", "trials a expirar em N dias".
- Mudanças de lógica, rotas, mutações, schemas ou isolamento multi-tenant.
- Refactors não relacionados.

## Testes / verificação

- `npm run build` (TypeScript + Vite) e `npm run lint` passam.
- Sem hex cream/rust remanescente nos 8 ficheiros (grep de `#bd5d33`, `#221f1d`,
  `#f4f1ec`, `#211f1c`, `#a14d27` → 0 resultados).
- Verificação visual das 3 páginas + 3 modais no browser (lista, detalhe, auditoria,
  criar, editar, suspender/reactivar) — legibilidade e contraste no tema escuro.
- KPIs batem certo com a lista (com ≤100 tenants); aviso de cap aparece se forçado >100.
- Os componentes continuam a cumprir `react-components.md`/`react-hooks.md`
  (api.js, useAuth, sem alert, erros inline, loading) — já cumpriam; não regredir.

## Critérios de sucesso

1. As 3 páginas e 3 modais usam os tokens do design system (indigo/purple/slate dark);
   nada de cream/rust.
2. A lista de tenants tem o strip de overview (4 KPIs + distribuição por plano) glass.
3. Zero alterações de comportamento; build + lint verdes.
4. Cap de 100 tenants sinalizado, não escondido.
