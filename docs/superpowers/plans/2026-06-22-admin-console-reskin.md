# Re-skin da Consola Admin (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar a consola super-admin ao design system da app (indigo/purple/slate dark + glass) e adicionar um strip de KPIs derivados client-side (Total/Trial/Activos/Suspensos) + distribuição por plano, sem alterar backend.

**Architecture:** Re-skin puramente visual de 8 ficheiros frontend trocando hex cream/rust por tokens Tailwind (`@theme` já existentes). A lógica de dados consolida-se num único fetch (`useAdminTenants`, `limit=100`) que alimenta KPIs, distribuição e tabela (client-side filter + paginação). Helpers de UI (`StatusPill`/`PlanBadge`/`Avatar`/`ConsoleCard`) mantêm a API pública — só mudam por dentro — logo as páginas não precisam de os reescrever.

**Tech Stack:** React 19 + TypeScript, Vite 6, Tailwind v4 (`@theme` em `src/index.css`), Vitest + @testing-library/react (jsdom).

## Global Constraints

- **Cwd dos comandos:** `laura-saas-frontend/` (todos os `npm` correm aqui).
- **Test runner:** `npm run test:run` (vitest run). Lint: `npm run lint`. Build: `npm run build`.
- **Zero backend:** nenhum ficheiro em `src/` (raiz do repo) é tocado. O endpoint `GET /admin/tenants` já aceita `limit` até 100.
- **APIs de componente estáveis:** `StatusPill({status})`, `PlanBadge({plano})`, `Avatar({name,size})`, `ConsoleCard({children,className})`, `formatLimite`, `initialsFromName`, `FEATURE_FLAG_LABELS` mantêm assinatura. Só mudam internamente.
- **Tipografia:** remover `font-console` dos wrappers (passa a usar Inter, o default). Manter `font-console-mono` apenas em números/IDs/slugs/datas.
- **Raios (`rounded-[...]`) fora de âmbito:** não alterar nos ficheiros mecânicos; manter os existentes. (Componentes novos usam `rounded-2xl`.)
- **Mapa canónico hex→classe** (aplicar a TODOS os `className` nos ficheiros de re-skin mecânico — Tasks 4, 6, 7, 8):

  | hex actual (contexto) | classe nova |
  |---|---|
  | `#211f1c` (fundo página) | `bg-dark-900` |
  | `#f4f1ec` como **fundo** (painel) | `bg-dark-800` |
  | `#f4f1ec` como **texto** (claro) | `text-dark-50` |
  | `#fbf9f6` / `#faf8f4` / `#faf6f1` (fundo subtil/header/hover) | `bg-white/5` |
  | `#e8e2da` / `#34302b` / `#f1ece4` / `#ddd5ca` (bordas) | `border-white/10` |
  | `#221f1d` como **texto** | `text-dark-50` |
  | `#221f1d` / `#3f3a34` como **fundo de botão** | `bg-gradient-to-r from-primary-500 to-purple-600` (hover `from-primary-600 hover:to-purple-700`) |
  | `#9a938c` / `#8f877d` / `#8a827a` / `#a59d93` / `#6f6862` / `#c8c0b6` (subtexto) | `text-dark-400` |
  | `#bd5d33` (accent: ring/border/spinner) | `primary-500` → `focus:ring-primary-500/40`, `focus:border-primary-500`, `border-primary-500`, spinner `border-primary-500` |
  | `#a14d27` (texto accent) | `text-primary-400` |
  | `#9e2f22` (texto erro) | `text-red-300` |
  | `#fbf1ea` (fundo erro) | `bg-red-500/10` |
  | `#e8cdba` (borda erro) | `border-red-500/20` |
  | `font-console` (no wrapper) | remover |

- **Cap honesto:** quando o total de tenants excede o que o fetch traz (100), mostrar aviso visível (ver Task 5) — nunca números enganadores.
- **Spec de referência:** `docs/superpowers/specs/2026-06-22-admin-console-reskin-design.md`.

**Antes de começar:** criar branch de trabalho a partir da branch actual:
```bash
git checkout -b F12-admin-console-reskin
```

---

### Task 1: Helper puro `computeTenantStats`

**Files:**
- Create: `laura-saas-frontend/src/components/admin/adminStats.ts`
- Test: `laura-saas-frontend/src/components/admin/__tests__/adminStats.test.ts`

**Interfaces:**
- Produces: `interface TenantStats { trial: number; ativos: number; suspensos: number; distribution: { basico: number; pro: number; elite: number; custom: number } }` e `function computeTenantStats(tenants: TenantSummary[]): TenantStats`.

- [ ] **Step 1: Write the failing test**

