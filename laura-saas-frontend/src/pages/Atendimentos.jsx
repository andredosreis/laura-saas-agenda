import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import {
  ClipboardList,
  Calendar,
  User,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  TrendingUp,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

function Atendimentos() {
  const navigate = useNavigate();
  const [atendimentos, setAtendimentos] = useState([]);
  const [estatisticas, setEstatisticas] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const carregarAtendimentos = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });

      if (filtroStatus && filtroStatus !== 'todos') {
        params.append('status', filtroStatus);
      }
      if (dataInicio) params.append('dataInicio', dataInicio);
      if (dataFim) params.append('dataFim', dataFim);

      const response = await api.get(`/agendamentos/historico?${params}`);
      setAtendimentos(response.data.data || []);
      setTotalPages(response.data.pagination?.pages || 1);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      toast.error('Erro ao carregar histórico de atendimentos.');
    } finally {
      setIsLoading(false);
    }
  };

  const carregarEstatisticas = async () => {
    try {
      const response = await api.get('/agendamentos/stats/mes');
      setEstatisticas(response.data.estatisticas);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  };

  useEffect(() => {
    carregarAtendimentos();
  }, [page, filtroStatus, dataInicio, dataFim]);

  useEffect(() => {
    carregarEstatisticas();
  }, []);

  const formatarData = (dataISO) => {
    const data = new Date(dataISO);
    return data.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatarValor = (valor) => {
    if (!valor) return 'N/A';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'EUR'
    }).format(valor);
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Realizado': {
        icon: <CheckCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5" />,
        className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
      },
      'Cancelado Pelo Cliente': {
        icon: <XCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5" />,
        className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      },
      'Cancelado Pelo Salão': {
        icon: <XCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5" />,
        className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      },
      'Não Compareceu': {
        icon: <AlertCircle className="w-3 h-3 lg:w-3.5 lg:h-3.5" />,
        className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
      },
    };

    const badge = badges[status] || badges['Realizado'];
    return (
      <span className={`inline-flex items-center gap-1 lg:gap-1.5 px-2 lg:px-2.5 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
        {badge.icon}
        <span className="hidden sm:inline">{status}</span>
      </span>
    );
  };

  const limparFiltros = () => {
    setFiltroStatus('todos');
    setDataInicio('');
    setDataFim('');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="p-4 lg:p-6 pb-20">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <ClipboardList className="w-7 h-7 lg:w-8 lg:h-8 text-indigo-600" />
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">
              Histórico de Atendimentos
            </h1>
          </div>
          <p className="text-sm lg:text-base text-slate-600 dark:text-slate-400">
            Visualize todos os atendimentos realizados, cancelados e não comparecimentos
          </p>
        </div>

        {/* Estatísticas */}
        {estatisticas && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-5">
            <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5 border border-slate-200 dark:border-slate-700 shadow-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs lg:text-sm text-slate-600 dark:text-slate-400">Total do Mês</span>
                <Calendar className="w-4 h-4 lg:w-5 lg:h-5 text-indigo-500" />
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white">{estatisticas.totalAgendamentos}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Agendamentos</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5 border border-slate-200 dark:border-slate-700 shadow-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs lg:text-sm text-slate-600 dark:text-slate-400">Realizados</span>
                <CheckCircle className="w-4 h-4 lg:w-5 lg:h-5 text-green-500" />
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-green-600 dark:text-green-400">{estatisticas.totalRealizados}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{estatisticas.taxaSucesso}% de sucesso</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5 border border-slate-200 dark:border-slate-700 shadow-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs lg:text-sm text-slate-600 dark:text-slate-400">Receita Total</span>
                <DollarSign className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-500" />
              </div>
              <p className="text-xl lg:text-2xl xl:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatarValor(estatisticas.receitaTotal)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mês atual</p>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5 border border-slate-200 dark:border-slate-700 shadow-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs lg:text-sm text-slate-600 dark:text-slate-400">Não Compareceu</span>
                <AlertCircle className="w-4 h-4 lg:w-5 lg:h-5 text-orange-500" />
              </div>
              <p className="text-2xl lg:text-3xl font-bold text-orange-600 dark:text-orange-400">{estatisticas.totalNaoCompareceu}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{estatisticas.taxaNaoComparecimento}% do total</p>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5 border border-slate-200 dark:border-slate-700 shadow-lg mb-5">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <Filter className="w-4 h-4 lg:w-5 lg:h-5 text-slate-600 dark:text-slate-400" />
            <h2 className="text-base lg:text-lg font-semibold text-slate-800 dark:text-white">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div>
              <label className="block text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 lg:mb-2">
                Status
              </label>
              <select
                value={filtroStatus}
                onChange={(e) => {
                  setFiltroStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="todos">Todos</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado Pelo Cliente">Cancelado Pelo Cliente</option>
                <option value="Cancelado Pelo Salão">Cancelado Pelo Salão</option>
                <option value="Não Compareceu">Não Compareceu</option>
              </select>
            </div>

            <div>
              <label className="block text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 lg:mb-2">
                Data Início
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  setDataInicio(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 lg:mb-2">
                Data Fim
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  setDataFim(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={limparFiltros}
                className="w-full px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        </div>

        {/* Lista de Atendimentos */}
        <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-base lg:text-lg font-semibold text-slate-800 dark:text-white">
              Atendimentos ({atendimentos.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 lg:p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-10 w-10 lg:h-12 lg:w-12 border-b-2 border-indigo-600"></div>
              <p className="mt-4 text-sm lg:text-base text-slate-600 dark:text-slate-400">Carregando histórico...</p>
            </div>
          ) : atendimentos.length === 0 ? (
            <div className="p-8 lg:p-12 text-center">
              <ClipboardList className="w-12 h-12 lg:w-16 lg:h-16 text-slate-300 dark:text-slate-600 mx-auto mb-3 lg:mb-4" />
              <p className="text-slate-600 dark:text-slate-400 text-base lg:text-lg font-medium">
                Nenhum atendimento encontrado
              </p>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-500 mt-2">
                Tente ajustar os filtros ou verificar outro período
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Data/Hora
                    </th>
                    <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-3 lg:px-6 py-3 lg:py-4 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Pagamento
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {atendimentos.map((atendimento) => (
                    <tr
                      key={atendimento._id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm text-slate-800 dark:text-slate-200">
                          <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-400" />
                          {formatarData(atendimento.dataHora)}
                        </div>
                      </td>
                      <td className="px-3 lg:px-6 py-3 lg:py-4">
                        <div className="flex items-center gap-1.5 lg:gap-2">
                          <User className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-400" />
                          <div>
                            <p className="text-xs lg:text-sm font-medium text-slate-800 dark:text-white">
                              {atendimento.cliente?.nome || 'N/A'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {atendimento.cliente?.telefone || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 lg:px-6 py-3 lg:py-4">
                        {getStatusBadge(atendimento.status)}
                      </td>
                      <td className="px-3 lg:px-6 py-3 lg:py-4 whitespace-nowrap text-xs lg:text-sm text-slate-800 dark:text-slate-200">
                        {formatarValor(atendimento.valorCobrado || atendimento.servicoAvulsoValor)}
                      </td>
                      <td className="px-3 lg:px-6 py-3 lg:py-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          atendimento.statusPagamento === 'Pago'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}>
                          {atendimento.statusPagamento || 'Pendente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="p-4 lg:p-5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>

              <span className="text-xs lg:text-sm text-slate-600 dark:text-slate-400">
                Página {page} de {totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline">Próxima</span>
                <ChevronRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Atendimentos;
