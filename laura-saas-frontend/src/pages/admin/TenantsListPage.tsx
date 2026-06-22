import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminTenants } from '../../hooks/useAdminTenants';
import { Avatar, ConsoleCard, PlanBadge, StatusPill } from '../../components/admin/ConsoleUI';

export default function TenantsListPage() {
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const { data: tenants, pagination, loading, error, refetch } = useAdminTenants(page, 20);
  const navigate = useNavigate();

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    refetch(newPage, 20);
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-[21px] font-semibold text-[#221f1d] tracking-tight">Tenants</h1>
        <input
          type="text"
          placeholder="Pesquisar por nome ou slug..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-white border border-[#ddd5ca] rounded-[2px] px-3 py-2 w-full sm:w-72 text-[13.5px] text-[#221f1d] placeholder-[#a59d93] focus:outline-none focus:ring-2 focus:ring-[#bd5d33]/30 focus:border-[#bd5d33]"
        />
      </div>

      <ConsoleCard className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[#9a938c] font-console-mono text-[13px]">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-[#bd5d33] border-t-transparent mx-auto mb-4" />
            A carregar tenants...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-[#9e2f22] bg-[#fbf1ea] m-4 rounded-[3px] border border-[#e8cdba] text-[13.5px]">
            {error}
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-12 text-center text-[#9a938c] text-[13.5px]">Nenhum tenant encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#faf8f4] border-b border-[#e8e2da]">
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-[#9a938c] p-3.5 px-[18px] font-medium">
                    Negócio
                  </th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-[#9a938c] p-3.5 font-medium">
                    Plano
                  </th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-[#9a938c] p-3.5 font-medium">
                    Estado
                  </th>
                  <th className="font-console-mono text-[10px] uppercase tracking-[.08em] text-[#9a938c] p-3.5 px-[18px] font-medium text-right">
                    Criado em
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => navigate(`/admin/tenants/${t._id}`)}
                    className="border-b border-[#f1ece4] hover:bg-[#faf6f1] cursor-pointer transition-colors last:border-b-0"
                  >
                    <td className="p-3.5 px-[18px]">
                      <div className="flex items-center gap-3">
                        <Avatar name={t.nome} />
                        <div>
                          <div className="text-[14px] font-semibold text-[#221f1d]">{t.nome}</div>
                          <div className="font-console-mono text-[12px] text-[#8a827a]">{t.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5">
                      <PlanBadge plano={t.plano.tipo} />
                    </td>
                    <td className="p-3.5">
                      <StatusPill status={t.plano.status} />
                    </td>
                    <td className="p-3.5 px-[18px] text-right font-console-mono text-[12.5px] text-[#8a827a]">
                      {new Date(t.createdAt).toLocaleDateString('pt-PT')}
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
              Página {pagination.page} de {pagination.pages} · {pagination.total} tenants
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
