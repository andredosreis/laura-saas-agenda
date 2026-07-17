import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminTenantDetail } from '../../hooks/useAdminTenants';
import { Avatar, ConsoleCard, PlanBadge, StatusPill, formatLimite, FEATURE_FLAG_LABELS } from '../../components/admin/ConsoleUI';
import { CopyIdButton } from '../../components/admin/CopyIdButton';
import { EditPlanLimitsForm } from '../../components/admin/EditPlanLimitsForm';
import { SuspendReactivateControls } from '../../components/admin/SuspendReactivateControls';
import { WhatsAppCard } from '../../components/admin/WhatsAppCard';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { detail, usage, loading, error, refetch } = useAdminTenantDetail(id);
  const [showEdit, setShowEdit] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <ConsoleCard className="max-w-xl mx-auto mt-6 p-8 text-center">
        <h2 className="text-[17px] font-semibold text-red-300 mb-2">Erro</h2>
        <p className="text-dark-400 text-[13.5px] mb-6">{error || 'Tenant não encontrado.'}</p>
        <button
          onClick={() => navigate('/admin/tenants')}
          className="bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2 rounded-[2px] text-[13px] transition-colors"
        >
          ← Voltar à lista
        </button>
      </ConsoleCard>
    );
  }

  const t = detail.tenant;

  return (
    <div>
      <button
        onClick={() => navigate('/admin/tenants')}
        className="font-console-mono text-[11px] uppercase tracking-[.1em] text-primary-400 hover:text-primary-300 mb-5 inline-flex items-center gap-2 transition-colors"
      >
        ← Voltar a Tenants
      </button>

      <ConsoleCard className="p-6 sm:p-7">
        <div className="flex justify-between items-start gap-4 mb-6 pb-5 border-b border-white/10 flex-wrap">
          <div className="flex items-center gap-3.5">
            <Avatar name={t.nome} size={48} />
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[21px] font-semibold text-dark-50 tracking-tight">{t.nome}</h1>
                <StatusPill status={t.plano.status} />
              </div>
              <p className="font-console-mono text-[12.5px] text-dark-400 mt-1">{t.slug}</p>
              <div className="mt-0.5 flex items-center gap-1 font-console-mono text-[11.5px] text-dark-500">
                <span>{t._id}</span>
                <CopyIdButton id={t._id} label={`Copiar ID do tenant ${t.nome}`} />
              </div>
              <p className="text-dark-400 text-[12.5px] mt-0.5">
                Criado em {new Date(t.createdAt).toLocaleDateString('pt-PT')}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="bg-white/5 rounded-[3px] p-3.5 border border-white/10 text-right">
              <div className="font-console-mono text-[10px] uppercase text-dark-400 tracking-[.1em] mb-1">
                Total de Utilizadores
              </div>
              <div className="font-console-mono text-[25px] font-semibold text-dark-50">{detail.totalUsuarios}</div>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowEdit(true)}
                className="bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2 rounded-[2px] text-[13px] font-medium transition-colors"
              >
                Editar
              </button>
              <SuspendReactivateControls tenant={t} onChanged={refetch} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConsoleCard className="p-5">
            <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400 mb-3.5">
              Plano e Faturação
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-dark-400 text-[13px]">Tipo de plano</span>
                <PlanBadge plano={t.plano.tipo} />
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-dark-400 text-[13px]">Preço</span>
                <span className="font-console-mono text-[13px] text-dark-50">
                  {t.plano.preco} {t.plano.moeda} / {t.plano.ciclo}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400 text-[13px]">Trial</span>
                <span className="font-console-mono text-[13px] text-dark-50">
                  {t.plano.status !== 'trial'
                    ? '—'
                    : t.isTrialExpired
                      ? <span className="text-red-300">expirado</span>
                      : `${t.diasRestantesTrial} dias restantes`}
                </span>
              </div>
            </div>
          </ConsoleCard>

          <ConsoleCard className="p-5">
            <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400 mb-3.5">
              Limites e Uso
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-dark-400 text-[13px]">Clientes</span>
                <span className="font-console-mono text-[13px] font-semibold text-dark-50">
                  <span className="text-primary-400">{usage?.clientes ?? 0}</span> / {formatLimite(t.limites.maxClientes)}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-dark-400 text-[13px]">Agendamentos (mês)</span>
                <span className="font-console-mono text-[13px] font-semibold text-dark-50">
                  <span className="text-primary-400">{usage?.agendamentos ?? 0}</span> / {formatLimite(t.limites.maxAgendamentosMes)}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-dark-400 text-[13px]">Utilizadores</span>
                <span className="font-console-mono text-[13px] font-semibold text-dark-50">
                  <span className="text-primary-400">{detail.totalUsuarios}</span> / {formatLimite(t.limites.maxUsuarios)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400 text-[13px]">Mensagens (total)</span>
                <span className="font-console-mono text-[13px] font-semibold text-primary-400">{usage?.mensagens ?? 0}</span>
              </div>
            </div>
          </ConsoleCard>

          {/* F21 — gestão da instância WhatsApp/Evolution deste tenant */}
          <WhatsAppCard tenantId={t._id} tenantNome={t.nome} />

          <ConsoleCard className="p-5 md:col-span-2">
            <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-dark-400 mb-3.5">
              Feature Flags
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(FEATURE_FLAG_LABELS).map(([key, label]) => {
                const on = Boolean(t.limites[key as keyof typeof t.limites]);
                return (
                  <div key={key} className="bg-white/5 border border-white/10 rounded-[3px] p-3 text-center">
                    <div className="font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
                      {label}
                      {key === 'leadsAtivo' && ` · ${formatLimite(t.limites.maxLeads)}`}
                    </div>
                    <div className={`font-semibold text-[13px] ${on ? 'text-emerald-300' : 'text-dark-400'}`}>
                      {on ? 'Activo' : 'Inactivo'}
                    </div>
                  </div>
                );
              })}
            </div>
          </ConsoleCard>
        </div>
      </ConsoleCard>

      {showEdit && (
        <EditPlanLimitsForm tenant={t} onClose={() => setShowEdit(false)} onSaved={refetch} />
      )}
    </div>
  );
}