Create `laura-saas-frontend/src/components/admin/__tests__/adminStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeTenantStats } from '../adminStats';
import { PlanoStatus, PlanoTipo, TenantSummary } from '../../../types/admin';

const mk = (status: PlanoStatus, tipo: PlanoTipo, i: number): TenantSummary => ({
  _id: String(i), nome: 'T' + i, slug: 't' + i,
  plano: { status, tipo }, createdAt: '2026-01-01',
});

describe('computeTenantStats', () => {
  it('conta estados e distribuição por plano', () => {
    const r = computeTenantStats([
      mk('trial', 'basico', 1), mk('ativo', 'pro', 2), mk('ativo', 'pro', 3),
      mk('suspenso', 'elite', 4), mk('cancelado', 'custom', 5),
    ]);
    expect(r.trial).toBe(1);
    expect(r.ativos).toBe(2);
    expect(r.suspensos).toBe(1);
    expect(r.distribution).toEqual({ basico: 1, pro: 2, elite: 1, custom: 1 });
  });

  it('devolve zeros para lista vazia', () => {
    expect(computeTenantStats([])).toEqual({
      trial: 0, ativos: 0, suspensos: 0,
      distribution: { basico: 0, pro: 0, elite: 0, custom: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- adminStats`
Expected: FAIL — `Failed to resolve import "../adminStats"` (ficheiro ainda não existe).

- [ ] **Step 3: Write minimal implementation**

Create `laura-saas-frontend/src/components/admin/adminStats.ts`:

```ts
import { TenantSummary } from '../../types/admin';

export interface TenantStats {
  trial: number;
  ativos: number;
  suspensos: number;
  distribution: { basico: number; pro: number; elite: number; custom: number };
}

/** Deriva contagens de estado e distribuição por plano a partir da lista carregada. */
export function computeTenantStats(tenants: TenantSummary[]): TenantStats {
  const stats: TenantStats = {
    trial: 0,
    ativos: 0,
    suspensos: 0,
    distribution: { basico: 0, pro: 0, elite: 0, custom: 0 },
  };
  for (const t of tenants) {
    if (t.plano.status === 'trial') stats.trial++;
    else if (t.plano.status === 'ativo') stats.ativos++;
    else if (t.plano.status === 'suspenso') stats.suspensos++;
    stats.distribution[t.plano.tipo]++;
  }
  return stats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- adminStats`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add laura-saas-frontend/src/components/admin/adminStats.ts laura-saas-frontend/src/components/admin/__tests__/adminStats.test.ts
git commit -m "feat(admin): computeTenantStats — KPIs derivados client-side"
```

---

### Task 2: `useAdminTenants` — fetch único (limit=100)

**Files:**
- Modify: `laura-saas-frontend/src/hooks/useAdminTenants.ts:6-37` (apenas a função `useAdminTenants`; `useAdminTenantDetail` fica intacta)
- Test: `laura-saas-frontend/src/hooks/__tests__/useAdminTenants.test.ts`

**Interfaces:**
- Consumes: `apiHelpers.get(url)` de `../services/api`; tipos de `../types/admin`.
- Produces: `useAdminTenants(): { tenants: TenantSummary[]; total: number; loading: boolean; error: string | null; refetch: () => void }`. **Nota:** assinatura muda — deixa de receber `(page, limit)` e deixa de devolver `data`/`pagination`. O único consumidor (`TenantsListPage`) é actualizado na Task 5.

- [ ] **Step 1: Write the failing test**

Create `laura-saas-frontend/src/hooks/__tests__/useAdminTenants.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({ apiHelpers: { get: vi.fn() } }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn() } }));

import { apiHelpers } from '../../services/api';
import { useAdminTenants } from '../useAdminTenants';

