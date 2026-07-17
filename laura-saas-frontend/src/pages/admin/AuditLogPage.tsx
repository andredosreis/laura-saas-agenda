import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAdminAudit, AuditFilters } from '../../hooks/useAdminAudit';
import { ConsoleCard, StatusPill } from '../../components/admin/ConsoleUI';
import { CopyIdButton } from '../../components/admin/CopyIdButton';

const inputClass =
  'bg-dark-900 border border-white/10 rounded-[2px] px-3 py-2 w-full text-[13px] text-dark-50 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500';

// Sem o sufixo `Z` a string é interpretada como hora LOCAL — que é o que o
// intervalo tem de significar: o operador escolhe dias no fuso dele e a tabela
// mostra os timestamps no fuso dele (toLocaleString). Com fronteiras em UTC,
// "De 1 Jul" perdia a primeira hora do dia em Lisboa e "Até 14 Jul" trazia uma
// hora do dia 15.
const dateToIso = (date: string, endOfDay = false) =>
  new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();

const hasJsonContent = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 font-console-mono text-[10px] font-semibold uppercase tracking-[.08em] text-primary-300">
        {label}
      </h3>
      <pre className="overflow-x-auto rounded-[3px] border border-white/10 bg-dark-900 p-3 font-console-mono text-xs leading-relaxed text-dark-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AuditFilters>({});

  const [targetTenantId, setTargetTenantId] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ok' | 'denied' | 'error' | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());

  const { data: logs, pagination, loading, error } = useAdminAudit(page, 20, filters);
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalidDateRange) return;

    const newFilters: AuditFilters = {};
    if (targetTenantId) newFilters.targetTenantId = targetTenantId;
    if (actorUserId) newFilters.actorUserId = actorUserId;
    if (actionFilter) newFilters.action = actionFilter;
    if (statusFilter) newFilters.status = statusFilter;
    if (fromDate) newFilters.from = dateToIso(fromDate);
    if (toDate) newFilters.to = dateToIso(toDate, true);

    setPage(1);
    setFilters(newFilters);
  };

  const clearFilters = () => {
    setTargetTenantId('');
    setActorUserId('');
    setActionFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
    setFilters({});
  };

  const toggleRow = (logId: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(logId)) next.delete(logId);
      else next.add(logId);
      return next;
    });
  };

  return (
    <div>
      <h1 className="text-[21px] font-semibold text-dark-50 tracking-tight mb-4">Audit Logs</h1>

      <ConsoleCard className="p-5 mb-4">
        <form onSubmit={applyFilters} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3.5 items-end">
          <div>
            <label htmlFor="audit-target-tenant" className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Target Tenant ID
            </label>
            <input
              id="audit-target-tenant"
              type="text"
              placeholder="Ex: 60d21b4667d0d8992e610c85"
              value={targetTenantId}
              onChange={(e) => setTargetTenantId(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="audit-actor-user" className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Actor User ID
            </label>
            <input
              id="audit-actor-user"
              type="text"
              placeholder="Ex: 60d21b..."
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="audit-action" className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Ação
            </label>
            <input
              id="audit-action"
              type="text"
              placeholder="Ex: tenant.suspend"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="audit-status" className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Status
            </label>
            <select
              id="audit-status"
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
          <div>
            <label htmlFor="audit-from" className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              De
            </label>
            <input
              id="audit-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate || undefined}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="audit-to" className="block font-console-mono text-[10px] uppercase tracking-[.06em] text-dark-400 mb-1.5">
              Até
            </label>
            <input
              id="audit-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
              aria-describedby={invalidDateRange ? 'audit-date-error' : undefined}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2 xl:col-span-6 flex flex-wrap items-center justify-end gap-2.5 mt-1">
            {invalidDateRange && (
              <span id="audit-date-error" role="alert" className="mr-auto text-[12.5px] text-red-300">
                A data “Até” deve ser igual ou posterior à data “De”.
              </span>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-4 py-2 rounded-[2px] text-[13px] transition-colors"
            >
              Limpar
            </button>
            <button
              type="submit"
              disabled={invalidDateRange}
              className="bg-gradient-to-r from-primary-500 to-purple-600 hover:from-primary-600 hover:to-purple-700 text-white px-4 py-2 rounded-[2px] text-[13px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40"
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
                  <th className="p-3.5 px-[18px] font-medium text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedRows.has(log._id);
                  const hasDetails = [log.metadata, log.before, log.after].some(hasJsonContent);
                  const detailsId = `audit-details-${log._id}`;

                  return (
                    <Fragment key={log._id}>
                      <tr className="border-b border-white/10 hover:bg-white/5 transition-colors text-[13px]">
                        <td className="p-3.5 px-[18px] font-console-mono text-[12px] text-dark-300 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('pt-PT')}
                        </td>
                        <td className="p-3.5 font-console-mono text-[12.5px] font-semibold text-primary-400">{log.action}</td>
                        <td className="p-3.5">
                          <StatusPill status={log.status} />
                        </td>
                        <td className="p-3.5 text-dark-300">
                          <div>{log.actorEmail}</div>
                          <div className="mt-0.5 flex items-center gap-1 font-console-mono text-[11.5px] text-dark-400">
                            <span>{log.actorUserId}</span>
                            <CopyIdButton id={log.actorUserId} label={`Copiar ID do ator ${log.actorEmail}`} />
                          </div>
                        </td>
                        <td className="p-3.5 font-console-mono text-[12px] text-dark-400">
                          {log.targetTenantId ? (
                            <div className="flex items-center gap-1">
                              <span>{log.targetTenantId}</span>
                              <CopyIdButton id={log.targetTenantId} label="Copiar ID do tenant alvo" />
                            </div>
                          ) : (
                            <span className="text-dark-500">Global</span>
                          )}
                        </td>
                        <td className="p-3.5 px-[18px] text-right">
                          <button
                            type="button"
                            onClick={() => toggleRow(log._id)}
                            disabled={!hasDetails}
                            aria-expanded={isExpanded}
                            aria-controls={hasDetails ? detailsId : undefined}
                            aria-label={`${isExpanded ? 'Ocultar' : 'Mostrar'} detalhes de ${log.action}`}
                            className="group -m-1.5 inline-flex h-11 w-11 items-center justify-center rounded-[2px] text-primary-300 transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                          >
                            <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/10 bg-dark-900 transition-colors group-hover:border-primary-500">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && hasDetails && (
                        <tr id={detailsId} className="border-b border-white/10 bg-dark-900/50">
                          <td colSpan={6} className="p-4 px-[18px]">
                            <div role="region" aria-label={`Detalhes de ${log.action}`} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                              {hasJsonContent(log.metadata) && <JsonBlock label="Metadata" value={log.metadata} />}
                              {hasJsonContent(log.before) && <JsonBlock label="Before" value={log.before} />}
                              {hasJsonContent(log.after) && <JsonBlock label="After" value={log.after} />}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
