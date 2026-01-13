import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Package,
  User,
  CreditCard,
  Calendar,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';

const FORMAS_PAGAMENTO = [
  { value: 'Dinheiro', label: '💵 Dinheiro' },
  { value: 'MBWay', label: '📱 MBWay' },
  { value: 'Multibanco', label: '🏧 Multibanco' },
  { value: 'Cartão de Débito', label: '💳 Cartão de Débito' },
  { value: 'Cartão de Crédito', label: '💳 Cartão de Crédito' },
  { value: 'Transferência Bancária', label: '🏦 Transferência' }
];

function VenderPacote() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  
  // Estados
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  
  // Formulário
  const [form, setForm] = useState({
    clienteId: '',
    pacoteId: '',
    diasValidade: 90,
    semValidade: false,
    parcelado: false,
    numeroParcelas: 1,
    pagarAgora: true,
    valorPago: 0,
    formaPagamento: 'Dinheiro',
    telefoneMBWay: ''
  });
  
  // Pacote selecionado
  const [pacoteSelecionado, setPacoteSelecionado] = useState(null);

  // Carregar dados
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [clientesRes, pacotesRes] = await Promise.all([
          api.get('/clientes'),
          api.get('/pacotes')
        ]);
        setClientes(clientesRes.data);
        setPacotes(pacotesRes.data.filter(p => p.ativo));
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Atualizar pacote selecionado
  useEffect(() => {
    if (form.pacoteId) {
      const pacote = pacotes.find(p => p._id === form.pacoteId);
      setPacoteSelecionado(pacote);
      if (pacote && form.pagarAgora && !form.parcelado) {
        setForm(prev => ({ ...prev, valorPago: pacote.valor }));
      }
    } else {
      setPacoteSelecionado(null);
    }
  }, [form.pacoteId, pacotes]);

  // Calcular valor da parcela
  const valorParcela = pacoteSelecionado && form.numeroParcelas > 0
    ? (pacoteSelecionado.valor / form.numeroParcelas).toFixed(2)
    : 0;

  // Handlers
  const handleChange = (campo, valor) => {
    setForm(prev => {
      const newForm = { ...prev, [campo]: valor };
      
      // Se mudar parcelamento, atualizar valor pago
      if (campo === 'parcelado') {
        if (valor && pacoteSelecionado) {
          newForm.valorPago = pacoteSelecionado.valor / newForm.numeroParcelas;
        } else if (pacoteSelecionado && newForm.pagarAgora) {
          newForm.valorPago = pacoteSelecionado.valor;
        }
      }
      
      // Se mudar número de parcelas
      if (campo === 'numeroParcelas' && pacoteSelecionado && newForm.parcelado) {
        newForm.valorPago = pacoteSelecionado.valor / valor;
      }
      
      // Se desmarcar pagar agora
      if (campo === 'pagarAgora' && !valor) {
        newForm.valorPago = 0;
      } else if (campo === 'pagarAgora' && valor && pacoteSelecionado) {
        if (newForm.parcelado) {
          newForm.valorPago = pacoteSelecionado.valor / newForm.numeroParcelas;
        } else {
          newForm.valorPago = pacoteSelecionado.valor;
        }
      }
      
      return newForm;
    });
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.clienteId || !form.pacoteId) {
      toast.error('Selecione cliente e pacote');
      return;
    }

    if (form.formaPagamento === 'MBWay' && form.pagarAgora && !form.telefoneMBWay) {
      toast.error('Informe o telefone para MBWay');
      return;
    }

    setSubmitting(true);
    try {
      const dados = {
        clienteId: form.clienteId,
        pacoteId: form.pacoteId,
        diasValidade: form.semValidade ? null : form.diasValidade,
        parcelado: form.parcelado,
        numeroParcelas: form.parcelado ? form.numeroParcelas : 1,
        valorPago: form.pagarAgora ? form.valorPago : 0,
        formaPagamento: form.pagarAgora ? form.formaPagamento : null
      };

      await api.post('/compras-pacotes', dados);
      
      toast.success('Pacote vendido com sucesso!');
      navigate('/pacotes-ativos');
    } catch (error) {
      console.error('Erro ao vender pacote:', error);
      toast.error(error.response?.data?.message || 'Erro ao vender pacote');
    } finally {
      setSubmitting(false);
    }
  };

  // Estilos condicionais
  const cardClass = isDarkMode 
    ? 'bg-slate-800/50 border border-white/10' 
    : 'bg-white border border-gray-200 shadow-sm';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-indigo-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500';

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-20 flex items-center justify-center`}>
        <Loader2 className={`w-8 h-8 animate-spin ${subTextClass}`} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-20 pb-8 px-4`}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
          >
            <ArrowLeft className={`w-5 h-5 ${subTextClass}`} />
          </button>
          <div>
            <h1 className={`text-2xl font-bold ${textClass}`}>🎁 Vender Serviço</h1>
            <p className={subTextClass}>Venda um serviço para um cliente</p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <User className={`w-5 h-5 ${subTextClass}`} />
              <h2 className={`font-medium ${textClass}`}>Cliente</h2>
            </div>
            <select
              value={form.clienteId}
              onChange={(e) => handleChange('clienteId', e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
              required
            >
              <option value="">Selecione um cliente</option>
              {clientes.map(cliente => (
                <option key={cliente._id} value={cliente._id}>
                  {cliente.nome} - {cliente.telefone}
                </option>
              ))}
            </select>
          </div>

          {/* Pacote */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Package className={`w-5 h-5 ${subTextClass}`} />
              <h2 className={`font-medium ${textClass}`}>Serviço</h2>
            </div>
            <select
              value={form.pacoteId}
              onChange={(e) => handleChange('pacoteId', e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
              required
            >
              <option value="">Selecione um serviço</option>
              {pacotes.map(pacote => (
                <option key={pacote._id} value={pacote._id}>
                  {pacote.nome} - {pacote.sessoes} sessões - €{pacote.valor?.toFixed(2)}
                </option>
              ))}
            </select>

            {/* Detalhes do Pacote */}
            {pacoteSelecionado && (
              <div className={`mt-4 p-4 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'}`}>
                <h3 className={`font-medium ${textClass} mb-2`}>{pacoteSelecionado.nome}</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className={subTextClass}>Sessões:</span>
                    <span className={textClass}>{pacoteSelecionado.sessoes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={subTextClass}>Valor Total:</span>
                    <span className={`font-bold text-emerald-500`}>€{pacoteSelecionado.valor?.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={subTextClass}>Valor/Sessão:</span>
                    <span className={textClass}>€{(pacoteSelecionado.valor / pacoteSelecionado.sessoes).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Validade */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className={`w-5 h-5 ${subTextClass}`} />
              <h2 className={`font-medium ${textClass}`}>Validade</h2>
            </div>
            
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.semValidade}
                onChange={(e) => handleChange('semValidade', e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={textClass}>Sem validade (nunca expira)</span>
            </label>

            {!form.semValidade && (
              <div>
                <label className={`block text-sm ${subTextClass} mb-1`}>Dias de validade</label>
                <input
                  type="number"
                  value={form.diasValidade}
                  onChange={(e) => handleChange('diasValidade', parseInt(e.target.value) || 0)}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  min="1"
                  max="365"
                />
                <p className={`text-xs ${subTextClass} mt-1`}>
                  O pacote expira {form.diasValidade} dias após a compra
                </p>
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className={`w-5 h-5 ${subTextClass}`} />
              <h2 className={`font-medium ${textClass}`}>Pagamento</h2>
            </div>

            {/* Parcelamento */}
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.parcelado}
                onChange={(e) => handleChange('parcelado', e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={textClass}>Parcelado</span>
            </label>

            {form.parcelado && (
              <div className="mb-4">
                <label className={`block text-sm ${subTextClass} mb-1`}>Número de parcelas</label>
                <select
                  value={form.numeroParcelas}
                  onChange={(e) => handleChange('numeroParcelas', parseInt(e.target.value))}
                  className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                    <option key={n} value={n}>{n}x de €{valorParcela}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Pagar agora */}
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.pagarAgora}
                onChange={(e) => handleChange('pagarAgora', e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={textClass}>
                {form.parcelado ? 'Registrar pagamento da 1ª parcela' : 'Registrar pagamento à vista'}
              </span>
            </label>

            {form.pagarAgora && (
              <>
                <div className="mb-4">
                  <label className={`block text-sm ${subTextClass} mb-1`}>Forma de Pagamento</label>
                  <select
                    value={form.formaPagamento}
                    onChange={(e) => handleChange('formaPagamento', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  >
                    {FORMAS_PAGAMENTO.map(forma => (
                      <option key={forma.value} value={forma.value}>{forma.label}</option>
                    ))}
                  </select>
                </div>

                {form.formaPagamento === 'MBWay' && (
                  <div className="mb-4">
                    <label className={`block text-sm ${subTextClass} mb-1`}>Telefone MBWay</label>
                    <input
                      type="tel"
                      value={form.telefoneMBWay}
                      onChange={(e) => handleChange('telefoneMBWay', e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                      placeholder="912345678"
                      pattern="9[0-9]{8}"
                    />
                  </div>
                )}

                <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'} flex items-center justify-between`}>
                  <span className={`font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {form.parcelado ? 'Valor da 1ª parcela:' : 'Valor a pagar:'}
                  </span>
                  <span className={`text-2xl font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                    €{(form.parcelado ? parseFloat(valorParcela) : pacoteSelecionado?.valor || 0).toFixed(2)}
                  </span>
                </div>
              </>
            )}

            {!form.pagarAgora && (
              <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50'} flex items-center gap-3`}>
                <AlertCircle className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                <span className={`text-sm ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                  O pagamento ficará pendente e poderá ser registrado depois
                </span>
              </div>
            )}
          </div>

          {/* Resumo */}
          {pacoteSelecionado && (
            <div className={`${cardClass} rounded-2xl p-5`}>
              <h2 className={`font-medium ${textClass} mb-4`}>📋 Resumo da Venda</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={subTextClass}>Serviço</span>
                  <span className={textClass}>{pacoteSelecionado.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className={subTextClass}>Sessões</span>
                  <span className={textClass}>{pacoteSelecionado.sessoes}</span>
                </div>
                <div className="flex justify-between">
                  <span className={subTextClass}>Valor Total</span>
                  <span className={textClass}>€{pacoteSelecionado.valor?.toFixed(2)}</span>
                </div>
                {form.parcelado && (
                  <div className="flex justify-between">
                    <span className={subTextClass}>Parcelamento</span>
                    <span className={textClass}>{form.numeroParcelas}x de €{valorParcela}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className={subTextClass}>Validade</span>
                  <span className={textClass}>{form.semValidade ? 'Sem validade' : `${form.diasValidade} dias`}</span>
                </div>
                <div className={`h-px ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'} my-2`} />
                <div className="flex justify-between font-medium">
                  <span className={textClass}>Pagamento Inicial</span>
                  <span className={form.pagarAgora ? 'text-emerald-500' : 'text-amber-500'}>
                    {form.pagarAgora 
                      ? `€${(form.parcelado ? parseFloat(valorParcela) : pacoteSelecionado.valor).toFixed(2)}`
                      : 'Pendente'
                    }
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`flex-1 px-6 py-4 rounded-xl border ${cardClass} ${textClass} font-medium hover:opacity-80 transition-all`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !form.clienteId || !form.pacoteId}
              className="flex-1 px-6 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Vendendo...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Vender Serviço
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default VenderPacote;
