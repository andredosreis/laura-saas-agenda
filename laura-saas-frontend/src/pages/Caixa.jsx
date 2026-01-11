import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../services/api';
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Plus, Minus, Lock, Unlock } from 'lucide-react';

function Caixa() {
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

      // Mostrar diferença se houver
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
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const caixaAberto = statusCaixa?.status === 'Aberto';

  return (
    <div className="container mx-auto px-4 py-8 pt-24">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Controle de Caixa</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{statusCaixa?.data}</p>
        </div>

        <div className="flex items-center gap-3">
          {caixaAberto ? (
            <>
              <span className="flex items-center gap-2 px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-lg font-medium border-2 border-green-300 dark:border-green-700">
                <Unlock className="w-5 h-5" />
                <span className="font-bold">Caixa Aberto</span>
              </span>
              <button
                onClick={() => setModalFechar(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold shadow-lg shadow-red-500/30 border-2 border-red-700"
              >
                <Lock className="w-5 h-5" />
                Fechar Caixa
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium border-2 border-gray-400 dark:border-gray-600">
                <Lock className="w-5 h-5" />
                <span className="font-bold">Caixa Fechado</span>
              </span>
              <button
                onClick={() => setModalAbrir(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-bold shadow-lg shadow-indigo-500/30 border-2 border-indigo-700"
              >
                <Unlock className="w-5 h-5" />
                Abrir Caixa
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">Saldo Atual</span>
            <DollarSign className="w-5 h-5 text-primary-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            €{statusCaixa?.movimentacao?.saldoAtual?.toFixed(2) || '0.00'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">Receitas</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-green-600">
            €{statusCaixa?.movimentacao?.receitas?.toFixed(2) || '0.00'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">Despesas</span>
            <TrendingDown className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-3xl font-bold text-red-600">
            €{statusCaixa?.movimentacao?.despesas?.toFixed(2) || '0.00'}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">Pagamentos</span>
            <AlertCircle className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {statusCaixa?.detalhes?.quantidadePagamentos || 0}
          </p>
        </div>
      </div>

      {/* Botões de Ação */}
      {caixaAberto && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setModalSangria(true)}
            className="flex items-center justify-center gap-3 p-6 bg-white dark:bg-gray-800 border-2 border-dashed border-red-300 dark:border-red-700 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            <Minus className="w-6 h-6 text-red-600" />
            <div className="text-left">
              <p className="font-semibold text-gray-900 dark:text-white">Registrar Sangria</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Retirada de dinheiro do caixa</p>
            </div>
          </button>

          <button
            onClick={() => setModalSuprimento(true)}
            className="flex items-center justify-center gap-3 p-6 bg-white dark:bg-gray-800 border-2 border-dashed border-green-300 dark:border-green-700 rounded-xl hover:bg-green-50 dark:hover:bg-green-900/20 transition"
          >
            <Plus className="w-6 h-6 text-green-600" />
            <div className="text-left">
              <p className="font-semibold text-gray-900 dark:text-white">Registrar Suprimento</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Entrada de dinheiro no caixa</p>
            </div>
          </button>
        </div>
      )}

      {/* Totais por Forma de Pagamento */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Formas de Pagamento</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Forma</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Receitas</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Despesas</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {statusCaixa?.totaisPorForma && Object.entries(statusCaixa.totaisPorForma).map(([forma, dados]) => (
                <tr key={forma} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{forma}</td>
                  <td className="py-3 px-4 text-right text-green-600 font-semibold">
                    €{dados.receitas?.toFixed(2) || '0.00'}
                  </td>
                  <td className="py-3 px-4 text-right text-red-600 font-semibold">
                    €{dados.despesas?.toFixed(2) || '0.00'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">
                    {dados.quantidade}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Abrir Caixa */}
      {modalAbrir && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Abrir Caixa</h3>
            <form onSubmit={handleAbrirCaixa}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor Inicial (Opcional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorInicial}
                  onChange={(e) => setValorInicial(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalAbrir(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Fechar Caixa</h3>
            <form onSubmit={handleFecharCaixa}>
              <div className="mb-4">
                <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg mb-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <span className="font-semibold">Saldo Esperado:</span> €{statusCaixa?.movimentacao?.saldoAtual?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Saldo Contado *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={saldoContado}
                  onChange={(e) => setSaldoContado(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Observações sobre o fechamento..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalFechar(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Registrar Sangria</h3>
            <form onSubmit={handleRegistrarSangria}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorSangria}
                  onChange={(e) => setValorSangria(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Motivo *
                </label>
                <input
                  type="text"
                  value={motivoSangria}
                  onChange={(e) => setMotivoSangria(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: Pagamento de fornecedor"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalSangria(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Registrar Suprimento</h3>
            <form onSubmit={handleRegistrarSuprimento}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorSuprimento}
                  onChange={(e) => setValorSuprimento(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Motivo *
                </label>
                <input
                  type="text"
                  value={motivoSuprimento}
                  onChange={(e) => setMotivoSuprimento(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Ex: Troco inicial"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setModalSuprimento(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
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
