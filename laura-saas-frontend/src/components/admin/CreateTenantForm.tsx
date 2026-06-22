import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'react-toastify';
import { criarTenantSchema, CriarTenantFormValues, PLANO_TIPOS } from '../../schemas/admin';
import { useAdminTenantMutations, extractApiError } from '../../hooks/useAdminTenantMutations';

interface CreateTenantFormProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTenantForm({ onClose, onCreated }: CreateTenantFormProps) {
  const { createTenant, submitting } = useAdminTenantMutations();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CriarTenantFormValues>({
    resolver: zodResolver(criarTenantSchema),
    defaultValues: { nomeEmpresa: '', slug: '', planoTipo: undefined, adminNome: '', adminEmail: '' },
  });

  const onSubmit = async (values: CriarTenantFormValues) => {
    try {
      await createTenant({
        nomeEmpresa: values.nomeEmpresa,
        slug: values.slug ? values.slug : undefined,
        planoTipo: values.planoTipo,
        adminNome: values.adminNome,
        adminEmail: values.adminEmail,
      });
      toast.success(`Tenant "${values.nomeEmpresa}" criado com sucesso.`);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number } };
      const message = extractApiError(err, 'Erro ao criar tenant.');
      if (axErr?.response?.status === 409) {
        setError('adminEmail', { message });
      } else {
        setError('nomeEmpresa', { message });
      }
    }
  };

  const inputClass =
    'w-full bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 text-[13.5px] text-dark-50 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';
  const labelClass = 'block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-lg bg-dark-800 border border-white/10 rounded-[5px] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/10 rounded-t-[5px]">
          <h2 className="text-[16px] font-semibold text-dark-50 tracking-tight">Novo Tenant</h2>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-dark-50 text-lg leading-none"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Nome da empresa *</label>
            <input autoFocus className={inputClass} {...register('nomeEmpresa')} />
            {errors.nomeEmpresa && <p className="text-red-300 text-[12px] mt-1">{errors.nomeEmpresa.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Slug (opcional — gerado automaticamente se vazio)</label>
            <input className={inputClass} placeholder="minha-clinica" {...register('slug')} />
            {errors.slug && <p className="text-red-300 text-[12px] mt-1">{errors.slug.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Plano (opcional — básico por defeito)</label>
            <select className={inputClass} {...register('planoTipo')}>
              <option value="">— Básico (defeito) —</option>
              {PLANO_TIPOS.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-white/10 pt-4">
            <label className={labelClass}>Nome do administrador *</label>
            <input className={inputClass} {...register('adminNome')} />
            {errors.adminNome && <p className="text-red-300 text-[12px] mt-1">{errors.adminNome.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Email do administrador *</label>
            <input type="email" className={inputClass} {...register('adminEmail')} />
            {errors.adminEmail && <p className="text-red-300 text-[12px] mt-1">{errors.adminEmail.message}</p>}
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2.5 rounded-[2px] text-[13px] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2.5 rounded-[2px] text-[13px] font-medium transition-all disabled:opacity-50"
            >
              {submitting ? 'A criar...' : 'Criar tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
