import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';
import {
  atualizarPlanoSchema,
  AtualizarPlanoFormValues,
  atualizarLimitesSchema,
  AtualizarLimitesFormValues,
  PLANO_TIPOS,
} from '../../schemas/admin';
import { useAdminTenantMutations, extractApiError } from '../../hooks/useAdminTenantMutations';
import { FEATURE_FLAG_LABELS } from './ConsoleUI';
import { TenantDetail } from '../../types/admin';

interface EditPlanLimitsFormProps {
  tenant: TenantDetail;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  'w-full bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 text-[13.5px] text-dark-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';
const labelClass = 'block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5';

function PlanoSection({ tenant, onSaved }: { tenant: TenantDetail; onSaved: () => void }) {
  const { updatePlano, submitting } = useAdminTenantMutations();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AtualizarPlanoFormValues>({
    resolver: zodResolver(atualizarPlanoSchema),
    defaultValues: {
      tipo: tenant.plano.tipo,
      dataExpiracao: tenant.plano.dataExpiracao ? tenant.plano.dataExpiracao.slice(0, 10) : '',
    },
  });

  const onSubmit = async (values: AtualizarPlanoFormValues) => {
    try {
      await updatePlano(tenant._id, {
        tipo: values.tipo,
        dataExpiracao: values.dataExpiracao ? new Date(values.dataExpiracao).toISOString() : undefined,
      });
      toast.success('Plano actualizado.');
      onSaved();
    } catch (err: unknown) {
      setError('tipo', { message: extractApiError(err, 'Erro ao actualizar plano.') });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
      <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400">Plano</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Tipo</label>
          <select className={inputClass} {...register('tipo')}>
            {PLANO_TIPOS.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Data de expiração (opcional)</label>
          <input type="date" className={inputClass} {...register('dataExpiracao')} />
        </div>
      </div>
      {errors.tipo && <p className="text-red-300 text-[12px]">{errors.tipo.message}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all disabled:opacity-50"
      >
        {submitting ? 'A guardar...' : 'Guardar plano'}
      </button>
    </form>
  );
}

function LimitesSection({ tenant, onSaved }: { tenant: TenantDetail; onSaved: () => void }) {
  const { updateLimites, submitting } = useAdminTenantMutations();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AtualizarLimitesFormValues>({
    resolver: zodResolver(atualizarLimitesSchema),
    defaultValues: { ...tenant.limites },
  });

  const onSubmit = async (values: AtualizarLimitesFormValues) => {
    try {
      await updateLimites(tenant._id, values);
      toast.success('Limites e feature flags actualizados.');
      onSaved();
    } catch (err: unknown) {
      setError('maxUsuarios', { message: extractApiError(err, 'Erro ao actualizar limites.') });
    }
  };

  const numericFields: { key: keyof AtualizarLimitesFormValues; label: string }[] = [
    { key: 'maxUsuarios', label: 'Máx. Utilizadores' },
    { key: 'maxClientes', label: 'Máx. Clientes' },
    { key: 'maxAgendamentosMes', label: 'Máx. Agendamentos/mês' },
    { key: 'maxLeads', label: 'Máx. Leads' },
  ];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
      <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400">
        Limites e Feature Flags
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {numericFields.map((f) => (
          <div key={f.key}>
            <label className={labelClass}>{f.label}</label>
            <input
              type="number"
              step={1}
              className={`${inputClass} font-console-mono`}
              {...register(f.key, { valueAsNumber: true })}
            />
          </div>
        ))}
      </div>
      <p className="text-dark-400 text-[12px]">-1 = ilimitado</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {Object.entries(FEATURE_FLAG_LABELS).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-[3px] px-3 py-2.5 text-[13px] text-dark-200 cursor-pointer"
          >
            <input type="checkbox" {...register(key as keyof AtualizarLimitesFormValues)} />
            {label}
          </label>
        ))}
      </div>

      {errors.maxUsuarios && <p className="text-red-300 text-[12px]">{errors.maxUsuarios.message}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all disabled:opacity-50"
      >
        {submitting ? 'A guardar...' : 'Guardar limites'}
      </button>
    </form>
  );
}

export function EditPlanLimitsForm({ tenant, onClose, onSaved }: EditPlanLimitsFormProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-dark-800 border border-white/10 rounded-[5px] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/10 rounded-t-[5px] sticky top-0">
          <h2 className="text-[16px] font-semibold text-dark-50 tracking-tight">Editar {tenant.nome}</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-50 text-lg leading-none" aria-label="Fechar">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          <PlanoSection tenant={tenant} onSaved={onSaved} />
          <div className="border-t border-white/10" />
          <LimitesSection tenant={tenant} onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
