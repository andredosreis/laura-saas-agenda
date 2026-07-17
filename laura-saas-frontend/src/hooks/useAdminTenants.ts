import { useState, useEffect, useCallback, useRef } from 'react';
import { apiHelpers } from '../services/api';
import {
  PaginatedResponse, PaginationInfo, TenantSummary, TenantDetail, TenantUsage, TenantStats, PlanoTipo, PlanoStatus,
} from '../types/admin';

export interface TenantFilters {
  search?: string;
  plano?: PlanoTipo;
  status?: PlanoStatus;
}

const EMPTY_FILTERS: TenantFilters = {};

/**
 * F18 — server-driven: pesquisa, filtros e paginação são resolvidos por
 * `GET /admin/tenants` (page/limit/search/plano/status), não em memória.
 * Quem chama controla `page`/`filters` (ver `TenantsListPage` — debounce da
 * pesquisa + reset de página aí, não aqui, tal como `useAdminAudit`).
 */
export function useAdminTenants(page = 1, limit = 20, filters: TenantFilters = EMPTY_FILTERS) {
  const [data, setData] = useState<PaginatedResponse<TenantSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guarda de sequência contra respostas fora de ordem: cada mudança de
  // página/filtro dispara um fetch, mas se a pesquisa A resolver DEPOIS da B
  // (rede mais lenta), o `setData(A)` sobreporia os resultados de B — o
  // operador veria a lista errada. Capturamos o id no início e só aplicamos
  // o resultado se ainda for o pedido mais recente. Um AbortController também
  // servia, mas exigia threading pelo apiHelpers/axios; a guarda é mais simples
  // e igualmente correcta.
  const reqId = useRef(0);

  const fetchTenants = useCallback(async () => {
    const myId = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filters.search) query.append('search', filters.search);
      if (filters.plano) query.append('plano', filters.plano);
      if (filters.status) query.append('status', filters.status);

      const response = await apiHelpers.get(`/admin/tenants?${query.toString()}`);
      if (myId !== reqId.current) return; // resposta obsoleta — ignora
      setData(response as PaginatedResponse<TenantSummary>);
    } catch (err: any) {
      if (myId !== reqId.current) return; // erro de pedido obsoleto — ignora
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar tenants';
      setError(msg); // toast tratado pelo interceptor central de api.js
    } finally {
      if (myId === reqId.current) setLoading(false);
    }
  }, [page, limit, filters.search, filters.plano, filters.status]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  return {
    tenants: data?.data || [],
    pagination: data?.pagination as PaginationInfo | undefined,
    loading,
    error,
    // Ao contrário de `useAdminAudit`, expomos `refetch`: precisamos de
    // recarregar a lista depois de `CreateTenantForm` criar um tenant, sem
    // forçar quem chama a mexer em page/filters para provocar o efeito.
    refetch: fetchTenants,
  };
}

/** F18 — GET /admin/tenants/stats: totais globais para KPIs + distribuição por plano. */
export function useAdminTenantStats() {
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiHelpers.get('/admin/tenants/stats');
      setStats((response as { data: TenantStats }).data);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar estatísticas de tenants';
      setError(msg); // toast tratado pelo interceptor central de api.js
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

export function useAdminTenantDetail(tenantId: string | undefined) {
  const [detail, setDetail] = useState<{ tenant: TenantDetail; totalUsuarios: number } | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailRes, usageRes] = await Promise.all([
        apiHelpers.get(`/admin/tenants/${tenantId}`),
        apiHelpers.get(`/admin/tenants/${tenantId}/uso`).catch(() => ({ data: { clientes: 0, agendamentos: 0, mensagens: 0 } }))
      ]);
      setDetail(detailRes.data);
      setUsage(usageRes.data);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar detalhes do tenant';
      setError(msg); // toast tratado pelo interceptor central de api.js
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { detail, usage, loading, error, refetch: fetchDetail };
}
