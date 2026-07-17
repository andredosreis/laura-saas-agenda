import { useState, useEffect, useCallback } from 'react';
import { apiHelpers } from '../services/api';
import { PaginatedResponse, AuditLogEntry } from '../types/admin';

export interface AuditFilters {
  targetTenantId?: string;
  actorUserId?: string;
  action?: string;
  status?: 'ok' | 'denied' | 'error';
  from?: string;
  to?: string;
}

const EMPTY_FILTERS: AuditFilters = {};

export function useAdminAudit(initialPage = 1, initialLimit = 20, initialFilters: AuditFilters = EMPTY_FILTERS) {
  const [data, setData] = useState<PaginatedResponse<AuditLogEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async (page: number, limit: number, filters: AuditFilters) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString()
      });
      if (filters.targetTenantId) query.append('targetTenantId', filters.targetTenantId);
      if (filters.actorUserId) query.append('actorUserId', filters.actorUserId);
      if (filters.action) query.append('action', filters.action);
      if (filters.status) query.append('status', filters.status);
      if (filters.from) query.append('from', filters.from);
      if (filters.to) query.append('to', filters.to);

      const response = await apiHelpers.get(`/admin/audit?${query.toString()}`);
      setData(response as PaginatedResponse<AuditLogEntry>);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar logs de auditoria';
      setError(msg); // toast tratado pelo interceptor central de api.js
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit(initialPage, initialLimit, initialFilters);
  }, [fetchAudit, initialPage, initialLimit, initialFilters]);

  // Sem `refetch`: o fetch é conduzido pelo efeito acima. Quem precisar de
  // recarregar muda page/limit/filters — expor um refetch recriado a cada render
  // era o convite ao loop de deps que este hook acabou de deixar de ter.
  return {
    data: data?.data || [],
    pagination: data?.pagination,
    loading,
    error,
  };
}
