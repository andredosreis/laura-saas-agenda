import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminTenants } from '../../hooks/useAdminTenants';
import { computeTenantStats } from '../../components/admin/adminStats';
import {
  Avatar, ConsoleCard, PlanBadge, StatusPill, KpiCard, PlanDistributionBar,
} from '../../components/admin/ConsoleUI';
import { CreateTenantForm } from '../../components/admin/CreateTenantForm';

const PAGE_SIZE = 20;

export default function TenantsListPage() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { tenants, total, loading, error, refetch } = useAdminTenants();
  const navigate = useNavigate();

  const stats = useMemo(() => computeTenantStats(tenants), [tenants]);

  const filtered = useMemo(
    () =>
      tenants.filter(
        (t) =>
          t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.slug.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [tenants, searchTerm]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const overLimit = total > tenants.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-[21px] font-semibold text-dark-50 tracking-tight">Tenants</h1>
        <div className="flex items-center gap-2.5 flex-wrap">
          <input
            type="text"
            placeholder="Pesquisar por nome ou slug..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 w-full sm:w-72 text-[13.5px] text-dark-50 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all whitespace-nowrap"
          >
            + Novo Tenant
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard label="Total" value={loading ? '—' : total} />
        <KpiCard label="Em Trial" value={loading ? '—' : stats.trial} />
        <KpiCard label="Activos" value={loading ? '—' : stats.ativos} />
        <KpiCard label="Suspensos" value={loading ? '—' : stats.suspensos} accent={stats.suspensos > 0} />
      </div>
      <div className="mb-4">
        <PlanDistributionBar distribution={stats.distribution} />
      </div>
      {overLimit && (
        <div className="mb-4 text-[12.5px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-[3px] px-3 py-2">
          A mostrar {tenants.length} de {total} tenants — KPIs e tabela limitados a 100. Adicionar endpoint de stats para escala maior.
        </div>
      )}

      {showCreate && (
        <CreateTenantForm onClose={() => setShowCreate(false)} onCreated={refetch} />
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
        ) : pageItems.length === 0 ? (
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
                {pageItems.map((t) => (
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

        {pages > 1 && (
          <div className="p-3.5 px-[18px] border-t border-white/10 bg-white/5 flex justify-between items-center text-[12.5px] text-dark-400">
            <span>Página {safePage} de {pages} · {filtered.length} tenants</span>
            <div className="flex gap-2 font-console-mono">
              <button
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="px-3 py-1 bg-dark-900 border border-white/10 rounded-[2px] hover:border-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={safePage === pages}
                onClick={() => setPage(safePage + 1)}
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
