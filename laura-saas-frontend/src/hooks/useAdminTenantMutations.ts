import { useState } from 'react';
import { apiHelpers } from '../services/api';
import {
  CreateTenantInput,
  CreateTenantResult,
  UpdatePlanoInput,
  UpdateLimitesInput,
  TenantDetail,
  TenantLimites,
} from '../types/admin';

// Nota: o interceptor de erro em services/api.js já mostra um toast.error
// genérico em qualquer falha — estas funções não voltam a mostrar toast de
// erro, só propagam o erro para o form decidir a mensagem inline (campo a
// campo). Sucesso não tem toast automático (a resposta não tem `.message`),
// por isso cada chamador mostra o seu próprio toast.success.
export function useAdminTenantMutations() {
  const [submitting, setSubmitting] = useState(false);

  const createTenant = async (input: CreateTenantInput): Promise<CreateTenantResult> => {
    setSubmitting(true);
    try {
      const res = await apiHelpers.post('/v1/admin/tenants', input);
      return res.data as CreateTenantResult;
    } finally {
      setSubmitting(false);
    }
  };

  const updatePlano = async (tenantId: string, input: UpdatePlanoInput): Promise<TenantDetail['plano']> => {
    setSubmitting(true);
    try {
      const res = await apiHelpers.put(`/v1/admin/tenants/${tenantId}/plano`, input);
      return res.data.plano as TenantDetail['plano'];
    } finally {
      setSubmitting(false);
    }
  };

  const updateLimites = async (tenantId: string, input: UpdateLimitesInput): Promise<TenantLimites> => {
    setSubmitting(true);
    try {
      const res = await apiHelpers.put(`/v1/admin/tenants/${tenantId}/limites`, input);
      return res.data.limites as TenantLimites;
    } finally {
      setSubmitting(false);
    }
  };

  const suspendTenant = async (tenantId: string, motivo?: string): Promise<void> => {
    setSubmitting(true);
    try {
      await apiHelpers.post(`/v1/admin/tenants/${tenantId}/suspender`, motivo ? { motivo } : {});
    } finally {
      setSubmitting(false);
    }
  };

  const reactivateTenant = async (tenantId: string): Promise<void> => {
    setSubmitting(true);
    try {
      await apiHelpers.post(`/v1/admin/tenants/${tenantId}/reactivar`, {});
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, createTenant, updatePlano, updateLimites, suspendTenant, reactivateTenant };
}

// Extrai a mensagem de erro do backend (contrato { success: false, error }),
// sem voltar a mostrar toast — o interceptor de api.js já o fez.
export function extractApiError(err: unknown, fallback: string): string {
  const axErr = err as { response?: { data?: { error?: string } } };
  return axErr?.response?.data?.error || fallback;
}
