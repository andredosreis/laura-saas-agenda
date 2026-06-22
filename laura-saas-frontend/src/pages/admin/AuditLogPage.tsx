import { useState } from 'react';
import { useAdminAudit, AuditFilters } from '../../hooks/useAdminAudit';
import { ConsoleCard, StatusPill } from '../../components/admin/ConsoleUI';

const inputClass =
  'bg-white border border-[#ddd5ca] rounded-[2px] px-3 py-2 w-full text-[13px] text-[#221f1d] placeholder-[#a59d93] focus:outline-none focus:ring-2 focus:ring-[#bd5d33]/30 focus:border-[#bd5d33]';

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
      <h1 className="text-[21px] font-semibold text-[#221f1d] tracking-tight mb-4">Audit Logs</h1>

      <ConsoleCard className="p-5 mb-4">
        <form onSubmit={applyFilters} className="grid grid-cols-1 md:grid-cols-4 gap-3.5 items-end">
          <div>
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-[#9a938c] mb-1.5">
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
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-[#9a938c] mb-1.5">
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
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-[#9a938c] mb-1.5">
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
            <label className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-[#9a938c] mb-1.5">
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
              className="bg-white border border-[#ddd5ca] hover:border-[#bd5d33] text-[#3f3a34] px-4 py-2 rounded-[2px] text-[13px] transition-colors"
            >
              Limpar
            </button>
            <button
              type="submit"
              className="bg-[#221f1d] hover:bg-[#3f3a34] text-[#f4f1ec] px-4 py-2 rounded-[2px] text-[13px] font-medium transition-colors"
            >
              Filtrar
            </button>
          </div>
        </form>
      </ConsoleCard>

      <ConsoleCard className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#9a938c] font-console-mono text-[13px]">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-[#bd5d33] border-t-transparent mx-auto mb-4" />
            A carregar auditoria...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-[#9e2f22] bg-[#fbf1ea] m-4 rounded-[3px] border border-[#e8cdba] text-[13.5px]">
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-[#9a938c] text-[13.5px]">Nenhum log encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#faf8f4] border-b border-[#e8e2da] font-console-mono text-[10px] uppercase tracking-[.08em] text-[#9a938c]">
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
                  <tr key={log._id} className="border-b border-[#f1ece4] hover:bg-[#faf6f1] transition-colors last:border-b-0 text-[13px]">
                    <td className="p-3.5 px-[18px] font-console-mono text-[12px] text-[#534c45] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('pt-PT')}
                    </td>
                    <td className="p-3.5 font-console-mono text-[12.5px] font-semibold text-[#a14d27]">{log.action}</td>
                    <td className="p-3.5">
                      <StatusPill status={log.status} />
                    </td>
                    <td className="p-3.5 text-[#534c45]">
                      {log.actorEmail}
                      <br />
                      <span className="text-[#a59d93] text-[11.5px] font-console-mono">{log.actorUserId}</span>
                    </td>
                    <td className="p-3.5 font-console-mono text-[12px] text-[#8a827a]">
                      {log.targetTenantId || <span className="text-[#c8c0b6]">Global</span>}
                    </td>
                    <td className="p-3.5 px-[18px] text-right">
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <div className="group relative inline-block">
                          <span className="cursor-help text-[#a14d27] border-b border-dashed border-[#a14d27]/50 text-[12.5px]">
                            Ver
                          </span>
                          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-[#221f1d] text-left p-3 rounded-[3px] shadow-xl z-10 text-[11px] font-console-mono text-[#f4f1ec] break-words whitespace-pre-wrap">
                            {JSON.stringify(log.metadata, null, 2)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#c8c0b6]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.pages > 1 && (
          <div className="p-3.5 px-[18px] border-t border-[#e8e2da] bg-[#fbf9f6] flex justify-between items-center text-[12.5px] text-[#8a827a]">
            <span>
              Página {pagination.page} de {pagination.pages} · {pagination.total} registos
            </span>
            <div className="flex gap-2 font-console-mono">
              <button
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
                className="px-3 py-1 bg-white border border-[#ddd5ca] rounded-[2px] hover:border-[#bd5d33] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#ddd5ca] transition-colors"
              >
                Anterior
              </button>
              <button
                disabled={page === pagination.pages}
                onClick={() => handlePageChange(page + 1)}
                className="px-3 py-1 bg-white border border-[#ddd5ca] rounded-[2px] hover:border-[#bd5d33] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#ddd5ca] transition-colors"
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
