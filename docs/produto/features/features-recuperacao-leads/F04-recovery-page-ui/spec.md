# F04 — Recovery Page UI — Spec

**PRD:** `docs/produto/PRD-recuperacao-leads.md` (F04)
**Design:** `docs/superpowers/specs/2026-07-22-recuperacao-leads-design.md` (§7.2 page, §7.3 sidebar)
**Complexity:** medium
**Module:** `laura-saas-frontend/src/pages/` (new) + `laura-saas-frontend/src/components/leads/` (new) + `laura-saas-frontend/src/types/` (new) + `laura-saas-frontend/src/services/` (new) — frontend only, read-only page

---

## 1. Scope

**Included:**
- New page `laura-saas-frontend/src/pages/RecuperacaoLeads.tsx`, route `/leads/recuperacao`, registered as a protected route in `App.tsx` (lazy-loaded, same `ProtectedLayout` treatment as the sibling `/leads` and `/leads/kanban` routes — no extra role/plan gate).
- Menu entry added in **`Sidebar.jsx`** (`menuGroupsAll`, `CRM / VENDAS` group — the same group that already holds `/leads` and `/leads/kanban`), gated by `perm: 'verLeads'` via the existing `hasPermissao()` helper. `Navbar.jsx` is dead code (not rendered by `ProtectedLayout`) and is not touched.
- Summary strip: 7 tiles in the fixed order `contactosRecebidos → leadsReais → descartados → convertidos → perdidos → esfriados → taxaConversao`.
- Reason breakdown as plain horizontal bar divs driven by `resumo.porMotivo` — no new chart library.
- Filters: `de`, `ate`, `grupo`, `motivoCodigo`, `origem` — mapped 1:1 to F02's query params. Sort is fixed server-side (days-stalled desc); no user-facing sort control.
- List: name, phone, stalled stage, reason (+ note on expand), days stalled; paginated (prev/next + "Página X de Y", mirroring the pattern in `pages/Atendimentos.jsx`).
- "Exportar CSV" button that builds the F03 request from the currently active filters and triggers a browser download, surfacing the truncation warning when `X-Export-Truncated: true` is present.
- Loading, empty, and error states (including a permission-denied state — see §6).
- Dark/light via `ThemeContext.isDarkMode`; mobile layout at 375px (strip → 2 columns, list rows → cards).

**Consumes (from F02, F03 — both prerequisites, already implemented per the PRD dependency graph):**
- `GET /leads/recuperacao` — summary + paginated recoverable lead rows.
- `GET /leads/recuperacao/export.csv` — same filters, CSV file, no pagination, capped at 5,000 rows.

**Explicitly NOT included (belongs to F05 — Wave 5, builds on this page):**
- The per-row "Chamar no WhatsApp" button and its E.164 normalization/tooltip.
- The "Marcar como contactado" action and the `PATCH /leads/:id/recuperacao` call.
- Any optimistic removal / undo-toast behavior tied to marking a lead contacted.
- The design doc's §7.2/§7.3 describes the page and the WhatsApp action together because it predates the PRD's split into F04/F05; the PRD's own F04 functionalities list (§6, F04) does not mention WhatsApp or contact-tracking, and the dependency table makes F05 depend on F04 — so this spec builds the page's data surface only. Row components leave an empty trailing "actions" slot (see §2) so F05 can attach its buttons without refactoring.

**Deferred (other features):** cold-threshold config UI, per-tenant message template editor, consent/opt-out filtering (arrives with F09 and will filter this list transparently — no F04 change needed then).

---

## 2. Component Overview

