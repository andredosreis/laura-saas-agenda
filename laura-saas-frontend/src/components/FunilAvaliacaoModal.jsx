import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { UserCheck, UserX, CheckCircle, XCircle, X, ArrowRight, Loader2, ShoppingBag } from 'lucide-react';
import api from '../services/api';

function FunilAvaliacaoModal({ isOpen, agendamento, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 3: Dados da venda
  const [pacotes, setPacotes] = useState([]);
  const [loadingPacotes, setLoadingPacotes] = useState(false);
  const [vendaForm, setVendaForm] = useState({
    pacoteId: '',
    valorPersonalizado: '',
    formaPagamento: 'Dinheiro'
  });
  const [clienteCriado, setClienteCriado] = useState(null);
  const [registrandoVenda, setRegistrandoVenda] = useState(false);

  // Quando o modal abre, posiciona no passo correcto:
  // se já compareceu → começa no passo 2 directamente
  useEffect(() => {
    if (isOpen && agendamento) {
      setStep(agendamento.compareceu === true ? 2 : 1);
      setClienteCriado(null);
      setVendaForm({ pacoteId: '', valorPersonalizado: '', formaPagamento: 'Dinheiro' });
    }
  }, [isOpen, agendamento?._id]);

  if (!isOpen || !agendamento) return null;

  const nomeCliente =
    agendamento.lead?.nome ||
    agendamento.cliente?.nome ||
    agendamento.lead?.telefone ||
    'Cliente sem nome';

  const handleComparecimento = async (compareceu) => {
    setIsLoading(true);
    try {
      await api.patch(`/agendamentos/${agendamento._id}/comparecimento`, { compareceu });
      if (compareceu) {
        setStep(2);
      } else {
        toast.info(`Registado: ${nomeCliente} não compareceu.`);
        onSuccess();
        handleClose();
      }
    } catch {
      toast.error('Erro ao registar comparecimento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFecharPacote = async (fechou) => {
    setIsLoading(true);
    try {
      const res = await api.post(`/agendamentos/${agendamento._id}/fechar-pacote`, { fechou });
      if (fechou) {
        const cliente = res.data?.clienteCriado;
        if (cliente) {
          setClienteCriado(cliente);
          toast.success(`Cliente "${cliente.nome}" criado!`);
        } else {
          // Cliente já existia (obtém do agendamento atualizado)
          setClienteCriado({
            _id: res.data?.data?.cliente || res.data?.data?.clienteConvertido,
            nome: nomeCliente
          });
        }
        // Carregar pacotes para o passo 3
        await carregarPacotes();
        setStep(3);
      } else {
        toast.info('Avaliação encerrada — sem pacote fechado.');
        onSuccess();
        handleClose();
      }
    } catch {
      toast.error('Erro ao registar encerramento');
    } finally {
      setIsLoading(false);
    }
  };

  const carregarPacotes = async () => {
    setLoadingPacotes(true);
    try {
      const res = await api.get('/pacotes');
      const pacotesAtivos = (res.data?.data || []).filter(p => p.ativo);
      setPacotes(pacotesAtivos);
    } catch {
      toast.error('Erro ao carregar serviços');
    } finally {
      setLoadingPacotes(false);
    }
  };

  const pacoteSelecionado = pacotes.find(p => p._id === vendaForm.pacoteId);
  const valorFinal = vendaForm.valorPersonalizado
    ? parseFloat(vendaForm.valorPersonalizado)
    : (pacoteSelecionado?.valor || 0);

  const handleRegistrarVenda = async () => {
    if (!vendaForm.pacoteId) {
      toast.error('Selecione um serviço/pacote');
      return;
    }

    const clienteId = clienteCriado?._id;
    if (!clienteId) {
      toast.error('Erro: cliente não identificado');
      return;
    }

    setRegistrandoVenda(true);
    try {
      await api.post('/compras-pacotes', {
        clienteId,
        pacoteId: vendaForm.pacoteId,
        diasValidade: null, // sem validade
        parcelado: false,
        numeroParcelas: 1,
        valorPago: valorFinal,
        formaPagamento: vendaForm.formaPagamento,
        sessoesUsadas: 0,
        valorTotal: valorFinal
      });

      toast.success(`Venda registada! ${clienteCriado?.nome} — €${valorFinal.toFixed(2)}`);
      onSuccess();
      handleClose();
      // Redirecionar para vendas para ver o registo
      navigate('/pacotes-ativos');
    } catch (err) {
      console.error('Erro ao registar venda:', err);
      toast.error(err.response?.data?.message || 'Erro ao registar venda');
    } finally {
      setRegistrandoVenda(false);
    }
  };

  const handlePularVenda = () => {
    toast.info('Pode registar a venda mais tarde em Finanças → Vendas.');
    onSuccess();
    handleClose();
  };

  const handleClose = () => {
    setStep(1);
    setClienteCriado(null);
    setVendaForm({ pacoteId: '', valorPersonalizado: '', formaPagamento: 'Dinheiro' });
    onClose();
  };

  const FORMAS_PAGAMENTO = [
    { value: 'Dinheiro', label: '💵 Dinheiro' },
    { value: 'MBWay', label: '📱 MBWay' },
    { value: 'Multibanco', label: '🏧 Multibanco' },
    { value: 'Cartão de Débito', label: '💳 Cartão de Débito' },
    { value: 'Cartão de Crédito', label: '💳 Cartão de Crédito' },
    { value: 'Transferência Bancária', label: '🏦 Transferência' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-0.5">
              Funil de Avaliação
            </p>
            <h2 className="text-lg font-bold text-gray-800">{nomeCliente}</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isLoading || registrandoVenda}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-5 pt-4">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 1 ? 'text-amber-600' : 'text-gray-400'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>1</div>
            Presença
          </div>
          <ArrowRight className="w-3 h-3 text-gray-300" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 2 ? 'text-amber-600' : 'text-gray-400'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step >= 2 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>2</div>
            Encerramento
          </div>
          <ArrowRight className="w-3 h-3 text-gray-300" />
          <div className={`flex items-center gap-1.5 text-xs font-medium ${step >= 3 ? 'text-emerald-600' : 'text-gray-400'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step >= 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>3</div>
            Venda
          </div>
        </div>

        <div className="p-5">
          {/* Step 1: Comparecimento */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                <span className="font-semibold text-gray-800">{nomeCliente}</span> compareceu à avaliação?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleComparecimento(true)}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50"
                >
                  <UserCheck className="w-8 h-8 text-green-600" />
                  <span className="font-semibold text-green-700 text-sm">Compareceu</span>
                </button>
                <button
                  onClick={() => handleComparecimento(false)}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-400 transition-all disabled:opacity-50"
                >
                  <UserX className="w-8 h-8 text-red-500" />
                  <span className="font-semibold text-red-600 text-sm">Não Compareceu</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Fechar pacote */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm">
                <span className="font-semibold text-gray-800">{nomeCliente}</span> fechou algum pacote?
              </p>

              {agendamento.tipo === 'Avaliacao' && !agendamento.cliente && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-blue-500 mt-0.5">ℹ️</span>
                  <p className="text-xs text-blue-700">
                    Se fechar, o lead será registado automaticamente como cliente e poderá registar a venda no passo seguinte.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleFecharPacote(true)}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-400 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <span className="font-semibold text-green-700 text-sm">Fechou Pacote</span>
                </button>
                <button
                  onClick={() => handleFecharPacote(false)}
                  disabled={isLoading}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-all disabled:opacity-50"
                >
                  <XCircle className="w-8 h-8 text-gray-500" />
                  <span className="font-semibold text-gray-600 text-sm">Não Fechou</span>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Registar Venda */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Resumo do cliente */}
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-800 text-sm">Registar Venda</p>
                  <p className="text-xs text-emerald-600">
                    Cliente: <span className="font-medium">{clienteCriado?.nome || nomeCliente}</span>
                  </p>
                </div>
              </div>

              {loadingPacotes ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <>
                  {/* Selecionar serviço */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tipo de Massagem / Serviço *
                    </label>
                    <select
                      value={vendaForm.pacoteId}
                      onChange={(e) => setVendaForm(prev => ({
                        ...prev,
                        pacoteId: e.target.value,
                        valorPersonalizado: ''
                      }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">Selecione o serviço</option>
                      {pacotes.map(p => (
                        <option key={p._id} value={p._id}>
                          {p.nome} — {p.sessoes} sessões — €{p.valor?.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Valor */}
                  {pacoteSelecionado && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Valor (€)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={vendaForm.valorPersonalizado || pacoteSelecionado.valor}
                        onChange={(e) => setVendaForm(prev => ({ ...prev, valorPersonalizado: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder={pacoteSelecionado.valor?.toFixed(2)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Preço padrão: €{pacoteSelecionado.valor?.toFixed(2)} • {pacoteSelecionado.sessoes} sessões
                      </p>
                    </div>
                  )}

                  {/* Forma de pagamento */}
                  {pacoteSelecionado && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Forma de Pagamento
                      </label>
                      <select
                        value={vendaForm.formaPagamento}
                        onChange={(e) => setVendaForm(prev => ({ ...prev, formaPagamento: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      >
                        {FORMAS_PAGAMENTO.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Resumo da venda */}
                  {pacoteSelecionado && (
                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Cliente:</span>
                        <span className="font-medium text-gray-800">{clienteCriado?.nome || nomeCliente}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Serviço:</span>
                        <span className="font-medium text-gray-800">{pacoteSelecionado.nome}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Valor:</span>
                        <span className="font-bold text-emerald-600 text-base">€{valorFinal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Botões */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleRegistrarVenda}
                      disabled={registrandoVenda || !vendaForm.pacoteId}
                      className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm transition-all disabled:opacity-50"
                    >
                      {registrandoVenda ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Registar Venda
                    </button>
                    <button
                      onClick={handlePularVenda}
                      disabled={registrandoVenda}
                      className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium text-sm transition-all disabled:opacity-50"
                    >
                      Registar Depois
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleClose}
            disabled={isLoading || registrandoVenda}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default FunilAvaliacaoModal;
