import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Plus, Minus, Lock, Unlock, Loader2, X } from 'lucide-react';

function Caixa() {
  const { isDarkMode } = useTheme();
  const [statusCaixa, setStatusCaixa] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalAbrir, setModalAbrir] = useState(false);
  const [modalFechar, setModalFechar] = useState(false);
  const [modalSangria, setModalSangria] = useState(false);
  const [modalSuprimento, setModalSuprimento] = useState(false);

  // Estados dos formulários
  const [valorInicial, setValorInicial] = useState('');
  const [saldoContado, setSaldoContado] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [valorSangria, setValorSangria] = useState('');
  const [motivoSangria, setMotivoSangria] = useState('');
  const [valorSuprimento, setValorSuprimento] = useState('');
  const [motivoSuprimento, setMotivoSuprimento] = useState('');

  // Theme classes
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border-white/10'
    : 'bg-white border-gray-200';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-indigo-500'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500';
  const modalBg = isDarkMode ? 'bg-slate-800' : 'bg-white';

  const carregarStatusCaixa = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/caixa/status');
      setStatusCaixa(response.data);
    } catch (error) {
      console.error('Erro ao carregar status do caixa:', error);
      toast.error('Erro ao carregar status do caixa');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarStatusCaixa();
  }, []);

  const handleAbrirCaixa = async (e) => {
    e.preventDefault();
    try {
      await api.post('/caixa/abrir', {
        valorInicial: valorInicial ? parseFloat(valorInicial) : 0
      });
      toast.success('Caixa aberto com sucesso!');
      setModalAbrir(false);
      setValorInicial('');
      carregarStatusCaixa();
    } catch (error) {
      console.error('Erro ao abrir caixa:', error);
      toast.error(error.response?.data?.message || 'Erro ao abrir caixa');
    }
  };

  const handleFecharCaixa = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/caixa/fechar', {
        saldoContado: parseFloat(saldoContado),
        observacoes
      });
      toast.success('Caixa fechado com sucesso!');
      setModalFechar(false);
      setSaldoContado('');
      setObservacoes('');
      carregarStatusCaixa();

      if (response.data.fechamento?.diferenca !== 0) {
        const diferenca = response.data.fechamento.diferenca;
        if (diferenca > 0) {
          toast.info(`Diferença positiva de €${diferenca.toFixed(2)}`);
        } else {
          toast.warning(`Diferença negativa de €${Math.abs(diferenca).toFixed(2)}`);
        }
      }
    } catch (error) {
      console.error('Erro ao fechar caixa:', error);
      toast.error(error.response?.data?.message || 'Erro ao fechar caixa');
    }
  };

  const handleRegistrarSangria = async (e) => {
    e.preventDefault();
    try {
      await api.post('/caixa/sangria', {
        valor: parseFloat(valorSangria),
        motivo: motivoSangria
      });
      toast.success('Sangria registrada com sucesso!');
      setModalSangria(false);
      setValorSangria('');
      setMotivoSangria('');
      carregarStatusCaixa();
    } catch (error) {
      console.error('Erro ao registrar sangria:', error);
      toast.error(error.response?.data?.message || 'Erro ao registrar sangria');
    }
  };

  const handleRegistrarSuprimento = async (e) => {
    e.preventDefault();
    try {
      await api.post('/caixa/suprimento', {
        valor: parseFloat(valorSuprimento),
        motivo: motivoSuprimento
      });
      toast.success('Suprimento registrado com sucesso!');
      setModalSuprimento(false);
      setValorSuprimento('');
      setMotivoSuprimento('');
      carregarStatusCaixa();
    } catch (error) {
      console.error('Erro ao registrar suprimento:', error);
      toast.error(error.response?.data?.message || 'Erro ao registrar suprimento');
    }
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen flex justify-center items-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  const caixaAberto = statusCaixa?.status === 'Aberto';

  return (
    <div className={`min-h-screen pt-24 pb-8 px-4 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${textClass} flex items-center gap-3`}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              Controle de Caixa
            </h1>
            <p className={`${subTextClass} mt-1`}>{statusCaixa?.data}</p>
          </div>

          <div className="flex items-center gap-3">
            {caixaAberto ? (
              <>
                <span className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                  <Unlock className="w-4 h-4" />
                  Caixa Aberto
                </span>
                <button
                  onClick={() => setModalFechar(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:opacity-90 transition font-medium shadow-lg shadow-red-500/20"
                >
                  <Lock className="w-4 h-4" />
                  Fechar Caixa
                </button>
              </>
            ) : (
              <>
                <span className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border ${isDarkMode ? 'bg-slate-700/50 border-white/10 text-slate-400' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                  <Lock className="w-4 h-4" />
                  Caixa Fechado
                </span>
                <button
                  onClick={() => setModalAbrir(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition font-medium shadow-lg shadow-indigo-500/20"
                >
                  <Unlock className="w-4 h-4" />
                  Abrir Caixa
                </button>
              </>
            )}
          </div>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className={`rounded-2xl border ${cardClass} p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${subTextClass}`}>Saldo Atual</p>
                <p className={`text-2xl font-bold ${textClass} mt-1`}>
                  €{statusCaixa?.movimentacao?.saldoAtual?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border ${cardClass} p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${subTextClass}`}>Receitas</p>
                <p className="text-2xl font-bold text-emerald-500 mt-1">
                  €{statusCaixa?.movimentacao?.receitas?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border ${cardClass} p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${subTextClass}`}>Despesas</p>
                <p className="text-2xl font-bold text-red-500 mt-1">
                  €{statusCaixa?.movimentacao?.despesas?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border ${cardClass} p-5`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm font-medium ${subTextClass}`}>Pagamentos</p>
                <p className={`text-2xl font-bold ${textClass} mt-1`}>
                  {statusCaixa?.detalhes?.quantidadePagamentos || 0}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        {caixaAberto && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => setModalSangria(true)}
              className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 border-dashed transition-all ${isDarkMode ? 'border-red-500/30 hover:bg-red-500/10 text-slate-300' : 'border-red-200 hover:bg-red-50 text-gray-700'}`}
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <Minus className="w-5 h-5 text-red-500" />
              </div>
              <div className="text-left">
                <p className={`font-semibold ${textClass}`}>Registrar Sangria</p>
                <p className={`text-sm ${subTextClass}`}>Retirada de dinheiro do caixa</p>
              </div>
            </button>

            <button
              onClick={() => setModalSuprimento(true)}
              className={`flex items-center justify-center gap-3 p-5 rounded-2xl border-2 border-dashed transition-all ${isDarkMode ? 'border-emerald-500/30 hover:bg-emerald-500/10 text-slate-300' : 'border-emerald-200 hover:bg-emerald-50 text-gray-700'}`}
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Plus className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="text-left">
                <p className={`font-semibold ${textClass}`}>Registrar Suprimento</p>
                <p className={`text-sm ${subTextClass}`}>Entrada de dinheiro no caixa</p>
              </div>
            </button>
          </div>
        )}

        {/* Totais por Forma de Pagamento */}
        <div className={`rounded-2xl border ${cardClass} p-5`}>
          <h2 className={`text-lg font-semibold ${textClass} mb-4`}>Formas de Pagamento</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${subTextClass}`}>Forma</th>
                  <th className={`text-right py-3 px-4 text-sm font-semibold ${subTextClass}`}>Receitas</th>
                  <th className={`text-right py-3 px-4 text-sm font-semibold ${subTextClass}`}>Despesas</th>
                  <th className={`text-right py-3 px-4 text-sm font-semibold ${subTextClass}`}>Quantidade</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-gray-100'}`}>
                {statusCaixa?.totaisPorForma && Object.entries(statusCaixa.totaisPorForma).map(([forma, dados]) => (
                  <tr key={forma} className={isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}>
                    <td className={`py-3 px-4 font-medium ${textClass}`}>{forma}</td>
                    <td className="py-3 px-4 text-right text-emerald-500 font-semibold">
                      €{dados.receitas?.toFixed(2) || '0.00'}
                    </td>
                    <td className="py-3 px-4 text-right text-red-500 font-semibold">
                      €{dados.despesas?.toFixed(2) || '0.00'}
                    </td>
                    <td className={`py-3 px-4 text-right ${subTextClass}`}>
                      {dados.quantidade}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Abrir Caixa */}
      {modalAbrir && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${modalBg} rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-lg font-semibold ${textClass}`}>Abrir Caixa</h3>
              <button onClick={() => setModalAbrir(false)} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>
            <form onSubmit={handleAbrirCaixa} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>
                  Valor Inicial (Opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorInicial}
                  onChange={(e) => setValorInicial(e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${inputClass}`}
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAbrir(false)}
                  className={`flex-1 px-4 py-3 rounded-xl border ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} transition font-medium`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition font-medium"
                >
                  Abrir Caixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Fechar Caixa */}
      {modalFechar && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${modalBg} rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-lg font-semibold ${textClass}`}>Fechar Caixa</h3>
              <button onClick={() => setModalFechar(false)} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>
            <form onSubmit={handleFecharCaixa} className="space-y-4">
              <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'}`}>
                <p className={`text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  <span className="font-semibold">Saldo Esperado:</span> €{statusCaixa?.movimentacao?.saldoAtual?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>
                  Saldo Contado *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={saldoContado}
                  onChange={(e) => setSaldoContado(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${inputClass}`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>
                  Observações
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows="3"
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none ${inputClass}`}
                  placeholder="Observações sobre o fechamento..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalFechar(false)}
                  className={`flex-1 px-4 py-3 rounded-xl border ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} transition font-medium`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:opacity-90 transition font-medium"
                >
                  Fechar Caixa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sangria */}
      {modalSangria && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${modalBg} rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-lg font-semibold ${textClass}`}>Registrar Sangria</h3>
              <button onClick={() => setModalSangria(false)} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>
            <form onSubmit={handleRegistrarSangria} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorSangria}
                  onChange={(e) => setValorSangria(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 ${inputClass}`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>Motivo *</label>
                <input
                  type="text"
                  value={motivoSangria}
                  onChange={(e) => setMotivoSangria(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 ${inputClass}`}
                  placeholder="Ex: Pagamento de fornecedor"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalSangria(false)}
                  className={`flex-1 px-4 py-3 rounded-xl border ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} transition font-medium`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl hover:opacity-90 transition font-medium"
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Suprimento */}
      {modalSuprimento && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${modalBg} rounded-2xl w-full max-w-md p-6`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-lg font-semibold ${textClass}`}>Registrar Suprimento</h3>
              <button onClick={() => setModalSuprimento(false)} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
                <X className={`w-5 h-5 ${subTextClass}`} />
              </button>
            </div>
            <form onSubmit={handleRegistrarSuprimento} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorSuprimento}
                  onChange={(e) => setValorSuprimento(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${inputClass}`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${subTextClass} mb-1.5`}>Motivo *</label>
                <input
                  type="text"
                  value={motivoSuprimento}
                  onChange={(e) => setMotivoSuprimento(e.target.value)}
                  required
                  className={`w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${inputClass}`}
                  placeholder="Ex: Troco inicial"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalSuprimento(false)}
                  className={`flex-1 px-4 py-3 rounded-xl border ${isDarkMode ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} transition font-medium`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl hover:opacity-90 transition font-medium"
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Caixa;