| File | Action | Responsibility |
|---|---|---|
| `laura-saas-frontend/src/types/recuperacaoLeads.ts` | new | TS interfaces mirroring F02/F03's response contract: `RecuperacaoResumo`, `RecuperacaoPorMotivo`, `RecuperacaoLeadRow` (discriminated union), `RecuperacaoLeadsResponse`, `RecuperacaoFiltros`, `RECUPERACAO_MOTIVO_LABELS` (local mirror of the 8 PRD §4.1 codes — see Assumption A4) |
| `laura-saas-frontend/src/services/recuperacaoLeadsService.ts` | new | Typed wrapper over `api.js`: `getRecuperacao(filtros)`, `downloadExportCsv(filtros)` (blob download, returns `{ truncated: boolean }`), `buildQueryParams(filtros)` shared by both. Mirrors the style of `leadsService.ts` |
| `laura-saas-frontend/src/pages/RecuperacaoLeads.tsx` | new | Page: owns filter/page state, fetch lifecycle, loading/empty/error/permission-denied states, composes the components below, wires the export button |
| `laura-saas-frontend/src/components/leads/RecuperacaoSummaryStrip.tsx` | new | Presentational — renders the 7 tiles from `RecuperacaoResumo` |
| `laura-saas-frontend/src/components/leads/RecuperacaoMotivoBreakdown.tsx` | new | Presentational — horizontal bars from `resumo.porMotivo`, no library |
| `laura-saas-frontend/src/components/leads/RecuperacaoFiltrosBar.tsx` | new | Controlled filter inputs (`de`/`ate`/`grupo`/`motivoCodigo`/`origem`); emits `onChange(filtros)` to the page, which resets `page` to 1 |
| `laura-saas-frontend/src/components/leads/RecuperacaoLeadRow.tsx` | new | One list row (`<tr>` on desktop / `<div>` card on mobile via CSS, not a duplicated component); renders an expandable note; ends with an empty `actions` slot reserved for F05 |
| `laura-saas-frontend/src/components/Sidebar.jsx` | edit | Add `{ to: "/leads/recuperacao", text: "Recuperação", icon: <TBD, e.g. RotateCcw>, perm: 'verLeads' }` to the `crm` group's `items` array |
| `laura-saas-frontend/src/App.tsx` | edit | Add `const RecuperacaoLeads = lazy(() => import('./pages/RecuperacaoLeads'));` and `<Route path="/leads/recuperacao" element={<ProtectedLayout><RecuperacaoLeads /></ProtectedLayout>} />` next to the existing `/leads/*` routes. **Must be registered as its own literal path** — it does not collide with `/leads/:id` the way the backend route ordering matters (client-side routing is not prefix-ambiguous the way Express is), but placing it near the other `/leads/*` routes keeps the file readable |

No backend files are touched by this feature — F04 is UI-only, consuming endpoints already delivered by F02/F03.

---

## 3. Data Model — no persisted model; client-side TypeScript types

There is no new Mongoose model or backend schema in this feature. What follows is the contract `laura-saas-frontend/src/types/recuperacaoLeads.ts` must encode, mirroring the F02/F03 JSON responses.

```ts
import type { LeadOrigem, LeadStatus } from './lead';

// Mirrors src/modules/leads/pipelineConstants.js LEAD_MOTIVOS_PERDA (PRD §4.1).
// Declared locally rather than assumed from F01's frontend work — see Assumption A4.
export const LEAD_MOTIVO_CODES = [
  'preco', 'horario', 'concorrencia', 'pesquisando',
  'localizacao', 'sem_resposta', 'nao_e_lead', 'outro',
] as const;
export type LeadMotivoCodigo = typeof LEAD_MOTIVO_CODES[number];

export const RECUPERACAO_MOTIVO_LABELS: Record<LeadMotivoCodigo, string> = {
  preco: 'Achou caro',
  horario: 'Horário não serviu',
  concorrencia: 'Foi para outro sítio',
  pesquisando: 'Só estava a pesquisar',
  localizacao: 'Longe / deslocação',
  sem_resposta: 'Parou de responder',
  nao_e_lead: 'Não era cliente potencial',
  outro: 'Outro',
};

export interface RecuperacaoPorMotivo {
  codigo: LeadMotivoCodigo;
  label: string;
  total: number;
}

export interface RecuperacaoResumo {
  contactosRecebidos: number;
  leadsReais: number;
  descartados: number;
  convertidos: number;
  perdidos: number;
  esfriados: number;
  taxaConversao: number; // 0..1 — render as a rounded percentage
  porMotivo: RecuperacaoPorMotivo[];
}

interface RecuperacaoLeadBase {
  _id: string;
  nome: string | null;
  telefone: string;          // digits-only, as stored — F05 normalizes to E.164
  origem: LeadOrigem;
  etapaParada: LeadStatus;    // 'perdido' | 'novo' | 'em_conversa' | 'qualificado'
  nota: string | null;
  primeiroContacto: string;   // ISO date
  ultimoContacto: string;     // ISO date
  diasParado: number;
  interesse: string | null;
  score: number | null;
  jaContactado: boolean;      // has a recuperacao.contactadoEm in the past (informational only in F04)
}

// Discriminated union (CLAUDE.md TS guidance): a 'perdido' row was explicitly
// marked lost with one of the 8 codes; an 'esfriado' row is derived at read
// time and always carries motivoCodigo: 'sem_resposta' (design §5).
export interface RecuperacaoLeadPerdido extends RecuperacaoLeadBase {
  grupo: 'perdido';
  motivoCodigo: LeadMotivoCodigo;
}
export interface RecuperacaoLeadEsfriado extends RecuperacaoLeadBase {
  grupo: 'esfriado';
  motivoCodigo: 'sem_resposta';
}
export type RecuperacaoLeadRow = RecuperacaoLeadPerdido | RecuperacaoLeadEsfriado;

export interface RecuperacaoLeadsResponse {
  success: true;
  data: {
    resumo: RecuperacaoResumo;
    leads: RecuperacaoLeadRow[];
  };
  pagination: { total: number; page: number; pages: number; limit: number };
}

export interface RecuperacaoFiltros {
  de?: string;    // YYYY-MM-DD
  ate?: string;   // YYYY-MM-DD
  grupo: 'perdidos' | 'esfriados' | 'todos';
  motivoCodigo?: LeadMotivoCodigo;
  origem?: LeadOrigem;
  page: number;
  limit: number;
}
```

