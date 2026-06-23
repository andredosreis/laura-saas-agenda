import { useState } from 'react';
import { useAdminAudit, AuditFilters } from '../../hooks/useAdminAudit';
import { ConsoleCard, StatusPill } from '../../components/admin/ConsoleUI';

const inputClass =
  'bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 w-full text-[13px] text-dark-50 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditFilters>({});

  const [targetTenantId, setTargetTenantId] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ok' | 'denied' | 'error' | ''>('');

  const { data: logs, pagination, loading, error, refetch } = useAdminAudit(page, 20, filters);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    refetch(newPage, 20, filters);
  };

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const newFilters: AuditFilters = {};
    if (targetTenantId) newFilters.targetTenantId = targetTenantId;
    if (actorUserId) newFilters.actorUserId = actorUserId;
    if (actionFilter) newFilters.action = actionFilter;
    if (statusFilter) newFilters.status = statusFilter;

    setPage(1);
    setFilters(newFilters);
    refetch(1, 20, newFilters);
  };

  const clearFilters = () => {
    setTargetTenantId('');
    setActorUserId('');
    setActionFilter('');
    setStatusFilter('');
    setPage(1);
    setFilters({});
    refetch(1, 20, {});
  };

  return (
    <div>
      <h1 className="text-[21px] font-semibold text-dark-50 tracking-tight mb-4">Audit Logs</h1>

      <ConsoleCard className="p-5 mb-4">
        <form onSubmit={applyFilters} className="grid grid-cols-1 md:grid-cols-4 gap-3.5 items-end">
          <div>
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Target Tenant ID
            </label>
            <input
              type="text"
              placeholder="Ex: 60d21b4667d0d8992e610c85"
              value={targetTenantId}
              onChange={(e) => setTargetTenantId(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Actor User ID
            </label>
            <input
              type="text"
              placeholder="Ex: 60d21b..."
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Ação
            </label>
            <input
              type="text"
              placeholder="Ex: tenant.suspend"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className={inputClass}
            >
              <option value="">Todos</option>
              <option value="ok">OK</option>
              <option value="denied">Denied</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="md:col-span-4 flex justify-end gap-2.5 mt-1">
            <button
              type="button"
              onClick={clearFilters}
              className="bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2 rounded-[2px] text-[13px] transition-colors"
            >
              Limpar
            </button>
            <button
              type="submit"
              className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all"
            >
              Filtrar
            </button>
          </div>
        </form>
      </ConsoleCard>

      <ConsoleCard className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-dark-400 font-console-mono text-[13px]">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary-500 border-t-transparent mx-auto mb-4" />
            A carregar auditoria...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-300 bg-red-500/10 m-4 rounded-[3px] border border-red-500/20 text-[13.5px]">
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-dark-400 text-[13.5px]">Nenhum log encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 font-console-mono text-[10px] uppercase tracking-[.08em] text-dark-400">
                  <th className="p-3.5 px-[18px] font-medium whitespace-nowrap">Data</th>
                  <th className="p-3.5 font-medium">Ação</th>
                  <th className="p-3.5 font-medium">Status</th>
                  <th className="p-3.5 font-medium">Ator</th>
                  <th className="p-3.5 font-medium">Alvo (Tenant)</th>
                  <th className="p-3.5 px-[18px] font-medium text-right">Metadados</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} className="border-b border-white/10 hover:bg-white/5 transition-colors last:border-b-0 text-[13px]">
                    <td className="p-3.5 px-[18px] font-console-mono text-[12px] text-dark-300 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-PT')}
                    </td>
                    <td className="p-3.5 font-console-mono text-[12.5px] font-semibold text-primary-400">{log.action}</td>
                    <td className="p-3.5">
                      <StatusPill status={log.status} />
                    </td>
                    <td className="p-3.5 text-dark-300">
                      {log.actorEmail}
                      <br />
                      <span className="text-dark-400 text-[11.5px] font-console-mono">{log.actorUserId}</span>
                    </td>
                    <td className="p-3.5 font-console-mono text-[12px] text-dark-400">
                      {log.targetTenantId || <span className="text-dark-500">Global</span>}
                    </td>
                    <td className="p-3.5 px-[18px] text-right">
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <div className="group relative inline-block">
                          <span className="cursor-help text-primary-400 border-b border-dashed border-primary-400/50 text-[12.5px]">
                            Ver
                          </span>
                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-dark-700 text-left p-3 rounded-[3px] shadow-xl z-10 text-[11px] font-console-mono text-dark-50 break-words whitespace-pre-wrap">
                            {JSON.stringify(log.metadata, null, 2)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-dark-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.pages > 1 && (
          <div className="p-3.5 px-[18px] border-t border-white/10 bg-white/5 flex justify-between items-center text-[12.5px] text-dark-400">
            <span>
              Página {pagination.page} de {pagination.pages} · {pagination.total} registos
            </span>
            <div className="flex gap-2 font-console-mono">
              <button
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                className="px-3 py-1 bg-dark-900 border border-white/10 rounded-[2px] hover:border-primary-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10 transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={page === pagination.pages}
                onClick={() => handlePageChange(page + 1)}
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
