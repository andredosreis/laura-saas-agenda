import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { DateTime } from 'luxon';
import {
  ClipboardList, Calendar, User, DollarSign, CheckCircle, XCircle, AlertCircle,
  Filter, ChevronLeft, ChevronRight, Loader2, Star, Sparkles, Activity, Eye, TrendingUp, Search
} from 'lucide-react';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import DetalhesAtendimentoModal from '../components/DetalhesAtendimentoModal';

const ZONA = 'Europe/Lisbon';

// Calcula intervalo de datas (ISO) a partir do preset (alinhado com Agendamentos.jsx)
function getDateRange(preset) {
  const agora = DateTime.now().setZone(ZONA);
  switch (preset) {
    case 'mes':
      return { dataInicio: agora.startOf('month').toISO(), dataFim: agora.endOf('month').toISO() };
    case 'semana':
      return { dataInicio: agora.minus({ days: 7 }).startOf('day').toISO(), dataFim: agora.endOf('day').toISO() };
    case 'tres_meses':
      return { dataInicio: agora.minus({ months: 3 }).startOf('day').toISO(), dataFim: agora.endOf('day').toISO() };
    case 'ano':
      return { dataInicio: agora.startOf('year').toISO(), dataFim: agora.endOf('year').toISO() };
    case 'todos':
    default:
      return { dataInicio: null, dataFim: null };
  }
}