`RecuperacaoLeadRow`'s exact field names are this spec's design choice (the PRD gives the CSV column list and prose, not a literal JSON row shape) — implementers must reconcile field names against whatever F02 actually ships; if F02's shipped field names differ, this file is the single place to adjust, and downstream files only import from it.

---

## 4. API Contracts (consumed — read-only)

Both routes are mounted under `/api/v1` already (per `VITE_API_URL`); calls are relative (`/leads/recuperacao`, not `/api/v1/leads/recuperacao`).

### `GET /leads/recuperacao` (F02)
Query: `de`, `ate`, `grupo` (`perdidos`|`esfriados`|`todos`, default `todos`), `motivoCodigo`, `origem`, `page`, `limit` (max 100, default 20).

```json
{
  "success": true,
  "data": {
    "resumo": {
      "contactosRecebidos": 84,
      "leadsReais": 71,
      "descartados": 13,
      "convertidos": 22,
      "perdidos": 19,
      "esfriados": 30,
      "taxaConversao": 0.31,
      "porMotivo": [ { "codigo": "preco", "label": "Achou caro", "total": 8 } ]
    },
    "leads": [ /* RecuperacaoLeadRow[] */ ]
  },
  "pagination": { "total": 49, "page": 1, "pages": 3, "limit": 20 }
}
```

