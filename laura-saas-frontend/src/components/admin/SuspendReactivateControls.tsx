import { useState } from 'react';
import { toast } from 'react-toastify';
import { useAdminTenantMutations } from '../../hooks/useAdminTenantMutations';
import { TenantDetail } from '../../types/admin';

interface SuspendReactivateControlsProps {
  tenant: TenantDetail;
  onChanged: () => void;
}

function ConfirmDialog({
  title,
  confirmLabel,
  danger,
  motivoField,
  onConfirm,
  onCancel,
  submitting,
}: {
  title: string;
  confirmLabel: string;
  danger?: boolean;
  motivoField?: boolean;
  onConfirm: (motivo?: string) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md bg-dark-800 border border-white/10 rounded-[5px] shadow-2xl p-6">
        <h2 className="text-[16px] font-semibold text-dark-50 tracking-tight mb-3">{title}</h2>

        {motivoField && (
          <div className="mb-4">
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Motivo (opcional)
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 text-[13.5px] text-dark-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
            />
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2.5 rounded-[2px] text-[13px] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo.trim() || undefined)}
            disabled={submitting}
            className={`flex-1 px-4 py-2.5 rounded-[2px] text-[13px] font-medium transition-colors disabled:opacity-50 ${
              danger ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white'
            }`}
          >
            {submitting ? 'A processar...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuspendReactivateControls({ tenant, onChanged }: SuspendReactivateControlsProps) {
  const { suspendTenant, reactivateTenant, submitting } = useAdminTenantMutations();
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);

  const isSuspended = tenant.plano.status === 'suspenso';

  const handleSuspend = async (motivo?: string) => {
    try {
      await suspendTenant(tenant._id, motivo);
      toast.success(`${tenant.nome} suspenso.`);
      setDialog(null);
      onChanged();
    } catch {
      // O interceptor de api.js já mostra o toast de erro; mantém o diálogo aberto para retry.
    }
  };

  const handleReactivate = async () => {
    try {
      await reactivateTenant(tenant._id);
      toast.success(`${tenant.nome} reactivado.`);
      setDialog(null);
      onChanged();
    } catch {
      // O interceptor de api.js já mostra o toast de erro; mantém o diálogo aberto para retry.
    }
  };

  return (
    <>
      {isSuspended ? (
        <button
          onClick={() => setDialog('reactivate')}
          className="bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 px-4 py-2 rounded-[2px] text-[13px] font-medium transition-colors"
        >
          Reactivar
        </button>
      ) : (
        <button
          onClick={() => setDialog('suspend')}
          className="bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-300 px-4 py-2 rounded-[2px] text-[13px] font-medium transition-colors"
        >
          Suspender
        </button>
      )}

      {dialog === 'suspend' && (
        <ConfirmDialog
          title={`Suspender ${tenant.nome}?`}
          confirmLabel="Confirmar suspensão"
          danger
          motivoField
          submitting={submitting}
          onCancel={() => setDialog(null)}
          onConfirm={handleSuspend}
        />
      )}

      {dialog === 'reactivate' && (
        <ConfirmDialog
          title={`Reactivar ${tenant.nome}?`}
          confirmLabel="Confirmar reactivação"
          submitting={submitting}
          onCancel={() => setDialog(null)}
          onConfirm={handleReactivate}
        />
      )}
    </>
  );
}