function Atendimentos() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  // Dados
  const [atendimentos, setAtendimentos] = useState([]);
  const [estatisticasOp, setEstatisticasOp] = useState(null);    // /agendamentos/stats/mes
  const [estatisticasClinicas, setEstatisticasClinicas] = useState(null); // /historico-atendimentos/stats
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [filtroData, setFiltroData] = useState('mes');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState(null);
  const [showDetalhes, setShowDetalhes] = useState(false);

  // Estilos condicionais (alinhado com PacotesAtivos / Agendamentos / Clientes)
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-white/10'
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';

  const presets = [
    { value: 'mes',         label: 'Este mês' },
    { value: 'semana',      label: 'Última semana' },
    { value: 'tres_meses',  label: 'Últimos 3 meses' },
    { value: 'ano',         label: 'Ano' },
    { value: 'todos',       label: 'Todos' },
  ];

  // Carregar atendimentos (Agendamento.histórico)
  const carregarAtendimentos = useCallback(async () => {
    setIsLoading(true);
    try {
      const { dataInicio, dataFim } = getDateRange(filtroData);
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filtroStatus && filtroStatus !== 'todos') params.append('status', filtroStatus);
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
  }, [page, filtroStatus, filtroData]);

  // Carregar KPIs (operacionais + clínicos)
  const carregarEstatisticas = useCallback(async () => {
    const { dataInicio, dataFim } = getDateRange(filtroData);
    try {
      const [opRes, clinRes] = await Promise.all([
        api.get('/agendamentos/stats/mes'),
        api.get('/historico-atendimentos/stats' + (dataInicio || dataFim
          ? `?${new URLSearchParams({ ...(dataInicio && { dataInicio }), ...(dataFim && { dataFim }) }).toString()}`
          : '')),
      ]);
      setEstatisticasOp(opRes.data?.estatisticas || null);
      setEstatisticasClinicas(clinRes.data?.data || null);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  }, [filtroData]);

  useEffect(() => { carregarAtendimentos(); }, [carregarAtendimentos]);
  useEffect(() => { carregarEstatisticas(); }, [carregarEstatisticas]);

  // Reset página ao mudar filtros
  useEffect(() => { setPage(1); }, [filtroStatus, filtroData]);

  // Filtro client-side por nome do cliente
  const atendimentosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return atendimentos;
    return atendimentos.filter(a => (a.cliente?.nome || '').toLowerCase().includes(termo));
  }, [atendimentos, busca]);

  const formatarData = (dataISO) => DateTime.fromISO(dataISO).setZone(ZONA).toFormat('dd/MM/yyyy HH:mm');
  const formatarValor = (v) => v == null ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

  const statusBadge = (status) => {
    const map = {
      'Realizado':              { icon: CheckCircle, cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
      'Cancelado Pelo Cliente': { icon: XCircle,    cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
      'Cancelado Pelo Salão':   { icon: XCircle,    cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
      'Não Compareceu':         { icon: AlertCircle, cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    };
    const item = map[status] || { icon: CheckCircle, cls: 'bg-gray-500/10 text-gray-500 border-gray-500/20' };
    const Icon = item.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${item.cls} whitespace-nowrap`}>
        <Icon className="w-3 h-3" />
        <span className="hidden sm:inline">{status}</span>
      </span>
    );
  };

  const abrirDetalhes = (agendamento) => {
    setAgendamentoSelecionado(agendamento);
    setShowDetalhes(true);
  };

  const fecharDetalhes = () => {
    setShowDetalhes(false);
    setAgendamentoSelecionado(null);
  };

  return (
    <div className={`min-h-screen pt-24 pb-8 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
          <div>
            <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${textClass}`}>
              <ClipboardList className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500" />
              Atendimentos
            </h1>
            <p className={`text-sm mt-1 ${subTextClass}`}>
              Relatório operacional e clínico — {presets.find(p => p.value === filtroData)?.label.toLowerCase()}
            </p>
          </div>
          <button
            onClick={() => navigate('/agendamentos')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium shadow-lg shadow-indigo-500/25"
          >
            <Calendar className="w-4 h-4" />
            Ver Agendamentos
          </button>
        </div>

        {/* Pills de data */}
        <div className="mb-4 flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => setFiltroData(p.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filtroData === p.value
                  ? 'bg-linear-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                  : isDarkMode
                    ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* KPIs operacionais (linha 1) */}
        {estatisticasOp && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <KPICard
              label="Total agendamentos"
              valor={estatisticasOp.totalAgendamentos}
              icon={Calendar}
              iconColor="text-indigo-500"
              subtitle="Mês actual"
              cardClass={cardClass} textClass={textClass} subTextClass={subTextClass}
            />
            <KPICard
              label="Realizados"
              valor={estatisticasOp.totalRealizados}
              valorColor="text-emerald-500"
              icon={CheckCircle}
              iconColor="text-emerald-500"
              subtitle={`${estatisticasOp.taxaSucesso}% de sucesso`}
              cardClass={cardClass} textClass={textClass} subTextClass={subTextClass}
            />
            <KPICard
              label="Receita do mês"
              valor={formatarValor(estatisticasOp.receitaTotal)}
              valorColor="text-emerald-500"
              icon={DollarSign}
              iconColor="text-emerald-500"
              subtitle="Mês actual"
              cardClass={cardClass} textClass={textClass} subTextClass={subTextClass}
              valorSize="text-xl lg:text-2xl"
            />
            <KPICard
              label="Não compareceu"
              valor={estatisticasOp.totalNaoCompareceu}
              valorColor="text-amber-500"
              icon={AlertCircle}
              iconColor="text-amber-500"
              subtitle={`${estatisticasOp.taxaNaoComparecimento}% do total`}
              cardClass={cardClass} textClass={textClass} subTextClass={subTextClass}
            />
          </div>
        )}

        {/* KPIs clínicos (linha 2) — só aparece se há ao menos 1 atendimento finalizado */}
        {estatisticasClinicas && estatisticasClinicas.totalAtendimentos > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {/* Satisfação média */}
            <div className={`${cardClass} rounded-xl lg:rounded-2xl p-4 lg:p-5`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs lg:text-sm ${subTextClass}`}>Satisfação média</span>
                <Star className="w-4 h-4 lg:w-5 lg:h-5 text-amber-400 fill-amber-400" />
              </div>
              <p className={`text-2xl lg:text-3xl font-bold text-amber-500`}>
                {estatisticasClinicas.mediaSatisfacao || '—'}
              </p>
              {estatisticasClinicas.mediaSatisfacao > 0 && (
                <div className="flex items-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star
                      key={i}
                      className={`w-3 h-3 ${
                        i <= Math.round(parseFloat(estatisticasClinicas.mediaSatisfacao))
                          ? 'fill-amber-400 text-amber-400'
                          : isDarkMode ? 'text-slate-600' : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            <KPICard
              label="Fichas finalizadas"
              valor={estatisticasClinicas.totalAtendimentos}
              icon={ClipboardList}
              iconColor="text-indigo-500"
              subtitle="Com detalhe clínico"
              cardClass={cardClass} textClass={textClass} subTextClass={subTextClass}
            />

            {/* Top serviço */}
            <div className={`${cardClass} rounded-xl lg:rounded-2xl p-4 lg:p-5`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs lg:text-sm ${subTextClass}`}>Top serviço</span>
                <Sparkles className="w-4 h-4 lg:w-5 lg:h-5 text-purple-500" />
              </div>
              <p className={`text-base lg:text-lg font-bold ${textClass} truncate`} title={estatisticasClinicas.servicosMaisRealizados?.[0]?._id}>
                {estatisticasClinicas.servicosMaisRealizados?.[0]?._id || '—'}
              </p>
              <p className={`text-xs mt-1 ${subTextClass}`}>
                {estatisticasClinicas.servicosMaisRealizados?.[0]?.quantidade
                  ? `${estatisticasClinicas.servicosMaisRealizados[0].quantidade} vezes`
                  : 'Sem dados'}
              </p>
            </div>

            {/* Top técnica */}
            <div className={`${cardClass} rounded-xl lg:rounded-2xl p-4 lg:p-5`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs lg:text-sm ${subTextClass}`}>Top técnica</span>
                <Activity className="w-4 h-4 lg:w-5 lg:h-5 text-blue-500" />
              </div>
              <p className={`text-base lg:text-lg font-bold ${textClass} truncate`} title={estatisticasClinicas.tecnicasMaisUtilizadas?.[0]?._id}>
                {estatisticasClinicas.tecnicasMaisUtilizadas?.[0]?._id || '—'}
              </p>
              <p className={`text-xs mt-1 ${subTextClass}`}>
                {estatisticasClinicas.tecnicasMaisUtilizadas?.[0]?.quantidade
                  ? `${estatisticasClinicas.tecnicasMaisUtilizadas[0].quantidade} aplicações`
                  : 'Sem dados'}
              </p>
            </div>
          </div>
        )}

        {/* Filtros: status + busca */}
        <div className={`${cardClass} rounded-2xl p-4 mb-5`}>
          <div className="flex items-center gap-2 mb-3">
            <Filter className={`w-4 h-4 ${subTextClass}`} />
            <h2 className={`text-sm font-semibold ${textClass}`}>Filtros</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subTextClass}`}>Status</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${inputClass}`}
              >
                <option value="todos">Todos</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado Pelo Cliente">Cancelado pelo Cliente</option>
                <option value="Cancelado Pelo Salão">Cancelado pelo Salão</option>
                <option value="Não Compareceu">Não Compareceu</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${subTextClass}`}>Pesquisar cliente</label>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextClass} pointer-events-none`} />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome do cliente..."
                  className={`w-full pl-10 pr-3 py-2 rounded-lg border text-sm ${inputClass}`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Lista — tabela em desktop, cards em mobile */}
        <div className={`${cardClass} rounded-2xl overflow-hidden`}>
          <div className={`p-4 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
            <h2 className={`text-base font-semibold ${textClass}`}>
              Atendimentos ({atendimentosFiltrados.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mx-auto" />
              <p className={`mt-3 text-sm ${subTextClass}`}>A carregar histórico...</p>
            </div>
          ) : atendimentosFiltrados.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
              <p className={`text-base ${textClass}`}>Nenhum atendimento encontrado.</p>
              <p className={`text-sm mt-1 ${subTextClass}`}>
                {busca ? `Sem resultados para "${busca}"` : 'Ajusta os filtros ou alarga o período.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop: tabela */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead className={isDarkMode ? 'bg-white/5' : 'bg-gray-50'}>
                    <tr>
                      <Th subTextClass={subTextClass}>Data/Hora</Th>
                      <Th subTextClass={subTextClass}>Cliente</Th>
                      <Th subTextClass={subTextClass}>Status</Th>
                      <Th subTextClass={subTextClass}>Valor</Th>
                      <Th subTextClass={subTextClass}>Pagamento</Th>
                      <Th subTextClass={subTextClass} alignRight>Ficha</Th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-white/10' : 'divide-gray-200'}`}>
                    {atendimentosFiltrados.map((a) => (
                      <tr
                        key={a._id}
                        className={isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}
                      >
                        <td className="px-4 py-3 text-sm">
                          <span className={`flex items-center gap-1.5 ${textClass}`}>
                            <Calendar className={`w-3.5 h-3.5 ${subTextClass}`} />
                            {formatarData(a.dataHora)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className={`w-3.5 h-3.5 ${subTextClass}`} />
                            <div className="min-w-0">
                              <p className={`text-sm font-medium truncate ${textClass}`}>{a.cliente?.nome || a.lead?.nome || 'N/A'}</p>
                              <p className={`text-xs ${subTextClass}`}>{a.cliente?.telefone || a.lead?.telefone || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">{statusBadge(a.status)}</td>
                        <td className={`px-4 py-3 text-sm ${textClass} whitespace-nowrap`}>
                          {formatarValor(a.valorCobrado || a.servicoAvulsoValor)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            a.statusPagamento === 'Pago'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {a.statusPagamento || 'Pendente'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {a.status === 'Realizado' ? (
                            <button
                              onClick={() => abrirDetalhes(a)}
                              className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
                              title="Ver ficha clínica"
                            >
                              <Eye className="w-4 h-4 text-indigo-500" />
                            </button>
                          ) : (
                            <span className={`text-xs ${subTextClass}`}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile/tablet: cards */}
              <div className="lg:hidden divide-y divide-white/5">
                {atendimentosFiltrados.map((a) => (
                  <div
                    key={a._id}
                    className={`p-4 ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold truncate ${textClass}`}>{a.cliente?.nome || a.lead?.nome || 'N/A'}</p>
                        <p className={`text-xs flex items-center gap-1 mt-0.5 ${subTextClass}`}>
                          <Calendar className="w-3 h-3" />
                          {formatarData(a.dataHora)}
                        </p>
                      </div>
                      {statusBadge(a.status)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-xs">
                        <span className={textClass}>
                          <strong>{formatarValor(a.valorCobrado || a.servicoAvulsoValor)}</strong>
                        </span>
                        <span className={`px-2 py-0.5 rounded-full font-medium ${
                          a.statusPagamento === 'Pago'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          {a.statusPagamento || 'Pendente'}
                        </span>
                      </div>
                      {a.status === 'Realizado' && (
                        <button
                          onClick={() => abrirDetalhes(a)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors text-xs font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Ficha
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className={`p-4 border-t flex items-center justify-between ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Anterior</span>
              </button>
              <span className={`text-xs ${subTextClass}`}>Página {page} de {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  isDarkMode ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' : 'bg-white border-gray-300 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <span className="hidden sm:inline">Próxima</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalhes clínicos */}
      <DetalhesAtendimentoModal
        isOpen={showDetalhes}
        agendamentoId={agendamentoSelecionado?._id}
        onClose={fecharDetalhes}
      />
    </div>
  );
}

const KPICard = ({ label, valor, valorColor, valorSize, icon: Icon, iconColor, subtitle, cardClass, textClass, subTextClass }) => (
  <div className={`${cardClass} rounded-xl lg:rounded-2xl p-4 lg:p-5`}>
    <div className="flex items-center justify-between mb-1.5">
      <span className={`text-xs lg:text-sm ${subTextClass}`}>{label}</span>
      {Icon && <Icon className={`w-4 h-4 lg:w-5 lg:h-5 ${iconColor || 'text-indigo-500'}`} />}
    </div>
    <p className={`${valorSize || 'text-2xl lg:text-3xl'} font-bold ${valorColor || textClass}`}>{valor ?? '—'}</p>
    {subtitle && <p className={`text-xs mt-0.5 ${subTextClass}`}>{subtitle}</p>}
  </div>
);

const Th = ({ children, subTextClass, alignRight }) => (
  <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${subTextClass} ${alignRight ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);

export default Atendimentos;
