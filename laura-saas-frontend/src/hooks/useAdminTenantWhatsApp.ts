import { useState, useEffect, useCallback } from 'react';
import { apiHelpers } from '../services/api';
import {
  TenantWhatsApp,
  TenantWhatsAppQR,
  CreateWhatsAppInstanceResult,
} from '../types/admin';

/**
 * F21 — estado da integração WhatsApp/Evolution de um tenant (consola super-admin).
 *
 * O QR NÃO é guardado no estado do hook para lá do necessário a mostrá-lo: é uma
 * credencial de sessão e expira em ~30s. Quem o mostra é responsável por o
 * descartar (`clearQr`) ao fechar.
 *
 * Erros: o interceptor de `api.js` já mostra o toast genérico — aqui só se
 * guarda a mensagem para o card decidir o que renderizar inline.
 */
export function useAdminTenantWhatsApp(tenantId: string | undefined) {
  const [data, setData] = useState<TenantWhatsApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qr, setQr] = useState<TenantWhatsAppQR | null>(null);

  const fetchWhatsApp = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiHelpers.get(`/admin/tenants/${tenantId}/whatsapp`);
      setData(res.data as TenantWhatsApp);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Erro ao carregar a integração WhatsApp');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchWhatsApp();
  }, [fetchWhatsApp]);

  const createInstance = useCallback(
    async (instanceName?: string): Promise<CreateWhatsAppInstanceResult> => {
      setSubmitting(true);
      try {
        const res = await apiHelpers.post(
          `/admin/tenants/${tenantId}/whatsapp/instancia`,
          instanceName ? { instanceName } : {},
        );
        await fetchWhatsApp();
        return res.data as CreateWhatsAppInstanceResult;
      } finally {
        setSubmitting(false);
      }
    },
    [tenantId, fetchWhatsApp],
  );

  /** Vai buscar um QR novo. Falha propaga — o card mostra o aviso inline. */
  const fetchQr = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    try {
      const res = await apiHelpers.get(`/admin/tenants/${tenantId}/whatsapp/qr`);
      setQr(res.data as TenantWhatsAppQR);
    } finally {
      setSubmitting(false);
    }
  }, [tenantId]);

  const clearQr = useCallback(() => setQr(null), []);

  const logout = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    try {
      await apiHelpers.post(`/admin/tenants/${tenantId}/whatsapp/logout`, {});
      setQr(null);
      await fetchWhatsApp();
    } finally {
      setSubmitting(false);
    }
  }, [tenantId, fetchWhatsApp]);

  return {
    data,
    loading,
    error,
    submitting,
    qr,
    refetch: fetchWhatsApp,
    createInstance,
    fetchQr,
    clearQr,
    logout,
  };
}
