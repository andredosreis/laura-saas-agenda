import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { isDarkMode } = useTheme();
  
  // Estados
  const [comprasPacotes, setComprasPacotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('Ativo');
  const [alertas, setAlertas] = useState({ expirando: [], poucasSessoes: [] });
  
  // Modais
  const [showHistorico, setShowHistorico] = useState(false);
  const [showEstender, setShowEstender] = useState(false);
  const [pacoteSelecionado, setPacoteSelecionado] = useState(null);
  
  // Estados do modal Estender
  const [diasExtensao, setDiasExtensao] = useState(30);
  const [motivoExtensao, setMotivoExtensao] = useState('');
  const [estendendoPrazo, setEstendendoPrazo] = useState(false);

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
    : 'bg-white border border-gray-200 shadow-sm';
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
    sessoesTotais: comprasPacotes.reduce((sum, c) => sum + (c.sessoesRestantes || 0), 0)
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-24 pb-8 px-4`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${textClass}`}>📦 Pacotes Ativos</h1>
            <p className={subTextClass}>Gerencie os pacotes vendidos aos clientes</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className={`px-4 py-2 rounded-xl border ${inputClass}`}
            >
              <option value="Ativo">Ativos</option>
              <option value="Concluído">Concluídos</option>
              <option value="Expirado">Expirados</option>
              <option value="Cancelado">Cancelados</option>
            </select>
            <button
              onClick={() => navigate('/vender-pacote')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" />
              Vender Pacote
            </button>
          </div>
        </div>

        {/* Estatísticas */}
        {!loading && filtroStatus === 'Ativo' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <div className={`${cardClass} rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${subTextClass}`}>💰 Total Vendido</span>
              </div>
              <p className={`text-2xl font-bold ${textClass}`}>€{stats.valorTotal.toFixed(2)}</p>
            </div>
            <div className={`${cardClass} rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs ${subTextClass}`}>✅ Pago</span>
              </div>
              <p className="text-2xl font-bold text-emerald-500">€{stats.valorPago.toFixed(2)}</p>
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
                      {alertas.expirando.length} pacote(s) expirando em 7 dias
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
                      {alertas.poucasSessoes.length} pacote(s) com poucas sessões
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
            <p className={textClass}>Nenhum pacote encontrado</p>
            <p className={`text-sm ${subTextClass}`}>
              {filtroStatus === 'Ativo' 
                ? 'Venda um novo pacote para começar' 
                : `Nenhum pacote com status "${filtroStatus}"`
              }
            </p>
            <button
              onClick={() => navigate('/vender-pacote')}
              className="mt-4 px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all"
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
                  className={`${cardClass} rounded-2xl p-5 ${
                    isExpirando || isPoucasSessoes ? 'ring-2 ring-amber-500/50' : ''
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
                        onClick={() => handleDeletarPacote(compra)}
                        className={`p-1.5 rounded-lg ${
                          isDarkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
                        } text-red-500 transition-colors`}
                        title="Deletar pacote"
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
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-all text-sm font-medium"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        Agendar Sessão
                      </button>
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
                className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
    </div>
  );
}

export default PacotesAtivos;
