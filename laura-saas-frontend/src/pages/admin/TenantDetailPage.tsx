import { useParams, useNavigate } from 'react-router-dom';
import { useAdminTenantDetail } from '../../hooks/useAdminTenants';
import { Avatar, ConsoleCard, PlanBadge, StatusPill, formatLimite } from '../../components/admin/ConsoleUI';

const FEATURE_FLAG_LABELS: Record<string, string> = {
  leadsAtivo: 'Leads CRM',
  iaAtiva: 'IA Atendimento',
  whatsappAutomacao: 'WhatsApp Automação',
  lembretesWhatsapp: 'Lembretes WhatsApp',
  analytics: 'Analytics',
  relatorios: 'Relatórios',
  exportPdf: 'Export PDF',
  brandingPersonalizado: 'Branding',
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { detail, usage, loading, error } = useAdminTenantDetail(id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-[#bd5d33] border-t-transparent" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <ConsoleCard className="max-w-xl mx-auto mt-6 p-8 text-center">
        <h2 className="text-[17px] font-semibold text-[#9e2f22] mb-2">Erro</h2>
        <p className="text-[#8a827a] text-[13.5px] mb-6">{error || 'Tenant não encontrado.'}</p>
        <button
          onClick={() => navigate('/admin/tenants')}
          className="bg-white border border-[#ddd5ca] hover:border-[#bd5d33] text-[#3f3a34] px-4 py-2 rounded-[2px] text-[13px] transition-colors"
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
        className="font-console-mono text-[11px] uppercase tracking-[.1em] text-[#a14d27] hover:text-[#8a3c1d] mb-5 inline-flex items-center gap-2 transition-colors"
      >
        ← Voltar a Tenants
      </button>

      <ConsoleCard className="p-6 sm:p-7">
        <div className="flex justify-between items-start gap-4 mb-6 pb-5 border-b border-[#efeae3] flex-wrap">
          <div className="flex items-center gap-3.5">
            <Avatar name={t.nome} size={48} />
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[21px] font-semibold text-[#221f1d] tracking-tight">{t.nome}</h1>
                <StatusPill status={t.plano.status} />
              </div>
              <p className="font-console-mono text-[12.5px] text-[#8a827a] mt-1">{t.slug}</p>
              <p className="text-[#a59d93] text-[12.5px] mt-0.5">
                Criado em {new Date(t.createdAt).toLocaleDateString('pt-PT')}
              </p>
            </div>
          </div>

          <div className="bg-[#fbf9f6] rounded-[3px] p-3.5 border border-[#e8e2da] text-right">
            <div className="font-console-mono text-[10px] uppercase text-[#9a938c] tracking-[.1em] mb-1">
              Total de Utilizadores
            </div>
            <div className="font-console-mono text-[25px] font-semibold text-[#221f1d]">{detail.totalUsuarios}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConsoleCard className="p-5">
            <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-[#8a827a] mb-3.5">
              Plano e Faturação
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between border-b border-[#f1ece4] pb-2">
                <span className="text-[#8a827a] text-[13px]">Tipo de plano</span>
                <PlanBadge plano={t.plano.tipo} />
              </div>
              <div className="flex justify-between border-b border-[#f1ece4] pb-2">
                <span className="text-[#8a827a] text-[13px]">Preço</span>
                <span className="font-console-mono text-[13px] text-[#221f1d]">
                  {t.plano.preco} {t.plano.moeda} / {t.plano.ciclo}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a827a] text-[13px]">Trial</span>
                <span className="font-console-mono text-[13px] text-[#221f1d]">
                  {t.plano.status !== 'trial'
                    ? '—'
                    : t.isTrialExpired
                      ? <span className="text-[#9e2f22]">expirado</span>
                      : `${t.diasRestantesTrial} dias restantes`}
                </span>
              </div>
            </div>
          </ConsoleCard>

          <ConsoleCard className="p-5">
            <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-[#8a827a] mb-3.5">
              Limites e Uso
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between border-b border-[#f1ece4] pb-2">
                <span className="text-[#8a827a] text-[13px]">Clientes</span>
                <span className="font-console-mono text-[13px] font-semibold text-[#221f1d]">
                  <span className="text-[#a14d27]">{usage?.clientes ?? 0}</span> / {formatLimite(t.limites.maxClientes)}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#f1ece4] pb-2">
                <span className="text-[#8a827a] text-[13px]">Agendamentos (mês)</span>
                <span className="font-console-mono text-[13px] font-semibold text-[#221f1d]">
                  <span className="text-[#a14d27]">{usage?.agendamentos ?? 0}</span> / {formatLimite(t.limites.maxAgendamentosMes)}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#f1ece4] pb-2">
                <span className="text-[#8a827a] text-[13px]">Utilizadores</span>
                <span className="font-console-mono text-[13px] font-semibold text-[#221f1d]">
                  <span className="text-[#a14d27]">{detail.totalUsuarios}</span> / {formatLimite(t.limites.maxUsuarios)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8a827a] text-[13px]">Mensagens (total)</span>
                <span className="font-console-mono text-[13px] font-semibold text-[#a14d27]">{usage?.mensagens ?? 0}</span>
              </div>
            </div>
          </ConsoleCard>

          <ConsoleCard className="p-5 md:col-span-2">
            <h3 className="font-console-mono text-[11px] uppercase tracking-[.1em] text-[#8a827a] mb-3.5">
              Feature Flags
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(FEATURE_FLAG_LABELS).map(([key, label]) => {
                const on = Boolean(t.limites[key as keyof typeof t.limites]);
                return (
                  <div key={key} className="bg-[#fbf9f6] border border-[#e8e2da] rounded-[3px] p-3 text-center">
                    <div className="font-console-mono text-[10px] uppercase tracking-[.06em] text-[#9a938c] mb-1.5">
                      {label}
                      {key === 'leadsAtivo' && ` · ${formatLimite(t.limites.maxLeads)}`}
                    </div>
                    <div className="font-semibold text-[13px]" style={{ color: on ? '#3f6b3c' : '#a59d93' }}>
                      {on ? 'Activo' : 'Inactivo'}
                    </div>
                  </div>
                );
              })}
            </div>
          </ConsoleCard>
        </div>
      </ConsoleCard>
    </div>
  );
}
