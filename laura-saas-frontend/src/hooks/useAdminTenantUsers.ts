import { useState, useEffect, useCallback } from 'react';
import { apiHelpers } from '../services/api';
import { PaginatedResponse, AdminTenantUser } from '../types/admin';

/**
 * F19 — Tenant Users Listing.
 *
 * Ficheiro NOVO deliberadamente (não acrescentado a useAdminTenants.ts): o F18
 * reescreveu esse hook em paralelo, e empilhar aqui geraria um conflito
 * rewrite-vs-add. Segue o padrão de useAdminAudit.ts (fetch parametrizado por
 * page/limit, sem refetch — quem quiser recarregar muda page/limit).
 */
export function useAdminTenantUsers(tenantId: string | undefined, page = 1, limit = 20) {
  const [data, setData] = useState<PaginatedResponse<AdminTenantUser> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiHelpers.get(`/admin/tenants/${tenantId}/users?page=${page}&limit=${limit}`);
      setData(response as PaginatedResponse<AdminTenantUser>);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar utilizadores';
      setError(msg); // toast tratado pelo interceptor central de api.js
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users: data?.data || [],
    pagination: data?.pagination,
    loading,
    error,
    refetch: fetchUsers,
  };
}
