import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminTenants, useAdminTenantStats, TenantFilters } from '../../hooks/useAdminTenants';
import {
  Avatar, ConsoleCard, PlanBadge, StatusPill, KpiCard, PlanDistributionBar,
} from '../../components/admin/ConsoleUI';
import { CopyIdButton } from '../../components/admin/CopyIdButton';
import { CreateTenantForm } from '../../components/admin/CreateTenantForm';
import { PlanoStatus, PlanoTipo } from '../../types/admin';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const PLANO_OPTIONS: PlanoTipo[] = ['basico', 'pro', 'elite', 'custom'];
const STATUS_OPTIONS: PlanoStatus[] = ['trial', 'ativo', 'suspenso', 'cancelado', 'expirado'];
const STATUS_LABELS: Record<PlanoStatus, string> = {
  trial: 'Trial',
  ativo: 'Activo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

const inputClass =
  'bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 w-full sm:w-72 text-[13.5px] text-dark-50 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';
const selectClass =
  'bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 text-[13.5px] text-dark-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';

export default function TenantsListPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [plano, setPlano] = useState<PlanoTipo | ''>('');
  const [status, setStatus] = useState<PlanoStatus | ''>('');
  const [filters, setFilters] = useState<TenantFilters>({});
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  // Debounce da pesquisa (300ms, sem dependência nova). Selects aplicam-se de
  // imediato — só o campo de texto precisa de esperar o utilizador parar de
  // escrever. Qualquer mudança de filtro repõe page=1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput.trim() || undefined }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handlePlanoChange = (value: PlanoTipo | '') => {
    setPlano(value);
    setFilters((current) => ({ ...current, plano: value || undefined }));
    setPage(1);
  };

  const handleStatusChange = (value: PlanoStatus | '') => {
    setStatus(value);
    setFilters((current) => ({ ...current, status: value || undefined }));
    setPage(1);
  };

  const { tenants, pagination, loading, error, refetch } = useAdminTenants(page, PAGE_SIZE, filters);
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useAdminTenantStats();

  const handleCreated = () => {
    refetch();
    refetchStats();
  };

  const suspensos = (stats?.porStatus.suspenso ?? 0) + (stats?.porStatus.expirado ?? 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-[21px] font-semibold text-dark-50 tracking-tight">Tenants</h1>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="text"
            placeholder="Pesquisar por nome ou slug..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={inputClass}
          />
          <select
            aria-label="Filtrar por plano"
            value={plano}
            onChange={(e) => handlePlanoChange(e.target.value as PlanoTipo | '')}
            className={selectClass}
          >
            <option value="">Todos os planos</option>
            {PLANO_OPTIONS.map((p) => (
              <option key={p} value={p}>{p.toUpperCase()}</option>
            ))}
          </select>
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as PlanoStatus | '')}
            className={selectClass}
          >
            <option value="">Todos os estados</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all whitespace-nowrap"
          >
            + Novo Tenant
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Total" value={statsLoading ? '—' : stats?.total ?? 0} />
        <KpiCard label="Em Trial" value={statsLoading ? '—' : stats?.porStatus.trial ?? 0} />
        <KpiCard label="Activos" value={statsLoading ? '—' : stats?.porStatus.ativo ?? 0} />
        <KpiCard label="Suspensos" value={statsLoading ? '—' : suspensos} accent={!statsLoading && suspensos > 0} />
      </div>
      <div className="mb-4">
        <PlanDistributionBar distribution={stats?.porTipo ?? { basico: 0, pro: 0, elite: 0, custom: 0 }} />
      </div>
      {statsError && (
        <div className="mb-4 text-[12.5px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-[3px] px-3 py-2">
          {statsError}
        </div>
      )}

      {showCreate && (
        <CreateTenantForm onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}

      <ConsoleCard className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-dark-400 font-console-mono text-[13px]">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary-500 border-t-transparent mx-auto mb-4" />
            A carregar tenants...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-300 bg-red-500/10 m-4 rounded-[3px] border border-red-500/20 text-[13.5px]">
            {error}
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-dark-400 text-[13.5px]">Nenhum tenant encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 px-[18px] font-medium">Negócio</th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 font-medium">Plano</th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 font-medium">Estado</th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400 p-3.5 px-[18px] font-medium text-right">Criado em</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => navigate(`/admin/tenants/${t._id}`)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors last:border-b-0"
                  >
                    <td className="p-3.5 px-[18px]">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.nome} />
                        <div>
                          <div className="text-[14px] font-semibold text-dark-50">{t.nome}</div>
                          <div className="font-console-mono text-[12px] text-dark-400">{t.slug}</div>
                          <div className="mt-0.5 flex items-center gap-1 font-console-mono text-[11px] text-dark-500">
                            <span>{t._id}</span>
                            <CopyIdButton id={t._id} label={`Copiar ID do tenant ${t.nome}`} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5"><PlanBadge plano={t.plano.tipo} /></td>
                    <td className="p-3.5"><StatusPill status={t.plano.status} /></td>
                    <td className="p-3.5 px-[18px] text-right font-console-mono text-[12.5px] text-dark-400">
                      {new Date(t.createdAt).toLocaleDateString('pt-PT')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.pages > 1 && (
          <div className="p-3.5 px-[18px] border-t border-white/10 bg-white/5 flex justify-between items-center text-[12.5px] text-dark-400">
            <span>Página {pagination.page} de {pagination.pages} · {pagination.total} tenants</span>
            <div className="flex gap-2 font-console-mono">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 bg-dark-900 border border-white/10 rounded-[2px] hover:border-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 bg-dark-900 border border-white/10 rounded-[2px] hover:border-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 transition-colors"
              >
                Seguinte
              </button>
            </div>
          </div>
        )}
      </ConsoleCard>
    </div>
  );
}
