import { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { toast } from 'react-toastify';
import {
  Plus,
  Search,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Eye
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';

// Categorias de receitas e despesas
const CATEGORIAS_RECEITA = ['Serviço Avulso', 'Pacote', 'Produto'];
const CATEGORIAS_DESPESA = ['Fornecedor', 'Salário', 'Comissão', 'Aluguel', 'Água/Luz', 'Internet', 'Produtos', 'Marketing', 'Outros'];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os Status' },
  { value: 'Pendente', label: 'Pendente' },
  { value: 'Pago', label: 'Pago' },
  { value: 'Parcial', label: 'Parcial' },
  { value: 'Cancelado', label: 'Cancelado' },
  { value: 'Estornado', label: 'Estornado' }
];

const FORMAS_PAGAMENTO = [
  'Dinheiro', 'MBWay', 'Multibanco', 'Cartão de Débito', 'Cartão de Crédito', 'Transferência Bancária'
];

function Transacoes() {
  const { isDarkMode } = useTheme();
  
  // Estados
  const [transacoes, setTransacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totais, setTotais] = useState({ receitas: 0, despesas: 0, saldo: 0 });
  const [paginacao, setPaginacao] = useState({ total: 0, pagina: 1, limite: 20, totalPaginas: 1 });
  
  // Filtros
  const [filtros, setFiltros] = useState({
    tipo: '',
    categoria: '',
    statusPagamento: '',
    dataInicio: DateTime.now().minus({ days: 30 }).toISODate(),
    dataFim: DateTime.now().toISODate()
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal de detalhes
  const [transacaoSelecionada, setTransacaoSelecionada] = useState(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  
  // Modal de nova despesa
  const [showNovaDespesa, setShowNovaDespesa] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState({
    categoria: 'Produtos',
    valor: '',
    descricao: '',
    observacoes: '',
    formaPagamento: 'Dinheiro'
  });
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);

  // Buscar transações
  const fetchTransacoes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', paginacao.pagina);
      params.append('limit', paginacao.limite);
      
      if (filtros.tipo) params.append('tipo', filtros.tipo);
      if (filtros.categoria) params.append('categoria', filtros.categoria);
      if (filtros.statusPagamento) params.append('statusPagamento', filtros.statusPagamento);
      if (filtros.dataInicio) params.append('dataInicio', filtros.dataInicio);
      if (filtros.dataFim) params.append('dataFim', filtros.dataFim);

      const response = await api.get(`/transacoes?${params.toString()}`);
      
      setTransacoes(response.data.transacoes || []);
      setTotais(response.data.totais || { receitas: 0, despesas: 0, saldo: 0 });
      setPaginacao(prev => ({
        ...prev,
        total: response.data.paginacao?.total || 0,
        totalPaginas: response.data.paginacao?.totalPaginas || 1
      }));
    } catch (error) {
      console.error('Erro ao buscar transações:', error);
      toast.error('Erro ao carregar transações');
    } finally {
      setLoading(false);
    }
  }, [filtros, paginacao.pagina, paginacao.limite]);

  useEffect(() => {
    fetchTransacoes();
  }, [fetchTransacoes]);

  // Handlers
  const handleFiltroChange = (campo, valor) => {
    setFiltros(prev => ({ ...prev, [campo]: valor }));
    setPaginacao(prev => ({ ...prev, pagina: 1 }));
  };

  const handlePaginaChange = (novaPagina) => {
    setPaginacao(prev => ({ ...prev, pagina: novaPagina }));
  };

  const handleVerDetalhes = async (transacao) => {
    try {
      const response = await api.get(`/transacoes/${transacao._id}`);
      setTransacaoSelecionada(response.data);
      setShowDetalhes(true);
    } catch (error) {
      console.error('Erro ao buscar detalhes:', error);
      toast.error('Erro ao carregar detalhes da transação');
    }
  };

  const handleSalvarDespesa = async (e) => {
    e.preventDefault();
    
    if (!novaDespesa.valor || !novaDespesa.descricao) {
      toast.error('Preencha valor e descrição');
      return;
    }

    setSalvandoDespesa(true);
    try {
      await api.post('/transacoes', {
        tipo: 'Despesa',
        categoria: novaDespesa.categoria,
        valor: parseFloat(novaDespesa.valor),
        descricao: novaDespesa.descricao,
        observacoes: novaDespesa.observacoes,
        formaPagamento: novaDespesa.formaPagamento,
        statusPagamento: 'Pago',
        dataPagamento: new Date()
      });

      toast.success('Despesa registrada com sucesso!');
      setShowNovaDespesa(false);
      setNovaDespesa({
        categoria: 'Produtos',
        valor: '',
        descricao: '',
        observacoes: '',
        formaPagamento: 'Dinheiro'
      });
      fetchTransacoes();
    } catch (error) {
      console.error('Erro ao registrar despesa:', error);
      toast.error('Erro ao registrar despesa');
    } finally {
      setSalvandoDespesa(false);
    }
  };

  const exportarCSV = () => {
    if (transacoes.length === 0) {
      toast.warning('Não há transações para exportar');
      return;
    }

    const headers = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Status', 'Cliente'];
    const rows = transacoes.map(t => [
      DateTime.fromISO(t.createdAt).toFormat('dd/MM/yyyy HH:mm'),
      t.tipo,
      t.categoria,
      t.descricao,
      t.valorFinal?.toFixed(2) || '0.00',
      t.statusPagamento,
      t.cliente?.nome || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transacoes_${DateTime.now().toISODate()}.csv`;
    link.click();
    toast.success('CSV exportado com sucesso!');
  };

  // Estilos condicionais
  const cardClass = isDarkMode 
    ? 'bg-slate-800/50 border border-white/10' 
    : 'bg-white border border-gray-200 shadow-sm';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-20 pb-8 px-4`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${textClass}`}>💰 Transações</h1>
            <p className={subTextClass}>Gerencie receitas e despesas</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl ${cardClass} ${subTextClass} hover:opacity-80 transition-all`}
            >
              <Filter className="w-4 h-4" />
              Filtros
            </button>
            <button
              onClick={exportarCSV}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl ${cardClass} ${subTextClass} hover:opacity-80 transition-all`}
            >
              <Download className="w-4 h-4" />
              Exportar
            </button>
            <button
              onClick={() => setShowNovaDespesa(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 text-white hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${subTextClass}`}>Total Receitas</p>
                <p className={`text-2xl font-bold text-emerald-500`}>
                  €{totais.receitas?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <TrendingUp className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </div>

          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${subTextClass}`}>Total Despesas</p>
                <p className={`text-2xl font-bold text-red-500`}>
                  €{totais.despesas?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-500/10">
                <TrendingDown className="w-6 h-6 text-red-500" />
              </div>
            </div>
          </div>

          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${subTextClass}`}>Saldo</p>
                <p className={`text-2xl font-bold ${totais.saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  €{totais.saldo?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${totais.saldo >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <DollarSign className={`w-6 h-6 ${totais.saldo >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Filtros */}
        {showFilters && (
          <div className={`${cardClass} rounded-2xl p-5 mb-6`}>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Tipo</label>
                <select
                  value={filtros.tipo}
                  onChange={(e) => handleFiltroChange('tipo', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border ${inputClass}`}
                >
                  <option value="">Todos</option>
                  <option value="Receita">Receitas</option>
                  <option value="Despesa">Despesas</option>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Categoria</label>
                <select
                  value={filtros.categoria}
                  onChange={(e) => handleFiltroChange('categoria', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border ${inputClass}`}
                >
                  <option value="">Todas</option>
                  <optgroup label="Receitas">
                    {CATEGORIAS_RECEITA.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Despesas">
                    {CATEGORIAS_DESPESA.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Status</label>
                <select
                  value={filtros.statusPagamento}
                  onChange={(e) => handleFiltroChange('statusPagamento', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border ${inputClass}`}
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Data Início</label>
                <input
                  type="date"
                  value={filtros.dataInicio}
                  onChange={(e) => handleFiltroChange('dataInicio', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border ${inputClass}`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Data Fim</label>
                <input
                  type="date"
                  value={filtros.dataFim}
                  onChange={(e) => handleFiltroChange('dataFim', e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border ${inputClass}`}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className={`${cardClass} rounded-2xl overflow-hidden`}>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className={`w-8 h-8 animate-spin ${subTextClass}`} />
            </div>
          ) : transacoes.length === 0 ? (
            <div className="text-center p-12">
              <DollarSign className={`w-12 h-12 mx-auto mb-4 ${subTextClass}`} />
              <p className={textClass}>Nenhuma transação encontrada</p>
              <p className={`text-sm ${subTextClass}`}>Ajuste os filtros ou crie uma nova transação</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'}>
                    <tr>
                      <th className={`px-4 py-3 text-left text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Data</th>
                      <th className={`px-4 py-3 text-left text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Tipo</th>
                      <th className={`px-4 py-3 text-left text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Categoria</th>
                      <th className={`px-4 py-3 text-left text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Descrição</th>
                      <th className={`px-4 py-3 text-left text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Cliente</th>
                      <th className={`px-4 py-3 text-right text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Valor</th>
                      <th className={`px-4 py-3 text-center text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Status</th>
                      <th className={`px-4 py-3 text-center text-xs font-medium ${subTextClass} uppercase tracking-wider`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {transacoes.map((transacao) => (
                      <tr key={transacao._id} className={isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                        <td className={`px-4 py-3 text-sm ${textClass}`}>
                          {DateTime.fromISO(transacao.createdAt).toFormat('dd/MM/yyyy')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            transacao.tipo === 'Receita'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-red-500/10 text-red-500'
                          }`}>
                            {transacao.tipo === 'Receita' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {transacao.tipo}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm ${textClass}`}>{transacao.categoria}</td>
                        <td className={`px-4 py-3 text-sm ${textClass} max-w-xs truncate`}>{transacao.descricao}</td>
                        <td className={`px-4 py-3 text-sm ${subTextClass}`}>{transacao.cliente?.nome || '-'}</td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${
                          transacao.tipo === 'Receita' ? 'text-emerald-500' : 'text-red-500'
                        }`}>
                          {transacao.tipo === 'Receita' ? '+' : '-'}€{transacao.valorFinal?.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                            transacao.statusPagamento === 'Pago' ? 'bg-emerald-500/10 text-emerald-500' :
                            transacao.statusPagamento === 'Pendente' ? 'bg-amber-500/10 text-amber-500' :
                            transacao.statusPagamento === 'Parcial' ? 'bg-blue-500/10 text-blue-500' :
                            'bg-red-500/10 text-red-500'
                          }`}>
                            {transacao.statusPagamento}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleVerDetalhes(transacao)}
                            className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
                            title="Ver detalhes"
                          >
                            <Eye className={`w-4 h-4 ${subTextClass}`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className={`flex items-center justify-between px-4 py-3 border-t ${isDarkMode ? 'border-white/5' : 'border-gray-200'}`}>
                <p className={`text-sm ${subTextClass}`}>
                  Mostrando {transacoes.length} de {paginacao.total} transações
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePaginaChange(paginacao.pagina - 1)}
                    disabled={paginacao.pagina === 1}
                    className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                  >
                    <ChevronLeft className={`w-5 h-5 ${subTextClass}`} />
                  </button>
                  <span className={`text-sm ${textClass}`}>
                    {paginacao.pagina} / {paginacao.totalPaginas}
                  </span>
                  <button
                    onClick={() => handlePaginaChange(paginacao.pagina + 1)}
                    disabled={paginacao.pagina >= paginacao.totalPaginas}
                    className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                  >
                    <ChevronRight className={`w-5 h-5 ${subTextClass}`} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Nova Despesa */}
      {showNovaDespesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${textClass}`}>💸 Nova Despesa</h2>
              <button
                onClick={() => setShowNovaDespesa(false)}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>

            <form onSubmit={handleSalvarDespesa} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Categoria *</label>
                <select
                  value={novaDespesa.categoria}
                  onChange={(e) => setNovaDespesa(prev => ({ ...prev, categoria: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  required
                >
                  {CATEGORIAS_DESPESA.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Valor (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={novaDespesa.valor}
                  onChange={(e) => setNovaDespesa(prev => ({ ...prev, valor: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Descrição *</label>
                <input
                  type="text"
                  value={novaDespesa.descricao}
                  onChange={(e) => setNovaDespesa(prev => ({ ...prev, descricao: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  placeholder="Ex: Óleo de massagem"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Forma de Pagamento</label>
                <select
                  value={novaDespesa.formaPagamento}
                  onChange={(e) => setNovaDespesa(prev => ({ ...prev, formaPagamento: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                >
                  {FORMAS_PAGAMENTO.map(forma => (
                    <option key={forma} value={forma}>{forma}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Observações</label>
                <textarea
                  value={novaDespesa.observacoes}
                  onChange={(e) => setNovaDespesa(prev => ({ ...prev, observacoes: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass} resize-none`}
                  rows="2"
                  placeholder="Observações adicionais..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNovaDespesa(false)}
                  className={`flex-1 px-4 py-3 rounded-xl border ${cardClass} ${textClass} hover:opacity-80 transition-all`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoDespesa}
                  className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {salvandoDespesa ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Registrar Despesa'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes */}
      {showDetalhes && transacaoSelecionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} rounded-2xl w-full max-w-lg p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${textClass}`}>📋 Detalhes da Transação</h2>
              <button
                onClick={() => { setShowDetalhes(false); setTransacaoSelecionada(null); }}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className={subTextClass}>Tipo</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  transacaoSelecionada.transacao?.tipo === 'Receita'
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {transacaoSelecionada.transacao?.tipo}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className={subTextClass}>Categoria</span>
                <span className={textClass}>{transacaoSelecionada.transacao?.categoria}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className={subTextClass}>Valor</span>
                <span className={`text-lg font-bold ${
                  transacaoSelecionada.transacao?.tipo === 'Receita' ? 'text-emerald-500' : 'text-red-500'
                }`}>
                  €{transacaoSelecionada.transacao?.valorFinal?.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className={subTextClass}>Status</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  transacaoSelecionada.transacao?.statusPagamento === 'Pago' ? 'bg-emerald-500/10 text-emerald-500' :
                  transacaoSelecionada.transacao?.statusPagamento === 'Pendente' ? 'bg-amber-500/10 text-amber-500' :
                  'bg-blue-500/10 text-blue-500'
                }`}>
                  {transacaoSelecionada.transacao?.statusPagamento}
                </span>
              </div>

              <div className={`h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`} />

              <div>
                <span className={`block text-sm ${subTextClass} mb-1`}>Descrição</span>
                <p className={textClass}>{transacaoSelecionada.transacao?.descricao}</p>
              </div>

              {transacaoSelecionada.transacao?.cliente && (
                <div>
                  <span className={`block text-sm ${subTextClass} mb-1`}>Cliente</span>
                  <p className={textClass}>{transacaoSelecionada.transacao?.cliente?.nome}</p>
                </div>
              )}

              {transacaoSelecionada.transacao?.observacoes && (
                <div>
                  <span className={`block text-sm ${subTextClass} mb-1`}>Observações</span>
                  <p className={textClass}>{transacaoSelecionada.transacao?.observacoes}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className={subTextClass}>Data</span>
                <span className={textClass}>
                  {DateTime.fromISO(transacaoSelecionada.transacao?.createdAt).toFormat('dd/MM/yyyy HH:mm')}
                </span>
              </div>

              {/* Pagamentos */}
              {transacaoSelecionada.pagamentos?.length > 0 && (
                <div>
                  <span className={`block text-sm ${subTextClass} mb-2`}>Pagamentos</span>
                  <div className="space-y-2">
                    {transacaoSelecionada.pagamentos.map((pag, idx) => (
                      <div key={idx} className={`p-3 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'}`}>
                        <div className="flex justify-between">
                          <span className={subTextClass}>{pag.formaPagamento}</span>
                          <span className={`font-medium ${textClass}`}>€{pag.valor?.toFixed(2)}</span>
                        </div>
                        <span className={`text-xs ${subTextClass}`}>
                          {DateTime.fromISO(pag.dataPagamento).toFormat('dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => { setShowDetalhes(false); setTransacaoSelecionada(null); }}
              className={`w-full mt-6 px-4 py-3 rounded-xl ${cardClass} ${textClass} hover:opacity-80 transition-all`}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transacoes;