describe('useAdminTenants', () => {
  beforeEach(() => vi.clearAllMocks());

  it('faz um único fetch com limit=100 e expõe tenants + total', async () => {
    (apiHelpers.get as any).mockResolvedValue({
      success: true,
      data: [{ _id: '1', nome: 'A', slug: 'a', plano: { tipo: 'pro', status: 'ativo' }, createdAt: '2026-01-01' }],
      pagination: { total: 1, page: 1, pages: 1, limit: 100 },
    });

    const { result } = renderHook(() => useAdminTenants());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(apiHelpers.get).toHaveBeenCalledTimes(1);
    expect(apiHelpers.get).toHaveBeenCalledWith('/v1/admin/tenants?page=1&limit=100');
    expect(result.current.tenants).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- useAdminTenants`
Expected: FAIL — `result.current.tenants` é `undefined` (o hook ainda devolve `data`/`pagination`).

- [ ] **Step 3: Write minimal implementation**

Replace lines 6-37 (a função `useAdminTenants`) em `laura-saas-frontend/src/hooks/useAdminTenants.ts` por:

```ts
export function useAdminTenants() {
  const [data, setData] = useState<PaginatedResponse<TenantSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch único (limit=100, o máximo do backend) — alimenta KPIs + distribuição + tabela.
      const response = await apiHelpers.get('/v1/admin/tenants?page=1&limit=100');
      setData(response as PaginatedResponse<TenantSummary>);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar tenants';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  return {
    tenants: data?.data || [],
    total: data?.pagination?.total ?? 0,
    loading,
    error,
    refetch: fetchTenants,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:run -- useAdminTenants`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add laura-saas-frontend/src/hooks/useAdminTenants.ts laura-saas-frontend/src/hooks/__tests__/useAdminTenants.test.ts
git commit -m "refactor(admin): useAdminTenants — fetch único limit=100 (tenants + total)"
```

---

### Task 3: Re-skin `ConsoleUI` + componentes novos `KpiCard` / `PlanDistributionBar`

**Files:**
- Modify: `laura-saas-frontend/src/components/admin/ConsoleUI.tsx` (reescrever `STATUS_STYLES`, `PLAN_STYLES`, `StatusPill`, `PlanBadge`, `Avatar`, `ConsoleCard`, `StatBlock`; adicionar `KpiCard`, `PlanDistributionBar`). Manter `FEATURE_FLAG_LABELS`, `formatLimite`, `initialsFromName` como estão.
- Test: `laura-saas-frontend/src/components/admin/__tests__/ConsoleUI.test.tsx`

**Interfaces:**
- Consumes: `TenantStats` de `./adminStats` (Task 1).
- Produces: `KpiCard({ label: string; value: React.ReactNode; accent?: boolean })`, `PlanDistributionBar({ distribution: TenantStats['distribution'] })`. `STATUS_STYLES`/`PLAN_STYLES` passam a conter strings de className (não hex inline). `StatusPill`/`PlanBadge`/`Avatar`/`ConsoleCard` mantêm a assinatura.

- [ ] **Step 1: Write the failing test**

Create `laura-saas-frontend/src/components/admin/__tests__/ConsoleUI.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard, PlanDistributionBar } from '../ConsoleUI';

describe('KpiCard', () => {
  it('mostra label e valor', () => {
    render(<KpiCard label="Em Trial" value={3} />);
    expect(screen.getByText('Em Trial')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('PlanDistributionBar', () => {
  it('mostra a legenda com contagens por plano', () => {
    render(<PlanDistributionBar distribution={{ basico: 5, pro: 7, elite: 4, custom: 0 }} />);
    expect(screen.getByText('Distribuição por plano')).toBeInTheDocument();
    expect(screen.getByText('basico')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há tenants', () => {
    render(<PlanDistributionBar distribution={{ basico: 0, pro: 0, elite: 0, custom: 0 }} />);
    expect(screen.getByText('Sem tenants.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- ConsoleUI`
Expected: FAIL — `KpiCard`/`PlanDistributionBar` não exportados.

- [ ] **Step 3: Write the implementation**

Em `laura-saas-frontend/src/components/admin/ConsoleUI.tsx`:

(a) Adicionar o import no topo (a seguir a `import React`):

```tsx
import { TenantStats } from './adminStats';
```

(b) Substituir os blocos `STATUS_STYLES` (linhas 3-14) e `PLAN_STYLES` (linhas 16-21) por:

```tsx
export const STATUS_STYLES: Record<string, { pill: string; dot: string; label: string }> = {
  // Tenant — plano.status
  trial: { pill: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400', label: 'Trial' },
  ativo: { pill: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400', label: 'Activo' },
  suspenso: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Suspenso' },
  expirado: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Expirado' },
  cancelado: { pill: 'bg-dark-600/40 text-dark-300', dot: 'bg-dark-400', label: 'Cancelado' },
  // Audit log — status
  ok: { pill: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400', label: 'OK' },
  denied: { pill: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400', label: 'Denied' },
  error: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Error' },
};

export const PLAN_STYLES: Record<string, string> = {
  basico: 'bg-dark-700 text-dark-300',
  pro: 'bg-primary-500/20 text-primary-300',
  elite: 'bg-purple-500/20 text-purple-300',
  custom: 'bg-dark-700 text-dark-300',
};
```

(c) Substituir `StatusPill` (linhas 47-58) por:

```tsx
export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.ativo;
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[2px] text-[12.5px] font-semibold whitespace-nowrap ${s.pill}`}
    >
      <span className={`w-[7px] h-[7px] rounded-[1px] inline-block ${s.dot}`} />
      {s.label}
    </span>
  );
}
```

(d) Substituir `PlanBadge` (linhas 60-70) por:

```tsx
export function PlanBadge({ plano }: { plano: string }) {
  const cls = PLAN_STYLES[plano] ?? PLAN_STYLES.basico;
  return (
    <span
      className={`font-console-mono inline-flex items-center h-[22px] px-2.5 rounded-[2px] text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap ${cls}`}
    >
      {plano}
    </span>
  );
}
```

(e) Substituir `Avatar` (linhas 72-87) por:

```tsx
export function Avatar({ name, size = 34 }: { name: string | undefined; size?: number }) {
  return (
    <span
      className="font-console-mono rounded-full flex items-center justify-center font-semibold shrink-0 bg-gradient-to-br from-primary-500 to-purple-600 text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
    >
      {initialsFromName(name)}
    </span>
  );
}
```

(f) Substituir `ConsoleCard` (linhas 89-95) por:

```tsx
export function ConsoleCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-dark-800 border border-white/10 rounded-[3px] ${className}`}>
      {children}
    </div>
  );
}
```

(g) Substituir `StatBlock` (linhas 97-114) por:

```tsx
export function StatBlock({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <ConsoleCard className="p-[14px_15px]">
      <div className={`font-console-mono text-[10px] uppercase tracking-[.1em] ${accent ? 'text-primary-400' : 'text-dark-400'}`}>
        {label}
      </div>
      <div className={`font-console-mono text-[25px] font-semibold mt-[7px] ${accent ? 'text-primary-300' : 'text-dark-50'}`}>
        {value}
      </div>
    </ConsoleCard>
  );
}
```

(h) Adicionar no fim do ficheiro `KpiCard` e `PlanDistributionBar`:

```tsx
export function KpiCard({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-[15px_17px]">
      <div className="font-console-mono text-[10px] uppercase tracking-[.1em] text-dark-400">{label}</div>
      <div className={`font-console-mono text-[26px] font-semibold mt-2 ${accent ? 'text-primary-300' : 'text-dark-50'}`}>
        {value}
      </div>
    </div>
  );
}

const PLAN_BAR_COLORS: Record<string, string> = {
  basico: 'bg-dark-500',
  pro: 'bg-primary-500',
  elite: 'bg-purple-500',
  custom: 'bg-dark-600',
};
const PLAN_ORDER = ['basico', 'pro', 'elite', 'custom'] as const;

export function PlanDistributionBar({ distribution }: { distribution: TenantStats['distribution'] }) {
  const total = PLAN_ORDER.reduce((sum, k) => sum + distribution[k], 0);
  return (
    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-[15px_17px]">
      <div className="font-console-mono text-[10px] uppercase tracking-[.1em] text-dark-400 mb-3">
        Distribuição por plano
      </div>
      {total === 0 ? (
        <div className="text-dark-400 text-[13px]">Sem tenants.</div>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-dark-900">
            {PLAN_ORDER.filter((k) => distribution[k] > 0).map((k) => (
              <div key={k} className={PLAN_BAR_COLORS[k]} style={{ width: `${(distribution[k] / total) * 100}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 font-console-mono text-[12px] text-dark-300">
            {PLAN_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${PLAN_BAR_COLORS[k]}`} />
                <span className="capitalize">{k}</span> {distribution[k]}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + lint**

Run: `npm run test:run -- ConsoleUI` → Expected: PASS (3 testes).
Run: `npm run lint` → Expected: sem erros nos ficheiros tocados.

- [ ] **Step 5: Commit**

```bash
git add laura-saas-frontend/src/components/admin/ConsoleUI.tsx laura-saas-frontend/src/components/admin/__tests__/ConsoleUI.test.tsx
git commit -m "feat(admin): re-skin ConsoleUI (dark tokens) + KpiCard + PlanDistributionBar"
```

---

### Task 4: Re-skin `ConsoleChrome`

**Files:**
- Modify: `laura-saas-frontend/src/components/admin/ConsoleChrome.tsx`

**Interfaces:**
- Consumes: `initialsFromName` de `./ConsoleUI` (inalterado).
- Produces: nada novo (só visual).

- [ ] **Step 1: Aplicar o mapa canónico + casos específicos**

Aplicar o **Mapa canónico hex→classe** (Global Constraints) a todos os `className` do ficheiro. Casos específicos a confirmar:

- Linha 17: `className="min-h-screen bg-[#211f1c] font-console p-5 sm:p-9"` → `className="min-h-screen bg-dark-900 p-5 sm:p-9"` (remove `font-console` e `bg-[#211f1c]`).
- Linha 21: logo `bg-[#f4f1ec]` (quadrado claro) → manter um disco de marca: `bg-white/10`. O ponto interior `bg-[#bd5d33]` → `bg-primary-500`.
- Linha 25: título `text-[#f4f1ec]` → `text-dark-50`.
- Linha 28: subtítulo `text-[#8f877d]` → `text-dark-400`.
- Linha 34: `nav` mantém `font-console-mono`.
- Linhas 42-43: NavLink activo `text-[#f4f1ec] border-[#bd5d33]` → `text-dark-50 border-primary-500`; inactivo `text-[#8f877d] ... hover:text-[#c8c0b6]` → `text-dark-400 ... hover:text-dark-200`.
- Linha 53: painel `bg-[#f4f1ec] border-[#34302b]` → `bg-dark-800 border-white/10`.
- Linha 54: header painel `bg-[#fbf9f6] border-[#e8e2da]` → `bg-white/5 border-white/10`.
- Linha 56: quadrado `bg-[#221f1d]` → `bg-white/10`; ponto `bg-[#bd5d33]` → `bg-primary-500`.
- Linha 59: `text-[#221f1d]` → `text-dark-50`.
- Linha 60: `text-[#a59d93] border-[#ddd5ca]` → `text-dark-400 border-white/10`.
- Linha 65: `text-[#6f6862]` → `text-dark-400`.
- Linha 66: avatar `bg-[#221f1d]` → `bg-gradient-to-br from-primary-500 to-purple-600`; texto `text-[#f4f1ec]` → `text-white`.

- [ ] **Step 2: Verificar ausência de hex cream/rust no ficheiro**

Run: `grep -nE "#(211f1c|f4f1ec|fbf9f6|e8e2da|221f1d|9a938c|8f877d|bd5d33|a14d27|ddd5ca|8a827a|a59d93|6f6862|c8c0b6|34302b)" laura-saas-frontend/src/components/admin/ConsoleChrome.tsx || echo "OK: sem hex"`
Expected: `OK: sem hex`

- [ ] **Step 3: Lint**

Run: `cd laura-saas-frontend && npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add laura-saas-frontend/src/components/admin/ConsoleChrome.tsx
git commit -m "style(admin): re-skin ConsoleChrome para o design system (dark)"
```

---

### Task 5: `TenantsListPage` — overview strip + paginação client-side + re-skin

**Files:**
- Modify (rewrite completo): `laura-saas-frontend/src/pages/admin/TenantsListPage.tsx`
- Test: `laura-saas-frontend/src/pages/admin/__tests__/TenantsListPage.test.tsx`

**Interfaces:**
- Consumes: `useAdminTenants()` (Task 2), `computeTenantStats` (Task 1), `KpiCard`/`PlanDistributionBar`/`Avatar`/`ConsoleCard`/`PlanBadge`/`StatusPill` (Task 3).

- [ ] **Step 1: Write the failing test**

Create `laura-saas-frontend/src/pages/admin/__tests__/TenantsListPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useAdminTenants', () => ({ useAdminTenants: vi.fn() }));
vi.mock('../../../components/admin/CreateTenantForm', () => ({ CreateTenantForm: () => null }));

import { useAdminTenants } from '../../../hooks/useAdminTenants';
import TenantsListPage from '../TenantsListPage';

const mk = (status: string, tipo: string, i: number) => ({
  _id: String(i), nome: 'T' + i, slug: 't' + i,
  plano: { status, tipo }, createdAt: '2026-01-01',
});

describe('TenantsListPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza o strip de overview e a tabela a partir do hook', () => {
    (useAdminTenants as any).mockReturnValue({
      tenants: [mk('trial', 'pro', 1)], total: 1, loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Em Trial')).toBeInTheDocument();
    expect(screen.getByText('Distribuição por plano')).toBeInTheDocument();
    expect(screen.getByText('T1')).toBeInTheDocument();
  });

  it('mostra aviso de cap quando total > tenants carregados', () => {
    (useAdminTenants as any).mockReturnValue({
      tenants: [mk('ativo', 'pro', 1)], total: 150, loading: false, error: null, refetch: vi.fn(),
    });
    render(<MemoryRouter><TenantsListPage /></MemoryRouter>);
    expect(screen.getByText(/de 150 tenants/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- TenantsListPage`
Expected: FAIL — `screen.getByText('Total')` não encontrado (página ainda é a antiga, sem strip).

- [ ] **Step 3: Rewrite the page**

Substituir o conteúdo completo de `laura-saas-frontend/src/pages/admin/TenantsListPage.tsx` por:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminTenants } from '../../hooks/useAdminTenants';
import { computeTenantStats } from '../../components/admin/adminStats';
import {
  Avatar, ConsoleCard, PlanBadge, StatusPill, KpiCard, PlanDistributionBar,
} from '../../components/admin/ConsoleUI';
import { CreateTenantForm } from '../../components/admin/CreateTenantForm';

const PAGE_SIZE = 20;

export default function TenantsListPage() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { tenants, total, loading, error, refetch } = useAdminTenants();
  const navigate = useNavigate();

  const stats = useMemo(() => computeTenantStats(tenants), [tenants]);

  const filtered = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.slug.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [tenants, searchTerm]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const overLimit = total > tenants.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-[21px] font-semibold text-dark-50 tracking-tight">Tenants</h1>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="text"
            placeholder="Pesquisar por nome ou slug..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 w-full sm:w-72 text-[13.5px] text-dark-50 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all whitespace-nowrap"
          >
            + Novo Tenant
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Total" value={loading ? '—' : total} />
        <KpiCard label="Em Trial" value={loading ? '—' : stats.trial} />
        <KpiCard label="Activos" value={loading ? '—' : stats.ativos} />
        <KpiCard label="Suspensos" value={loading ? '—' : stats.suspensos} accent={stats.suspensos > 0} />
      </div>
      <div className="mb-4">
        <PlanDistributionBar distribution={stats.distribution} />
      </div>
      {overLimit && (
        <div className="mb-4 text-[12.5px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-[3px] px-3 py-2">
          A mostrar {tenants.length} de {total} tenants — KPIs e tabela limitados a 100. Adicionar endpoint de stats para escala maior.
        </div>
      )}

      {showCreate && (
        <CreateTenantForm onClose={() => setShowCreate(false)} onCreated={refetch} />
      )}

      <ConsoleCard className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-dark-400 font-console-mono text-[13px]">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary-500 border-t-transparent mx-auto mb-4" />
            A carregar tenants...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-300 bg-red-500/10 m-4 rounded-[3px] border border-red-500/20 text-[13.5px]">
            {error}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="p-12 text-center text-dark-400 text-[13.5px]">Nenhum tenant encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 px-[18px] font-medium">Negócio</th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 font-medium">Plano</th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 font-medium">Estado</th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 px-[18px] font-medium text-right">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => navigate(`/admin/tenants/${t._id}`)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors last:border-b-0"
                  >
                    <td className="p-3.5 px-[18px]">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.nome} />
                        <div>
                          <div className="text-[14px] font-semibold text-dark-50">{t.nome}</div>
                          <div className="font-console-mono text-[12px] text-dark-400">{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5"><PlanBadge plano={t.plano.tipo} /></td>
                    <td className="p-3.5"><StatusPill status={t.plano.status} /></td>
                    <td className="p-3.5 px-[18px] text-right font-console-mono text-[12.5px] text-dark-400">
                      {new Date(t.createdAt).toLocaleDateString('pt-PT')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="p-3.5 px-[18px] border-t border-white/10 bg-white/5 flex justify-between items-center text-[12.5px] text-dark-400">
            <span>Página {safePage} de {pages} · {filtered.length} tenants</span>
            <div className="flex gap-2 font-console-mono">
              <button
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="px-3 py-1 bg-dark-900 border border-white/10 rounded-[2px] hover:border-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={safePage === pages}
                onClick={() => setPage(safePage + 1)}
                className="px-3 py-1 bg-dark-900 border border-white/10 rounded-[2px] hover:border-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 transition-colors"
              >
                Seguinte
              </button>
            </div>
          </div>
        )}
      </ConsoleCard>
    </div>
  );
}
```

- [ ] **Step 4: Run test + lint + grep**

Run: `npm run test:run -- TenantsListPage` → Expected: PASS (2 testes).
Run: `npm run lint` → Expected: sem erros novos.
Run: `grep -nE "#(211f1c|f4f1ec|fbf9f6|e8e2da|221f1d|9a938c|8f877d|bd5d33|a14d27|ddd5ca|8a827a|6f6862|9e2f22|faf8f4|faf6f1|e8cdba)" laura-saas-frontend/src/pages/admin/TenantsListPage.tsx || echo "OK: sem hex"` → Expected: `OK: sem hex`

- [ ] **Step 5: Commit**

```bash
git add laura-saas-frontend/src/pages/admin/TenantsListPage.tsx laura-saas-frontend/src/pages/admin/__tests__/TenantsListPage.test.tsx
git commit -m "feat(admin): overview strip + paginação client-side + re-skin da lista de tenants"
```

---

### Task 6: Re-skin `TenantDetailPage`

**Files:**
- Modify: `laura-saas-frontend/src/pages/admin/TenantDetailPage.tsx`

**Interfaces:**
- Consumes: `Avatar`/`ConsoleCard`/`PlanBadge`/`StatusPill`/`formatLimite`/`FEATURE_FLAG_LABELS` (APIs inalteradas — Task 3).

- [ ] **Step 1: Aplicar o mapa canónico + casos específicos**

Aplicar o **Mapa canónico hex→classe** a todos os `className` do ficheiro. Casos específicos:

- Todas as ocorrências de `text-[#a14d27]` (linhas ~120, 126, 132 — os números de uso) → `text-primary-400`.
- Títulos/labels `text-[#221f1d]` → `text-dark-50`; subtextos `text-[#9a938c]`/`text-[#8a827a]`/`text-[#6f6862]` → `text-dark-400`.
- Quaisquer `bg-white`/`bg-[#fbf9f6]` internos → `bg-white/5`; bordas → `border-white/10`.
- Mensagem de erro/estado (se usar `#9e2f22`/`#fbf1ea`/`#e8cdba`) → `text-red-300`/`bg-red-500/10`/`border-red-500/20`.

(Os componentes `ConsoleCard`/`StatusPill`/`PlanBadge`/`Avatar` já vêm re-skinados da Task 3 — não mexer neles aqui.)

- [ ] **Step 2: Verificar ausência de hex**

Run: `grep -nE "#(211f1c|f4f1ec|fbf9f6|e8e2da|221f1d|9a938c|8f877d|bd5d33|a14d27|ddd5ca|8a827a|a59d93|6f6862|9e2f22|34302b|fbf1ea|e8cdba|faf8f4|faf6f1|f1ece4)" laura-saas-frontend/src/pages/admin/TenantDetailPage.tsx || echo "OK: sem hex"`
Expected: `OK: sem hex`

- [ ] **Step 3: Lint + build**

Run: `cd laura-saas-frontend && npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add laura-saas-frontend/src/pages/admin/TenantDetailPage.tsx
git commit -m "style(admin): re-skin TenantDetailPage para o design system (dark)"
```

---

### Task 7: Re-skin `AuditLogPage`

**Files:**
- Modify: `laura-saas-frontend/src/pages/admin/AuditLogPage.tsx`

**Interfaces:**
- Consumes: `ConsoleCard`/`StatusPill` (inalterados — Task 3).

- [ ] **Step 1: Aplicar o mapa canónico**

Aplicar o **Mapa canónico hex→classe** a todos os `className` do ficheiro. Pontos a confirmar: inputs/filtros (`bg-white border-[#ddd5ca]` → `bg-dark-900 border-white/10`, focus `ring-primary-500/40`/`border-primary-500`), cabeçalhos de tabela (`text-[#9a938c]` → `text-dark-400`, `bg-[#faf8f4]` → `bg-white/5`), linhas (hover `bg-[#faf6f1]` → `bg-white/5`, bordas → `border-white/5`/`border-white/10`), spinner `border-[#bd5d33]` → `border-primary-500`, estados de erro → `text-red-300`/`bg-red-500/10`/`border-red-500/20`, botões de paginação como na Task 5.

- [ ] **Step 2: Verificar ausência de hex**

Run: `grep -nE "#(211f1c|f4f1ec|fbf9f6|e8e2da|221f1d|9a938c|8f877d|bd5d33|a14d27|ddd5ca|8a827a|a59d93|6f6862|9e2f22|34302b|fbf1ea|e8cdba|faf8f4|faf6f1|f1ece4)" laura-saas-frontend/src/pages/admin/AuditLogPage.tsx || echo "OK: sem hex"`
Expected: `OK: sem hex`

- [ ] **Step 3: Lint**

Run: `cd laura-saas-frontend && npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add laura-saas-frontend/src/pages/admin/AuditLogPage.tsx
git commit -m "style(admin): re-skin AuditLogPage para o design system (dark)"
```

---

### Task 8: Re-skin dos 3 forms

**Files:**
- Modify: `laura-saas-frontend/src/components/admin/CreateTenantForm.tsx`
- Modify: `laura-saas-frontend/src/components/admin/EditPlanLimitsForm.tsx`
- Modify: `laura-saas-frontend/src/components/admin/SuspendReactivateControls.tsx`

**Interfaces:**
- Sem mudança de comportamento/lógica — só visual. (`inputClass`/`labelClass` partilhados em `EditPlanLimitsForm` são re-skinados uma vez.)

- [ ] **Step 1: Aplicar o mapa canónico aos 3 ficheiros**

Para cada ficheiro, aplicar o **Mapa canónico hex→classe**. Padrões comuns:
- Overlay do modal `bg-[#161412]/60` (ou similar) → `bg-black/60`.
- Caixa do modal `bg-[#f4f1ec] border-[#34302b]` → `bg-dark-800 border-white/10`; header `bg-[#fbf9f6] border-[#e8e2da]` → `bg-white/5 border-white/10`.
- `inputClass`: `bg-white border-[#ddd5ca] ... text-[#221f1d] focus:ring-[#bd5d33]/30 focus:border-[#bd5d33]` → `bg-dark-900 border-white/10 ... text-dark-50 focus:ring-primary-500/40 focus:border-primary-500`.
- `labelClass`: `text-[#9a938c]` → `text-dark-400`.
- Botões primários `bg-[#221f1d] hover:bg-[#3f3a34] text-[#f4f1ec]` → `bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white`.
- Erros inline `text-[#9e2f22]` → `text-red-300`.
- `ConfirmDialog` (em `SuspendReactivateControls`): mesma lógica de modal acima; botão destrutivo de suspender pode usar `bg-red-500 hover:bg-red-600 text-white` (mantendo o significado de acção destrutiva).
- Títulos `text-[#221f1d]` → `text-dark-50`; texto de fecho `text-[#8a827a] hover:text-[#221f1d]` → `text-dark-400 hover:text-dark-50`.

- [ ] **Step 2: Verificar ausência de hex nos 3 ficheiros**

Run:
```bash
grep -nE "#(211f1c|f4f1ec|fbf9f6|e8e2da|221f1d|9a938c|8f877d|bd5d33|a14d27|ddd5ca|8a827a|a59d93|6f6862|9e2f22|34302b|161412|3f3a34|fbf1ea|e8cdba)" \
  laura-saas-frontend/src/components/admin/CreateTenantForm.tsx \
  laura-saas-frontend/src/components/admin/EditPlanLimitsForm.tsx \
  laura-saas-frontend/src/components/admin/SuspendReactivateControls.tsx || echo "OK: sem hex"
```
Expected: `OK: sem hex`

- [ ] **Step 3: Lint + testes (não regredir os forms existentes)**

Run: `cd laura-saas-frontend && npm run lint` → Expected: sem erros novos.
Run: `npm run test:run` → Expected: toda a suite passa (os testes de UX/regras dos forms continuam verdes).

- [ ] **Step 4: Commit**

```bash
git add laura-saas-frontend/src/components/admin/CreateTenantForm.tsx laura-saas-frontend/src/components/admin/EditPlanLimitsForm.tsx laura-saas-frontend/src/components/admin/SuspendReactivateControls.tsx
git commit -m "style(admin): re-skin dos forms admin para o design system (dark)"
```

---

### Task 9: Guard test (sem cream/rust) + build final

**Files:**
- Create: `laura-saas-frontend/src/components/admin/__tests__/no-cream-rust.test.ts`

**Interfaces:**
- Lê os ficheiros `.tsx`/`.ts` (não-teste) em `src/components/admin` e `src/pages/admin` e falha se algum contiver hex da paleta cream/rust.

- [ ] **Step 1: Write the guard test**

Create `laura-saas-frontend/src/components/admin/__tests__/no-cream-rust.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['src/components/admin', 'src/pages/admin'];
const FORBIDDEN = /#(211f1c|f4f1ec|fbf9f6|faf8f4|faf6f1|e8e2da|34302b|f1ece4|ddd5ca|221f1d|3f3a34|9a938c|8f877d|8a827a|a59d93|6f6862|c8c0b6|bd5d33|a14d27|9e2f22|e8cdba|fbf1ea|f0ddcf|f4ebd7|8a610f|b5862f|e7eee4|3f6b3c|f4e0db|efece7|2a2723|161412)/i;

describe('consola admin — sem paleta cream/rust', () => {
  for (const dir of DIRS) {
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) && !e.name.includes('.test.'));
    for (const f of files) {
      it(`${dir}/${f.name} não contém hex cream/rust`, () => {
        const src = readFileSync(join(dir, f.name), 'utf8');
        const offending = src.split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => FORBIDDEN.test(line))
          .map(({ n, line }) => `${n}: ${line.trim()}`);
        expect(offending).toEqual([]);
      });
    }
  }
});
```

- [ ] **Step 2: Run the guard test**

Run: `npm run test:run -- no-cream-rust`
Expected: PASS (um teste por ficheiro admin; todos verdes). Se algum falhar, corrigir o hex remanescente nesse ficheiro e voltar a correr.

- [ ] **Step 3: Suite completa + lint + build**

Run: `npm run test:run` → Expected: toda a suite passa.
Run: `npm run lint` → Expected: 0 erros.
Run: `npm run build` → Expected: TypeScript + Vite build sem erros.

- [ ] **Step 4: Commit**

```bash
git add laura-saas-frontend/src/components/admin/__tests__/no-cream-rust.test.ts
git commit -m "test(admin): guard contra regressão da paleta cream/rust"
```

- [ ] **Step 5: Verificação visual (manual)**

No browser (`npm run dev`, login como superadmin), confirmar tema escuro legível em: lista de tenants (strip de KPIs + distribuição + tabela), detalhe, audit logs, e os 3 modais (criar, editar plano/limites, suspender/reactivar). Confirmar contraste e que os pills/badges/avatars aparecem nas cores indigo/purple/slate/âmbar/esmeralda/vermelho.

---

## Self-Review (preenchido)

**Spec coverage:**
- Re-skin 8 ficheiros → Tasks 3,4,5,6,7,8. ✓
- Tokens do design system (sem paleta nova) → mapa canónico + Task 3. ✓
- Strip de KPIs (Total/Trial/Activos/Suspensos) + distribuição → Tasks 1,3,5. ✓
- Fonte única sem fetch duplicado → Task 2. ✓
- Cap coerente total-vs-página + aviso honesto → Task 5 (`overLimit`). ✓
- Superfícies sólidas + glass só nos KPIs → Task 3 (`KpiCard`/`PlanDistributionBar` glass; `ConsoleCard` sólido). ✓
- Zero backend → nenhum ficheiro em `src/` (raiz) nas Tasks. ✓
- Deferido (MRR/financeiro) → não há tarefa que o implemente (correcto). ✓
- Guard contra regressão de cor → Task 9. ✓

**Placeholder scan:** sem TBD/“handle appropriately”; mapa canónico dá old→new exactos; código completo nos componentes/hook/testes novos. Ficheiros mecânicos usam o mapa determinístico + verificação por grep. ✓

**Type consistency:** `TenantStats` (Task 1) consumido por `PlanDistributionBar` (Task 3) e `computeTenantStats` (Task 5). `useAdminTenants()` devolve `{tenants,total,loading,error,refetch}` (Task 2) e é consumido exactamente assim na Task 5. `KpiCard`/`PlanDistributionBar` props batem certo entre Task 3 e Task 5. ✓