### `GET /leads/recuperacao/export.csv` (F03)
Same filters, no `page`/`limit` sent (export has no pagination — the endpoint itself caps at 5,000 rows). Response is not JSON:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="recuperacao-leads-YYYY-MM-DD.csv"`
- `X-Export-Truncated: true` present only when the 5,000-row cap was hit
- Body starts with a UTF-8 BOM; `;`-separated; CSV-injection-sanitized fields
- **Errors from this route still return the standard JSON envelope** (`{ success:false, error }`) — see §6 for the practical consequence on the frontend when `responseType: 'blob'` is used

**Cross-cutting requirement F04 depends on but does not implement:** the browser can only read `X-Export-Truncated` and `Content-Disposition` via JS if the backend's CORS config includes `Access-Control-Expose-Headers: X-Export-Truncated, Content-Disposition`. Verify this exists on the F03 route before wiring the truncation-toast logic — if it's missing, the file still downloads correctly (the browser applies `Content-Disposition` natively) but `response.headers['x-export-truncated']` reads as `undefined` in JS even when truncation happened.

---

## 5. Requirements / UX Flows

### 5.1 Page load
- On mount, fetch with default filters: `grupo: 'todos'`, no `de`/`ate` (full history — matches F02's own default when the params are omitted; no client-invented date range), `page: 1`, `limit: 20` (Assumption A5).
- Render order: header → summary strip → reason breakdown → filters bar → list → pagination.

### 5.2 Summary strip (7 tiles)
- Tiles, in this fixed order: Contactos Recebidos, Leads Reais, Descartados, Convertidos, Perdidos, Esfriados, Taxa de Conversão.
- `taxaConversao` renders as a rounded percentage (`0.31` → `"31%"`).
- Values come straight from `resumo` for the currently active filters — no client-side recomputation (byte-equal to the API, per PRD's F04←F02 cross-feature criterion).
- Layout: `grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7` (mirrors the existing stat-tile pattern in `pages/Transacoes.jsx`), each tile a glass card (`backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl`).

### 5.3 Reason breakdown
- One horizontal bar per `resumo.porMotivo[]` entry; bar width = `total / max(totals in porMotivo) * 100%`; label + count rendered next to the bar.
- Empty `porMotivo` → section collapses to a short "Sem perdas classificadas no período" message instead of an empty chart shell.

### 5.4 Filters
- `de`/`ate`: native `<input type="date">`, sent as `YYYY-MM-DD` strings.
- `grupo`: segmented control / select with `Todos | Perdidos | Esfriados` (default `Todos`).
- `motivoCodigo`: select populated from `RECUPERACAO_MOTIVO_LABELS` (8 fixed options + an "Todos os motivos" empty option).
- `origem`: select populated from the existing `LEAD_ORIGEM` constant in `types/lead.ts` (`whatsapp | manual | import | outro`) plus an empty "Todas as origens" option.
- Any filter change resets `page` to 1 and triggers an immediate refetch (no debounce needed — these are discrete selects/dates, not free text).
- Changing a filter must consistently update the strip, the breakdown and the list from the same response (single fetch produces all three — no partial-stale-data window).

### 5.5 List + pagination
- Desktop (`md:` and up): table with columns Nome, Telefone, Etapa onde parou, Motivo, Dias Parado. `origem` renders as a small secondary tag next to the name rather than its own column (Assumption A9) — it's already in the payload and used by the filter, but the PRD names only 5 columns for the list.
- The "Motivo" cell shows the label; clicking/tapping it expands the row to reveal `nota` when present.
- Sorted by `diasParado` desc — fixed, matches the API's own ordering; no client-side re-sort control.
- Pagination: prev/next buttons + "Página {page} de {pages}" text, following the exact pattern in `pages/Atendimentos.jsx`; buttons disabled at the first/last page.
- Mobile (below `md`): rows render as stacked glass cards instead of a table (PRD's explicit "rows as cards" requirement) — same fields, vertical layout.
- Each row reserves an empty trailing region for F05's future WhatsApp/contact-tracking buttons (a `<div className="flex gap-2">{/* F05: actions */}</div>` placeholder is enough — no functional button ships in F04).

### 5.6 "Exportar CSV" button
- Placed near the filters bar; always uses the **currently active filters** (not `page`/`limit` — export is unpaginated).
- Click flow:
  1. `await api.get('/leads/recuperacao/export.csv', { params: buildQueryParams(filtrosSemPaginacao), responseType: 'blob' })` — using the shared axios instance so the request interceptor still attaches `Authorization: Bearer <token>`. A plain `<a href="...">` pointing straight at the API URL would **not** carry the JWT and would 401 (Decision A2).
  2. Read `response.headers['x-export-truncated']`; if `'true'`, `toast.warning('Exportação limitada a 5.000 linhas — refine os filtros para ver a lista completa.')` (does not block the download).
  3. Build a `Blob` from `response.data` with `type: 'text/csv;charset=utf-8'`, `URL.createObjectURL(blob)`, a temporary `<a download>` element (filename parsed from `Content-Disposition`, falling back to `recuperacao-leads-<today Europe/Lisbon>.csv` if the header is missing/unreadable), click it, then `URL.revokeObjectURL(url)`.
- No custom success toast beyond the truncation warning (the existing success interceptor is a no-op for blob bodies, so nothing double-fires).

---

## 6. Error Handling

Read-only page — all failure modes are about **displaying state correctly**, never about corrupting server data.

| Scenario | Behavior |
|---|---|
| `GET /leads/recuperacao` network/5xx failure | Error state: message + "Tentar novamente" button that re-runs the last fetch with the same filters. The global axios interceptor's generic toast also fires (existing app-wide behavior) — the inline state does not duplicate that message, it just gives a retry affordance |
| `GET /leads/recuperacao` returns `403` (user lost `verLeads` mid-session, or navigated to the URL directly without the permission) | Inline "Acesso Negado" card (mirrors `ProtectedRoute.jsx`'s existing role-denied treatment: icon + heading + "Voltar ao Dashboard" link) instead of a hard `<Navigate>` redirect — consistent with how the rest of the app surfaces 403s. `ProtectedRoute.jsx` itself is **not** modified (it has no fine-grained permission concept, only role/plan) — see Assumption A1 |
| Malformed `de`/`ate` sent to the API → `400` | Same error-state treatment as any other fetch failure; in practice unreachable through the UI's own date pickers (they only emit valid `YYYY-MM-DD`), so this is a defensive path, not a primary flow |
| `GET /leads/recuperacao/export.csv` fails (400/403/5xx) while `responseType: 'blob'` | Axios delivers the JSON error body as a `Blob`, not parsed JSON, because `responseType` is fixed for the whole response regardless of status. The existing global interceptor's `ERROR_MESSAGES[status]` fallback toast still fires (generic wording, e.g. "Dados inválidos..."), since `error.response.data?.error` is `undefined` on a Blob. F04 does not add blob-to-JSON re-parsing logic to recover the precise backend message — doing so cleanly needs an opt-out-of-toast flag on `api.js` shared by the whole app, which is out of this feature's file list (Assumption A3, registered as debt) |
| `X-Export-Truncated: true` present | Non-blocking `toast.warning(...)`; the file still downloads in full (first 5,000 rows) |
| `Access-Control-Expose-Headers` missing on the F03 route | Download still succeeds (browser applies `Content-Disposition` natively), but the truncation toast silently never fires even when truncation happened — flagged as a prerequisite to verify (§4), not something F04 can detect or work around client-side |
| Empty `leads` array (valid filters, nothing recoverable) | Empty state: "Nenhum lead para recuperar neste período 🎉" (verbatim from PRD §6, F04) — replaces the list area only; strip and breakdown still render (they can be non-zero even when the paginated list is empty, e.g. all recoverable leads fit on an earlier page) |
| Fetch in flight | Loading state (spinner + message) replaces the list area on first load; subsequent filter-triggered refetches keep the previous content visible with a lightweight inline spinner/disabled-filters treatment rather than a full-screen blank — the screen must never look frozen (`isLoading` always toggled) |

---

## 7. Testing Strategy

No backend tests in this feature (no server code). Playwright-drivable checks for the evaluator, plus a couple of Vitest/RTL-level component checks if the project's frontend test runner supports them.

**Rendering / data-binding:**
- Navigating to `/leads/recuperacao` as a user with `verLeads` renders the page; the 7 summary tiles show values equal to a mocked `GET /leads/recuperacao` response's `resumo` fields (byte-equal, no rounding beyond `taxaConversao`'s percentage display).
- The reason breakdown renders one bar per `resumo.porMotivo` entry with the mocked labels/totals; an empty `porMotivo` array renders the "Sem perdas classificadas" message instead of an empty chart.
- The list renders rows in the mocked order (days-stalled desc, as the mock provides it) with the 5 documented fields; expanding a row reveals its `nota`.

**Filters:**
- Changing `grupo`, `motivoCodigo`, `origem`, or either date input issues a new `GET /leads/recuperacao` request with the corresponding query param set and `page` reset to `1`; the mocked response for the new filters is what ends up rendered in strip + breakdown + list (no stale mix from the previous filter set).

**Sidebar gating:**
- A user whose `permissoes.verLeads` is falsy (and role not admin/superadmin) does not see the "Recuperação" entry in the Sidebar's CRM group.
- A user with `verLeads` sees it, and it links to `/leads/recuperacao`.

**Permission-denied page state:**
- Mocking a `403` response from `GET /leads/recuperacao` renders the inline "Acesso Negado" state, not a blank screen or an unhandled crash (`ErrorBoundary` never needs to catch this — it's a normal render branch).

**Export:**
- Clicking "Exportar CSV" issues `GET /leads/recuperacao/export.csv` with `responseType: 'blob'` and the active filters as query params (verifiable via `read_network_requests` in the Chrome/Playwright driver); a mocked response with `X-Export-Truncated: true` triggers the warning toast; without that header, no toast appears.
- The `Authorization` header is present on the export request (proves the axios-blob approach, not a bare `<a href>`, is what's wired).

**Loading / empty / error states:**
- A delayed mock shows the loading spinner before data arrives; the screen is never fully blank/unresponsive during that window.
- A mock with `data.leads: []` (but a non-empty `resumo`) shows the "Nenhum lead para recuperar neste período 🎉" empty state for the list area while the strip still renders.
- A mock 500 response shows the error state with a working "Tentar novamente" control that re-issues the request.

**Theme & responsive:**
- Page renders correctly with `ThemeContext.isDarkMode` true and false (glass cards, text contrast — spot-check via screenshot, no pixel-diff requirement).
- At a 375px viewport, the summary strip renders as 2 columns and the list renders as stacked cards, not a horizontally-scrolling table.

---

## 8. Assumptions / Decisions

- **A1 [Auto-Accept]** No change to `ProtectedRoute.jsx`. It only understands `allowedRoles`/`requiredPlans`, not fine-grained permission keys like `verLeads`. Enforcement stays three-layered, matching the rest of the app: Sidebar hides the link, the backend returns 403, and the page renders its own inline "Acesso Negado" state on that 403 — no redirect prop is added to `ProtectedLayout` for this route.
- **A2 [Auto-Accept]** CSV download goes through `api.js`'s axios instance with `responseType: 'blob'` + `URL.createObjectURL` + a temporary `<a download>` click, specifically so the request interceptor attaches `Authorization: Bearer <token>`. A plain `<a href={csvUrl}>` would hit the API unauthenticated and 401.
- **A3 [Auto-Accept]** Export-failure toasts stay generic (the existing `ERROR_MESSAGES[status]` fallback in `api.js`'s interceptor) because axios delivers error bodies as `Blob` when `responseType: 'blob'` is set, and re-parsing that blob to recover the precise `{ error }` message needs an opt-out-of-toast flag on the shared `api.js` interceptor — out of this feature's file list. Registered as debt, not blocking.
- **A4 [Revised — orchestrator reconciliation]** F01's spec adds `LEAD_MOTIVOS_PERDA`/`LEAD_MOTIVO_VALUES` to `laura-saas-frontend/src/types/lead.ts` in Wave 1 — guaranteed implemented before Wave 4. `types/recuperacaoLeads.ts` therefore **re-exports** those constants (`export { LEAD_MOTIVOS_PERDA as RECUPERACAO_MOTIVO_LABELS } from './lead'`) instead of declaring a duplicate local map; the local-declaration snippet in §3 applies only as fallback if F01 shipped without the frontend constants. One source of truth for the 8 labels on the frontend.
- **A5 [Auto-Accept]** Default filters on first load: `grupo: 'todos'`, no `de`/`ate` (full history), `page: 1`, `limit: 20` — matches F02's own defaults; no client-invented "last N days" default window.
- **A6 [Auto-Accept]** `RecuperacaoLeadRow` is a discriminated union on `grupo` (`'perdido'` vs `'esfriado'`), narrowing `motivoCodigo` to the literal `'sem_resposta'` for cold rows — per CLAUDE.md's TS guidance and design §5 ("esfriado" rows always carry that single reason).
- **A7 [Auto-Accept]** F05's WhatsApp button and "mark as contacted" action are out of scope; `RecuperacaoLeadRow.tsx` reserves an empty trailing actions region so F05 can extend it without a refactor.
- **A8 [Auto-Accept]** The `jaContactado` flag, when true, renders as a small informational badge only — no action attached in F04 (the action is F05's).
- **A9 [Auto-Accept]** `origem` is shown as a secondary tag next to the lead's name rather than a 6th table column, since the PRD's F04 list-columns line names only 5 fields; the data is still present in the payload for anyone who needs it, and remains a filter.
- **A10 [Auto-Accept]** Mobile breakpoint for the summary strip mirrors the existing convention in `pages/Transacoes.jsx` (`grid-cols-2 md:grid-cols-4 lg:grid-cols-7`); the list's table→card breakpoint uses the same `md:` boundary for a single consistent responsive rule across the page.
