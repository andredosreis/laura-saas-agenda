# F04 — Recovery Page UI · Contract (GWT)

> Source: `docs/produto/PRD-recuperacao-leads.md` §9 (F04 acceptance criteria) + Cross-Feature Integration (F04←F02, F04←F03).

## C1 — Route renders for an authorized user
- **GIVEN** an authenticated user whose role/permissions include `verLeads`
- **WHEN** they navigate to `/leads/recuperacao`
- **THEN** the page renders (summary strip, breakdown, filters, list) instead of a blank screen or a redirect.

## C2 — Sidebar entry gated by `verLeads`
- **GIVEN** a user without `verLeads` (and not `admin`/`superadmin`)
- **WHEN** the Sidebar renders
- **THEN** the "Recuperação" entry does not appear in the CRM group
- **AND GIVEN** a user with `verLeads`, it appears and links to `/leads/recuperacao`.

## C3 — Summary strip matches F02's `resumo` (F04←F02)
- **GIVEN** a `GET /leads/recuperacao` response with a given `resumo` for the active filters
- **WHEN** the page renders
- **THEN** all 7 tiles (`contactosRecebidos`, `leadsReais`, `descartados`, `convertidos`, `perdidos`, `esfriados`, `taxaConversao`) show values byte-equal to that `resumo` — no client-side recomputation, `taxaConversao` only reformatted as a percentage string.

## C4 — Reason breakdown matches `porMotivo`
- **GIVEN** a `resumo.porMotivo` array with N entries
- **WHEN** the page renders
- **THEN** exactly N horizontal bars render, each labeled and counted per the corresponding entry
- **AND GIVEN** an empty `porMotivo` array, a "no losses in this period" message renders instead of an empty bar area.

## C5 — Filter change refetches and updates consistently
- **GIVEN** the page has loaded with an initial filter set
- **WHEN** the user changes `de`, `ate`, `grupo`, `motivoCodigo`, or `origem`
- **THEN** a new `GET /leads/recuperacao` request fires with the corresponding query params and `page` reset to `1`
- **AND** the strip, breakdown and list all update from that single new response — no stale mix of old-filter and new-filter data across the three areas.

## C6 — Loading, empty and error states render; screen never freezes
- **GIVEN** a fetch is in flight
- **WHEN** the page is displayed
- **THEN** a loading indicator is visible (never a blank/unresponsive screen)
- **AND GIVEN** a response with an empty `leads` array, the list area shows "Nenhum lead para recuperar neste período 🎉"
- **AND GIVEN** a failed request (5xx/network), an error state renders with a working retry control that re-issues the same request.

## C7 — Permission-denied (403) renders inline, not a crash or blank page
- **GIVEN** `GET /leads/recuperacao` responds `403` (e.g., a user who lost `verLeads` mid-session, or reached the URL directly)
- **WHEN** the page handles that response
- **THEN** it renders an inline "Acesso Negado" state (consistent with the existing `ProtectedRoute.jsx` role-denied treatment) — not an uncaught error, not a frozen/blank screen, and not modifying `ProtectedRoute.jsx` itself.

## C8 — "Exportar CSV" honors active filters and authenticates the download (F04←F03)
- **GIVEN** an active filter set (`de`/`ate`/`grupo`/`motivoCodigo`/`origem`)
- **WHEN** the user clicks "Exportar CSV"
- **THEN** a `GET /leads/recuperacao/export.csv` request fires carrying those same filters as query params (no `page`/`limit`), via the shared `api.js` axios instance with `responseType: 'blob'`
- **AND** the request carries the `Authorization: Bearer <token>` header (proving the axios-blob + `createObjectURL` approach is used, not a bare `<a href>` that would bypass auth and 401).

## C9 — Truncation warning surfaces without blocking the download
- **GIVEN** the export response includes header `X-Export-Truncated: true`
- **WHEN** the download completes
- **THEN** a warning toast appears
- **AND GIVEN** the header is absent, no such toast appears
- **AND** in both cases the file download itself still completes.

## C10 — Exported rows match the displayed list for identical filters (F04←F03)
- **GIVEN** the recovery list currently displayed for a given filter set
- **WHEN** the same filters are used to call `GET /leads/recuperacao/export.csv`
- **THEN** the CSV's data rows correspond to the same lead set the page is showing (up to F03's 5,000-row cap and the page's own pagination window — i.e., the CSV is the full unpaginated equivalent of what the filters describe, not a different query).

## C11 — Design system compliance in both themes
- **GIVEN** `ThemeContext.isDarkMode` is `true` or `false`
- **WHEN** the page renders
- **THEN** it uses the mandated palette (indigo-500/purple-500/slate-900) and glass cards (`backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl`) in both modes, with legible text contrast in each.

## C12 — Mobile layout at 375px
- **GIVEN** a 375px-wide viewport
- **WHEN** the page renders
- **THEN** the summary strip lays out in 2 columns (not 7-across or horizontally scrolling)
- **AND** list rows render as stacked cards rather than a horizontally-scrolling table.

## Prerequisites (the evaluator must ensure these exist)
- F02 (`GET /leads/recuperacao`) and F03 (`GET /leads/recuperacao/export.csv`) implemented and reachable, including tenant-scoped `verLeads`-gated responses that this page's mocks/fixtures can stand in for.
- `Access-Control-Expose-Headers` on the F03 route includes `X-Export-Truncated` and `Content-Disposition`, or C9 cannot be observed from the browser even though the download itself still works.
- Test users/fixtures covering: a user with `verLeads`, a user without it, and a mocked/forced `403` response path for C7.
- Chrome/Playwright driver capable of inspecting outgoing request headers (for C8's `Authorization` check) and response headers (for C9).
