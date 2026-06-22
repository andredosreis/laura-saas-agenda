import { useState, useEffect, useCallback } from 'react';
import { apiHelpers } from '../services/api';
import { PaginatedResponse, TenantSummary, TenantDetail, TenantUsage } from '../types/admin';
import { toast } from 'react-toastify';

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
        apiHelpers.get(`/v1/admin/tenants/${tenantId}`),
        apiHelpers.get(`/v1/admin/tenants/${tenantId}/uso`).catch(() => ({ data: { clientes: 0, agendamentos: 0, mensagens: 0 } }))
      ]);
      setDetail(detailRes.data);
      setUsage(usageRes.data);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar detalhes do tenant';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return { detail, usage, loading, error, refetch: fetchDetail };
}
