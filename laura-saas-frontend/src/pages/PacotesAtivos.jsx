import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { toast } from 'react-toastify';
import {
  Package,
  Plus,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  Loader2,
  ChevronRight,
  X,
  History,
  CalendarPlus,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';

function PacotesAtivos() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDarkMode } = useTheme();

  // Estados
  const [comprasPacotes, setComprasPacotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('Ativo');
  const [alertas, setAlertas] = useState({ expirando: [], poucasSessoes: [] });
  const [highlightedId, setHighlightedId] = useState(null);
  const cardRefs = useRef({});
  
  // Modais
  const [showHistorico, setShowHistorico] = useState(false);
  const [showEstender, setShowEstender] = useState(false);
  const [pacoteSelecionado, setPacoteSelecionado] = useState(null);

  // Estados do modal Estender
  const [diasExtensao, setDiasExtensao] = useState(30);
  const [motivoExtensao, setMotivoExtensao] = useState('');
  const [estendendoPrazo, setEstendendoPrazo] = useState(false);

  // Estados do modal Editar (só correcção de erros — pagamentos têm modal próprio)
  const [showEditar, setShowEditar] = useState(false);
  const [pacoteEditando, setPacoteEditando] = useState(null);
  const [editForm, setEditForm] = useState({
    valorTotal: '',
    sessoesUsadas: 0,
    observacoes: ''
  });
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // Estados do modal Registar Pagamento
  const [showRegistrarPagamento, setShowRegistrarPagamento] = useState(false);
  const [pacotePagamento, setPacotePagamento] = useState(null);
  const [pagamentoForm, setPagamentoForm] = useState({
    valor: '',
    formaPagamento: 'Dinheiro',
    dataPagamento: DateTime.now().setZone('Europe/Lisbon').toFormat('yyyy-MM-dd'),
    observacoes: ''
  });
  const [salvandoPagamento, setSalvandoPagamento] = useState(false);

  // Buscar compras de pacotes
  const fetchComprasPacotes = useCallback(async () => {
    setLoading(true);
    try {
      const [comprasRes, expirandoRes, poucasSessoesRes] = await Promise.all([
        api.get(`/compras-pacotes?status=${filtroStatus}`),
        api.get('/compras-pacotes?expirando=true&dias=7'),
        api.get('/compras-pacotes?poucasSessoes=true&limiteSessoes=2')
      ]);
      
      setComprasPacotes(comprasRes.data.comprasPacotes || []);
      setAlertas({
        expirando: expirandoRes.data.comprasPacotes || [],
        poucasSessoes: poucasSessoesRes.data.comprasPacotes || []
      });
    } catch (error) {
      console.error('Erro ao buscar pacotes:', error);
      toast.error('Erro ao carregar pacotes');
    } finally {
      setLoading(false);
    }
  }, [filtroStatus]);

  useEffect(() => {
    fetchComprasPacotes();
  }, [fetchComprasPacotes]);

  // Scroll + highlight quando a página é aberta com ?id=... (atalho vindo de Transações).
  // Se a venda existe na lista actual, faz scroll suave + ring temporário 3s.
  // Se não existe (filtro de status diferente), faz fallback para "todos" e tenta novamente.
  useEffect(() => {
    if (loading) return;
    const idParam = searchParams.get('id');
    if (!idParam) return;

    const existeNaLista = comprasPacotes.some(c => c._id === idParam);

    if (!existeNaLista) {
      // Pacote pode estar fora do filtro actual (ex: Concluído, Cancelado) — alarga para todos
      if (filtroStatus !== '') {
        setFiltroStatus('');
      }
      return;
    }

    setHighlightedId(idParam);
    // Aguardar paint para garantir que o ref está montado
    requestAnimationFrame(() => {
      const node = cardRefs.current[idParam];
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    const timer = setTimeout(() => {
      setHighlightedId(null);
      // Limpar query param para não voltar a destacar em re-renders
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('id');
      setSearchParams(newParams, { replace: true });
    }, 3000);

    return () => clearTimeout(timer);
  }, [loading, comprasPacotes, searchParams, setSearchParams, filtroStatus]);

  // Handlers
  const handleVerHistorico = (pacote) => {
    setPacoteSelecionado(pacote);
    setShowHistorico(true);
  };

  const handleEstenderPrazo = (pacote) => {
    setPacoteSelecionado(pacote);
    setDiasExtensao(30);
    setMotivoExtensao('');
    setShowEstender(true);
  };

  const handleEditarPacote = (pacote) => {
    setPacoteEditando(pacote);
    setEditForm({
      valorTotal: pacote.valorTotal?.toString() || '',
      sessoesUsadas: pacote.sessoesUsadas || 0,
      observacoes: pacote.observacoes || ''
    });
    setShowEditar(true);
  };

  const handleSalvarEdicao = async () => {
    if (!pacoteEditando) return;

    const valorTotalNum = parseFloat(editForm.valorTotal);
    if (!valorTotalNum || valorTotalNum <= 0) {
      toast.error('Valor total inválido');
      return;
    }

    const payload = {
      valorTotal: valorTotalNum,
      sessoesUsadas: parseInt(editForm.sessoesUsadas) || 0,
      observacoes: editForm.observacoes || ''
    };

    setSalvandoEdicao(true);
    try {
      await api.put(`/compras-pacotes/${pacoteEditando._id}`, payload);
      toast.success('Venda atualizada com sucesso!');
      setShowEditar(false);
      setPacoteEditando(null);
      fetchComprasPacotes();
    } catch (error) {
      console.error('Erro ao editar venda:', error);
      toast.error(error.response?.data?.message || 'Erro ao editar venda');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  // Registar pagamento de parcela (não confundir com edição estrutural)
  const handleAbrirRegistrarPagamento = (pacote) => {
    const sugestao = pacote.valorParcela > 0 && pacote.valorPendente > 0
      ? Math.min(pacote.valorParcela, pacote.valorPendente)
      : pacote.valorPendente || 0;
    setPacotePagamento(pacote);
    setPagamentoForm({
      valor: sugestao > 0 ? sugestao.toFixed(2) : '',
      formaPagamento: 'Dinheiro',
      dataPagamento: DateTime.now().setZone('Europe/Lisbon').toFormat('yyyy-MM-dd'),
      observacoes: ''
    });
    setShowRegistrarPagamento(true);
  };

  const handleSalvarPagamento = async () => {
    if (!pacotePagamento) return;

    const valorNum = parseFloat(pagamentoForm.valor);
    if (!valorNum || valorNum <= 0) {
      toast.error('Valor inválido');
      return;
    }
    if (valorNum > (pacotePagamento.valorPendente || 0) + 0.001) {
      toast.error(`Valor máximo: €${pacotePagamento.valorPendente?.toFixed(2)}`);
      return;
    }

    setSalvandoPagamento(true);
    try {
      await api.post(`/compras-pacotes/${pacotePagamento._id}/registrar-pagamento`, {
        valor: valorNum,
        formaPagamento: pagamentoForm.formaPagamento,
        dataPagamento: pagamentoForm.dataPagamento,
        observacoes: pagamentoForm.observacoes || ''
      });
      toast.success('Pagamento registado!');
      setShowRegistrarPagamento(false);
      setPacotePagamento(null);
      fetchComprasPacotes();
    } catch (error) {
      console.error('Erro ao registar pagamento:', error);
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Erro ao registar pagamento');
    } finally {
      setSalvandoPagamento(false);
    }
  };

  const handleDeletarPacote = async (pacote) => {
    if (!window.confirm(`Tem certeza que deseja deletar o pacote de ${pacote.cliente?.nome}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      await api.delete(`/compras-pacotes/${pacote._id}`);
      toast.success('Pacote deletado com sucesso!');
      fetchComprasPacotes();
    } catch (error) {
      console.error('Erro ao deletar pacote:', error);
      toast.error(error.response?.data?.message || 'Erro ao deletar pacote');
    }
  };

  const handleConfirmarExtensao = async () => {
    if (!pacoteSelecionado) return;
    
    setEstendendoPrazo(true);
    try {
      await api.put(`/compras-pacotes/${pacoteSelecionado._id}/estender-prazo`, {
        dias: diasExtensao,
        motivo: motivoExtensao
      });
      
      toast.success('Prazo estendido com sucesso!');
      setShowEstender(false);
      setPacoteSelecionado(null);
      fetchComprasPacotes();
    } catch (error) {
      console.error('Erro ao estender prazo:', error);
      toast.error('Erro ao estender prazo');
    } finally {
      setEstendendoPrazo(false);
    }
  };

  // Calcular porcentagem de uso
  const calcularPorcentagem = (usadas, total) => {
    if (total === 0) return 0;
    return Math.round((usadas / total) * 100);
  };

  // Estilos condicionais
  const cardClass = isDarkMode 
    ? 'bg-slate-800/50 border border-white/10' 
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';

  // Calcular estatísticas
  const stats = {
    total: comprasPacotes.length,
    valorTotal: comprasPacotes.reduce((sum, c) => sum + (c.valorTotal || 0), 0),
    valorPago: comprasPacotes.reduce((sum, c) => sum + (c.valorPago || 0), 0),
    valorPendente: comprasPacotes.reduce((sum, c) => sum + (c.valorPendente || Math.max(0, (c.valorTotal || 0) - (c.valorPago || 0))), 0),
    sessoesTotais: comprasPacotes.reduce((sum, c) => sum + (c.sessoesRestantes || 0), 0)
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-24 pb-8 px-4`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${textClass}`}>📦 Serviços Ativos</h1>
            <p className={subTextClass}>
              Carteira de pacotes em aberto — todos os tempos.{' '}
              <span className="text-xs italic">
                Para faturação por mês usa <strong>Transações</strong>.
              </span>
            </p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className={`px-4 py-2 rounded-xl border ${inputClass}`}
            >
              <option value="">Todos</option>
              <option value="Ativo">Ativos</option>
              <option value="Concluído">Concluídos</option>
              <option value="Expirado">Expirados</option>
              <option value="Cancelado">Cancelados</option>
            </select>
            <button
              onClick={() => navigate('/vender-pacote')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Vender Serviço
            </button>
          </div>
        </div>

        {/* Estatísticas */}
        {!loading && filtroStatus === 'Ativo' && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className={`${cardClass} rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Package className={`w-4 h-4 ${subTextClass}`} />
                <span className={`text-xs ${subTextClass}`}>Total Ativos</span>
              </div>
              <p className={`text-2xl font-bold ${textClass}`}>{stats.total}</p>
            </div>
            <div className={`${cardClass} rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className={`text-xs ${subTextClass}`}>Sessões Restantes</span>
              </div>
              <p className="text-2xl font-bold text-emerald-500">{stats.sessoesTotais}</p>
            </div>
            <div
              className={`${cardClass} rounded-2xl p-4`}
              title="Soma do valor total de todos os pacotes Activos — independente da data de venda. Para faturação do mês usa Transações."
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${subTextClass}`}>💼 Carteira</span>
              </div>
              <p className={`text-2xl font-bold ${textClass}`}>€{stats.valorTotal.toFixed(2)}</p>
              <p className={`text-[10px] ${subTextClass} mt-1`}>valor total dos activos</p>
            </div>
            <div
              className={`${cardClass} rounded-2xl p-4`}
              title="Total já recebido sobre os pacotes Activos — independente do mês em que entrou."
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${subTextClass}`}>✅ Já recebido</span>
              </div>
              <p className="text-2xl font-bold text-emerald-500">€{stats.valorPago.toFixed(2)}</p>
              <p className={`text-[10px] ${subTextClass} mt-1`}>pagamentos da carteira</p>
            </div>
            <div
              className={`${cardClass} rounded-2xl p-4`}
              title="Total ainda em aberto na carteira — todos os pacotes Activos com saldo pendente, independente do mês de venda."
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${subTextClass}`}>⏳ Em aberto</span>
              </div>
              <p className="text-2xl font-bold text-amber-500">€{stats.valorPendente.toFixed(2)}</p>
              <p className={`text-[10px] ${subTextClass} mt-1`}>parcelas por receber</p>
            </div>
          </div>
        )}

        {/* Alertas */}
        {(alertas.expirando.length > 0 || alertas.poucasSessoes.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {alertas.expirando.length > 0 && (
              <div className={`${cardClass} rounded-2xl p-4 border-l-4 border-l-amber-500`}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Clock className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className={`font-medium ${textClass}`}>
                      {alertas.expirando.length} serviço(s) expirando em 7 dias
                    </h3>
                    <p className={`text-sm ${subTextClass} mt-1`}>
                      {alertas.expirando.slice(0, 3).map(p => p.cliente?.nome).join(', ')}
                      {alertas.expirando.length > 3 && ` e mais ${alertas.expirando.length - 3}...`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {alertas.poucasSessoes.length > 0 && (
              <div className={`${cardClass} rounded-2xl p-4 border-l-4 border-l-red-500`}>
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className={`font-medium ${textClass}`}>
                      {alertas.poucasSessoes.length} serviço(s) com poucas sessões
                    </h3>
                    <p className={`text-sm ${subTextClass} mt-1`}>
                      {alertas.poucasSessoes.slice(0, 3).map(p => `${p.cliente?.nome} (${p.sessoesRestantes})`).join(', ')}
                      {alertas.poucasSessoes.length > 3 && ` e mais ${alertas.poucasSessoes.length - 3}...`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Lista de Pacotes */}
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className={`w-8 h-8 animate-spin ${subTextClass}`} />
          </div>
        ) : comprasPacotes.length === 0 ? (
          <div className={`${cardClass} rounded-2xl p-12 text-center`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${subTextClass}`} />
            <p className={textClass}>Nenhum serviço encontrado</p>
            <p className={`text-sm ${subTextClass}`}>
              {filtroStatus === 'Ativo' 
                ? 'Venda um novo serviço para começar' 
                : `Nenhum serviço com status "${filtroStatus}"`
              }
            </p>
            <button
              onClick={() => navigate('/vender-pacote')}
              className="mt-4 px-6 py-2 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all"
            >
              Vender Pacote
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comprasPacotes.map((compra) => {
              const porcentagem = calcularPorcentagem(compra.sessoesUsadas, compra.sessoesContratadas);
              const isExpirando = compra.dataExpiracao && 
                DateTime.fromISO(compra.dataExpiracao) <= DateTime.now().plus({ days: 7 });
              const isPoucasSessoes = compra.sessoesRestantes <= 2;
              
              return (
                <div
                  key={compra._id}
                  ref={(el) => { cardRefs.current[compra._id] = el; }}
                  className={`${cardClass} rounded-2xl p-5 transition-all duration-500 ${
                    highlightedId === compra._id
                      ? 'ring-4 ring-indigo-500 shadow-2xl shadow-indigo-500/30 scale-[1.02]'
                      : isExpirando || isPoucasSessoes
                      ? 'ring-2 ring-amber-500/50'
                      : ''
                  }`}
                >
                  {/* Cliente e Pacote */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <User className={`w-4 h-4 ${subTextClass}`} />
                        <span className={`font-medium ${textClass}`}>{compra.cliente?.nome}</span>
                      </div>
                      <p className={`text-sm ${subTextClass}`}>{compra.pacote?.nome}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        compra.status === 'Ativo' ? 'bg-emerald-500/10 text-emerald-500' :
                        compra.status === 'Concluído' ? 'bg-blue-500/10 text-blue-500' :
                        compra.status === 'Expirado' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-red-500/10 text-red-500'
                      }`}>
                        {compra.status}
                      </span>
                      <button
                        onClick={() => handleEditarPacote(compra)}
                        className={`p-1.5 rounded-lg ${
                          isDarkMode ? 'hover:bg-indigo-500/10' : 'hover:bg-indigo-50'
                        } text-indigo-500 transition-colors`}
                        title="Editar venda"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeletarPacote(compra)}
                        className={`p-1.5 rounded-lg ${
                          isDarkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
                        } text-red-500 transition-colors`}
                        title="Deletar serviço"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Barra de Progresso */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className={subTextClass}>Sessões usadas</span>
                      <span className={textClass}>{compra.sessoesUsadas}/{compra.sessoesContratadas}</span>
                    </div>
                    <div className={`h-3 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`}>
                      <div 
                        className={`h-full rounded-full transition-all ${
                          porcentagem >= 80 ? 'bg-red-500' :
                          porcentagem >= 50 ? 'bg-amber-500' :
                          'bg-emerald-500'
                        }`}
                        style={{ width: `${porcentagem}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className={`${isPoucasSessoes ? 'text-amber-500 font-medium' : subTextClass}`}>
                        {compra.sessoesRestantes} restantes
                      </span>
                      <span className={subTextClass}>{porcentagem}% usado</span>
                    </div>
                  </div>

                  {/* Validade */}
                  {compra.dataExpiracao && (
                    <div className={`flex items-center gap-2 mb-4 p-2 rounded-lg ${
                      isExpirando 
                        ? 'bg-amber-500/10 text-amber-500' 
                        : isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'
                    }`}>
                      <Calendar className="w-4 h-4" />
                      <span className={`text-sm ${isExpirando ? '' : subTextClass}`}>
                        {isExpirando ? 'Expira' : 'Válido até'} {DateTime.fromISO(compra.dataExpiracao).toFormat('dd/MM/yyyy')}
                      </span>
                    </div>
                  )}

                  {/* Valor */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className={`text-xs ${subTextClass}`}>Valor total</span>
                      <p className={`font-bold ${textClass}`}>€{compra.valorTotal?.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs ${subTextClass}`}>Pago</span>
                      <p className={`font-medium ${
                        compra.valorPago >= compra.valorTotal ? 'text-emerald-500' : 'text-amber-500'
                      }`}>
                        €{compra.valorPago?.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="space-y-2">
                    {compra.status === 'Ativo' && compra.sessoesRestantes > 0 && (
                      <button
                        onClick={() => navigate('/criar-agendamento', { state: { clienteId: compra.cliente?._id } })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all text-sm font-medium"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        Agendar Sessão
                      </button>
                    )}
                    {compra.status !== 'Cancelado' && compra.valorPendente > 0 && (
                      <>
                        <button
                          onClick={() => handleAbrirRegistrarPagamento(compra)}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white border border-red-500 transition-all text-sm font-semibold shadow-lg shadow-red-500/25"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Registar Pagamento (€{compra.valorPendente?.toFixed(2)} pendente)
                        </button>
                        {compra.dataProximaParcela && (
                          <p className={`text-xs ${subTextClass} text-center`}>
                            🔔 Próxima parcela: {DateTime.fromISO(compra.dataProximaParcela).setZone('Europe/Lisbon').toFormat('dd/MM/yyyy')}
                          </p>
                        )}
                      </>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVerHistorico(compra)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl ${
                          isDarkMode ? 'bg-slate-700/50 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200'
                        } ${subTextClass} transition-colors text-sm`}
                      >
                        <History className="w-4 h-4" />
                        Histórico
                      </button>
                      {compra.status === 'Ativo' && compra.dataExpiracao && (
                        <button
                          onClick={() => handleEstenderPrazo(compra)}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors text-sm"
                        >
                          <Clock className="w-4 h-4" />
                          Estender
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Histórico */}
      {showHistorico && pacoteSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} rounded-2xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${textClass}`}>📋 Histórico de Uso</h2>
              <button
                onClick={() => { setShowHistorico(false); setPacoteSelecionado(null); }}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>

            {/* Info do pacote */}
            <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'} mb-4`}>
              <p className={`font-medium ${textClass}`}>{pacoteSelecionado.cliente?.nome}</p>
              <p className={`text-sm ${subTextClass}`}>{pacoteSelecionado.pacote?.nome}</p>
              <div className="flex justify-between mt-2 text-sm">
                <span className={subTextClass}>Sessões: {pacoteSelecionado.sessoesUsadas}/{pacoteSelecionado.sessoesContratadas}</span>
                <span className={subTextClass}>Compra: {DateTime.fromISO(pacoteSelecionado.dataCompra).toFormat('dd/MM/yyyy')}</span>
              </div>
            </div>

            {/* Lista de sessões usadas */}
            {pacoteSelecionado.historico?.length > 0 ? (
              <div className="space-y-3">
                {pacoteSelecionado.historico.map((sessao, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? 'bg-slate-700/30' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-500 font-bold text-sm">
                      {sessao.numeroDaSessao}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm ${textClass}`}>
                        Sessão #{sessao.numeroDaSessao}
                      </p>
                      <p className={`text-xs ${subTextClass}`}>
                        {DateTime.fromISO(sessao.dataSessao).toFormat('dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                    <span className={`text-sm font-medium ${textClass}`}>
                      €{sessao.valorCobrado?.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <History className={`w-8 h-8 mx-auto mb-2 ${subTextClass}`} />
                <p className={subTextClass}>Nenhuma sessão utilizada ainda</p>
              </div>
            )}

            {/* Extensões de prazo */}
            {pacoteSelecionado.extensoes?.length > 0 && (
              <div className="mt-6">
                <h3 className={`text-sm font-medium ${subTextClass} mb-3`}>Extensões de Prazo</h3>
                <div className="space-y-2">
                  {pacoteSelecionado.extensoes.map((ext, idx) => (
                    <div 
                      key={idx}
                      className={`p-3 rounded-xl ${isDarkMode ? 'bg-slate-700/30' : 'bg-gray-50'}`}
                    >
                      <div className="flex justify-between text-sm">
                        <span className={subTextClass}>
                          {DateTime.fromISO(ext.dataAnterior).toFormat('dd/MM')} → {DateTime.fromISO(ext.novaData).toFormat('dd/MM/yyyy')}
                        </span>
                        <span className={`text-xs ${subTextClass}`}>
                          {DateTime.fromISO(ext.createdAt).toFormat('dd/MM/yyyy')}
                        </span>
                      </div>
                      {ext.motivo && <p className={`text-xs ${subTextClass} mt-1`}>{ext.motivo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setShowHistorico(false); setPacoteSelecionado(null); }}
              className={`w-full mt-6 px-4 py-3 rounded-xl ${cardClass} ${textClass} hover:opacity-80 transition-all`}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal Estender Prazo */}
      {showEstender && pacoteSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${textClass}`}>📅 Estender Prazo</h2>
              <button
                onClick={() => { setShowEstender(false); setPacoteSelecionado(null); }}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>

            {/* Info atual */}
            <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'} mb-4`}>
              <p className={`font-medium ${textClass}`}>{pacoteSelecionado.cliente?.nome}</p>
              <p className={`text-sm ${subTextClass}`}>{pacoteSelecionado.pacote?.nome}</p>
              <p className={`text-sm ${subTextClass} mt-2`}>
                Expira em: {DateTime.fromISO(pacoteSelecionado.dataExpiracao).toFormat('dd/MM/yyyy')}
              </p>
            </div>

            {/* Formulário */}
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Dias a estender</label>
                <input
                  type="number"
                  value={diasExtensao}
                  onChange={(e) => setDiasExtensao(parseInt(e.target.value) || 0)}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  min="1"
                  max="365"
                />
                <p className={`text-xs ${subTextClass} mt-1`}>
                  Nova data: {DateTime.fromISO(pacoteSelecionado.dataExpiracao).plus({ days: diasExtensao }).toFormat('dd/MM/yyyy')}
                </p>
              </div>

              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Motivo (opcional)</label>
                <textarea
                  value={motivoExtensao}
                  onChange={(e) => setMotivoExtensao(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass} resize-none`}
                  rows="2"
                  placeholder="Ex: Férias do cliente, doença..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEstender(false); setPacoteSelecionado(null); }}
                className={`flex-1 px-4 py-3 rounded-xl border ${cardClass} ${textClass} hover:opacity-80 transition-all`}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarExtensao}
                disabled={estendendoPrazo || diasExtensao <= 0}
                className="flex-1 px-4 py-3 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {estendendoPrazo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Confirmar Extensão'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Venda */}
      {showEditar && pacoteEditando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${textClass}`}>✏️ Editar Venda</h2>
              <button
                onClick={() => { setShowEditar(false); setPacoteEditando(null); }}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>

            {/* Info (read-only) */}
            <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'} mb-4 text-sm`}>
              <p className={`font-medium ${textClass}`}>{pacoteEditando.cliente?.nome}</p>
              <p className={subTextClass}>{pacoteEditando.pacote?.nome}</p>
              <div className={`h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'} my-2`} />
              <div className="flex justify-between">
                <span className={subTextClass}>Já pago:</span>
                <span className="font-medium text-emerald-500">€{(pacoteEditando.valorPago || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className={subTextClass}>Pendente:</span>
                <span className={`font-medium ${pacoteEditando.valorPendente > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  €{(pacoteEditando.valorPendente || 0).toFixed(2)}
                </span>
              </div>
              <p className={`text-xs mt-2 ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`}>
                ⓘ Este ecrã serve apenas para corrigir erros de registo (valor total, sessões). Para registar um pagamento de parcela, fecha este modal e usa o botão <strong>Registar Pagamento</strong> na lista.
              </p>
            </div>

            <div className="space-y-4">
              {/* Valor total */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Valor total (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.valorTotal}
                  onChange={(e) => setEditForm(prev => ({ ...prev, valorTotal: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  placeholder="0.00"
                />
              </div>

              {/* Sessões já usadas */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Sessões já realizadas</label>
                <input
                  type="number"
                  min="0"
                  max={pacoteEditando.sessoesContratadas}
                  value={editForm.sessoesUsadas}
                  onChange={(e) => setEditForm(prev => ({ ...prev, sessoesUsadas: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                />
                <p className={`text-xs ${subTextClass} mt-1`}>
                  Contratadas: {pacoteEditando.sessoesContratadas}
                </p>
              </div>

              {/* Observações */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>Observações</label>
                <textarea
                  rows={3}
                  value={editForm.observacoes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, observacoes: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  placeholder="Notas internas..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEditar(false); setPacoteEditando(null); }}
                className={`flex-1 px-4 py-3 rounded-xl border ${cardClass} ${textClass} hover:opacity-80 transition-all`}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarEdicao}
                disabled={salvandoEdicao}
                className="flex-1 px-4 py-3 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvandoEdicao ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Alterações'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registar Pagamento de Parcela */}
      {showRegistrarPagamento && pacotePagamento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${cardClass} rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${textClass}`}>💰 Registar Pagamento</h2>
              <button
                onClick={() => { setShowRegistrarPagamento(false); setPacotePagamento(null); }}
                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
              >
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>

            {/* Resumo */}
            <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'} mb-4 text-sm`}>
              <p className={`font-medium ${textClass}`}>{pacotePagamento.cliente?.nome}</p>
              <p className={subTextClass}>{pacotePagamento.pacote?.nome}</p>
              <div className={`h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'} my-2`} />
              <div className="flex justify-between">
                <span className={subTextClass}>Já pago:</span>
                <span className="font-medium text-emerald-500">€{(pacotePagamento.valorPago || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className={subTextClass}>Pendente:</span>
                <span className="font-medium text-amber-500">€{(pacotePagamento.valorPendente || 0).toFixed(2)}</span>
              </div>
              {pacotePagamento.parcelado && (
                <div className="flex justify-between mt-1">
                  <span className={subTextClass}>Parcelas:</span>
                  <span className={`font-medium ${textClass}`}>
                    {pacotePagamento.parcelasPagas || 0} de {pacotePagamento.numeroParcelas} pagas
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Valor */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                  Valor recebido (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={pacotePagamento.valorPendente}
                  value={pagamentoForm.valor}
                  onChange={(e) => setPagamentoForm(prev => ({ ...prev, valor: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  placeholder="0.00"
                  autoFocus
                />
                {pacotePagamento.valorParcela > 0 && (
                  <p className={`text-xs ${subTextClass} mt-1`}>
                    Parcela sugerida: €{pacotePagamento.valorParcela.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Forma de pagamento */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                  Forma de pagamento *
                </label>
                <select
                  value={pagamentoForm.formaPagamento}
                  onChange={(e) => setPagamentoForm(prev => ({ ...prev, formaPagamento: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                >
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="MBWay">MBWay</option>
                  <option value="Multibanco">Multibanco</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Transferência">Transferência</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              {/* Data */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                  Data do pagamento
                </label>
                <input
                  type="date"
                  value={pagamentoForm.dataPagamento}
                  onChange={(e) => setPagamentoForm(prev => ({ ...prev, dataPagamento: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                />
              </div>

              {/* Observações */}
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                  Observações
                </label>
                <input
                  type="text"
                  value={pagamentoForm.observacoes}
                  onChange={(e) => setPagamentoForm(prev => ({ ...prev, observacoes: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  placeholder="Ex: 2ª parcela"
                />
              </div>

              {/* Atalho: pagar tudo */}
              {pacotePagamento.valorPendente > 0 && (
                <button
                  type="button"
                  onClick={() => setPagamentoForm(prev => ({ ...prev, valor: pacotePagamento.valorPendente.toFixed(2) }))}
                  className={`w-full text-sm py-2 rounded-xl border ${isDarkMode ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-50'} transition-colors`}
                >
                  Pagar restante (€{pacotePagamento.valorPendente.toFixed(2)})
                </button>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowRegistrarPagamento(false); setPacotePagamento(null); }}
                className={`flex-1 px-4 py-3 rounded-xl border ${cardClass} ${textClass} hover:opacity-80 transition-all`}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarPagamento}
                disabled={salvandoPagamento || !pagamentoForm.valor}
                className="flex-1 px-4 py-3 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {salvandoPagamento ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    A registar...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Registar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PacotesAtivos;
