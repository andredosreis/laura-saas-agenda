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
  AlertCircle,
  ChevronDown,
  History
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
  
  // Data de hoje em YYYY-MM-DD (timezone local — o backend re-valida em Europe/Lisbon)
  const hojeStr = new Date().toISOString().split('T')[0];

  // Formulário
  const [form, setForm] = useState({
    clienteId: '',
    pacoteId: '',
    diasValidade: 90,
    semValidade: false,
    parcelado: false,
    numeroParcelas: 1,
    valorEntrada: '', // entrada livre quando parcelado (pode ser 0)
    pagarAgora: true,
    valorPago: 0,
    formaPagamento: 'Dinheiro',
    telefoneMBWay: '',
    sessoesJaRealizadas: 0,
    valorPersonalizado: '',
    dataProximaParcela: '',
    dataVenda: hojeStr,
    motivoRetroactivo: ''
  });

  // Bloco "Detalhes da venda" colapsado por defeito — só expande quando o utilizador
  // precisa de registar uma venda que aconteceu noutro dia.
  const [showDetalhesVenda, setShowDetalhesVenda] = useState(false);

  // Pacote selecionado
  const [pacoteSelecionado, setPacoteSelecionado] = useState(null);

  // Carregar dados
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [clientesRes, pacotesRes] = await Promise.all([
          api.get('/clientes?limit=100'),
          api.get('/pacotes?limit=100')
        ]);
        const sortByName = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-PT', { sensitivity: 'base' });
        setClientes((clientesRes.data?.data || []).slice().sort(sortByName));
        setPacotes((pacotesRes.data?.data || []).filter(p => p.ativo).sort(sortByName));
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
      if (pacote) {
        setForm(prev => ({
          ...prev,
          sessoesJaRealizadas: 0,
          valorPersonalizado: pacote.valor,
          valorPago: prev.pagarAgora && !prev.parcelado ? pacote.valor : prev.valorPago
        }));
      }
    } else {
      setPacoteSelecionado(null);
    }
  }, [form.pacoteId, pacotes]);

  // Calcular valores derivados
  const valorTotal = pacoteSelecionado
    ? (parseFloat(form.valorPersonalizado) > 0 ? parseFloat(form.valorPersonalizado) : pacoteSelecionado.valor)
    : 0;
  // Entrada (parcelado) — livre, pode ser 0; clamp entre [0, valorTotal]
  const entradaNum = parseFloat(form.valorEntrada) || 0;
  const entradaValida = Math.min(Math.max(entradaNum, 0), valorTotal);
  const valorRestante = Math.max(0, valorTotal - entradaValida);
  // Valor por parcela: parcelado divide o restante; à vista é o total
  const valorParcela = pacoteSelecionado && form.numeroParcelas > 0
    ? (form.parcelado
        ? (valorRestante / form.numeroParcelas).toFixed(2)
        : (valorTotal / form.numeroParcelas).toFixed(2))
    : 0;
  const sessoesRestantes = pacoteSelecionado
    ? pacoteSelecionado.sessoes - (parseInt(form.sessoesJaRealizadas) || 0)
    : 0;

  // Retroactividade: data anterior a "ontem" (mesma regra do backend, mas em local time
  // do utilizador — o backend revalida em Europe/Lisbon antes de persistir).
  const isRetroactivo = (() => {
    if (!form.dataVenda) return false;
    const venda = new Date(form.dataVenda + 'T00:00:00');
    const ontem = new Date();
    ontem.setHours(0, 0, 0, 0);
    ontem.setDate(ontem.getDate() - 1);
    return venda < ontem;
  })();
  const dataAlterada = form.dataVenda !== hojeStr;

  // Handlers
  // Lógica de pagamento:
  //  • À VISTA: pagarAgora controla se valorPago = valorTotal ou 0
  //  • PARCELADO: valorEntrada (livre) controla quanto é pago hoje;
  //    o restante é dividido pelo número de parcelas escolhido
  const handleChange = (campo, valor) => {
    setForm(prev => {
      const newForm = { ...prev, [campo]: valor };

      // Activar parcelado → resetar entrada e garantir nº parcelas >= 1
      if (campo === 'parcelado') {
        if (valor) {
          newForm.valorEntrada = '';
          if (!newForm.numeroParcelas || newForm.numeroParcelas < 1) {
            newForm.numeroParcelas = 2;
          }
        } else {
          newForm.numeroParcelas = 1;
          newForm.valorEntrada = '';
        }
      }

      // À vista: pagarAgora controla valorPago
      if (campo === 'pagarAgora' && !newForm.parcelado) {
        const vTotal = parseFloat(prev.valorPersonalizado) || pacoteSelecionado?.valor || 0;
        newForm.valorPago = valor ? vTotal : 0;
      }

      // Mudou valor personalizado em modo à vista com pagarAgora
      if (campo === 'valorPersonalizado' && pacoteSelecionado && !newForm.parcelado && newForm.pagarAgora) {
        newForm.valorPago = parseFloat(valor) || 0;
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

    const sessoesJaRealizadasNum = parseInt(form.sessoesJaRealizadas) || 0;
    if (pacoteSelecionado && sessoesJaRealizadasNum >= pacoteSelecionado.sessoes) {
      toast.error('Sessões já realizadas deve ser menor que o total de sessões do pacote');
      return;
    }

    if (valorTotal < 0) {
      toast.error('Valor total não pode ser negativo');
      return;
    }

    if (form.dataVenda && form.dataVenda > hojeStr) {
      toast.error('Data da venda não pode estar no futuro');
      return;
    }

    if (isRetroactivo && !form.motivoRetroactivo.trim()) {
      toast.error('Indica o motivo da venda retroactiva (vai ficar registado para auditoria)');
      setShowDetalhesVenda(true);
      return;
    }

    setSubmitting(true);
    try {
      // Backend aceita ambos:
      //  • valorEntrada (parcelado): entrada livre + restante parcelado por numeroParcelas
      //  • valorPago (à vista): valor pago hoje (0 ou total)
      const temEntradaParcelado = form.parcelado && entradaValida > 0;
      const dados = {
        clienteId: form.clienteId,
        pacoteId: form.pacoteId,
        diasValidade: form.semValidade ? null : form.diasValidade,
        parcelado: form.parcelado,
        numeroParcelas: form.parcelado ? form.numeroParcelas : 1,
        formaPagamento: (form.parcelado ? temEntradaParcelado : form.pagarAgora) ? form.formaPagamento : null,
        sessoesUsadas: sessoesJaRealizadasNum,
        valorTotal: valorTotal,
        dataProximaParcela: form.parcelado && valorRestante > 0.001 && form.dataProximaParcela ? form.dataProximaParcela : null
      };
      if (form.parcelado) {
        dados.valorEntrada = entradaValida;
      } else {
        dados.valorPago = form.pagarAgora ? form.valorPago : 0;
      }
      // Só envia data quando o utilizador alterou — assim o backend usa timestamp preciso
      // (microssegundos) por defeito, e só recebe ISO date quando há intenção explícita.
      if (dataAlterada) {
        dados.dataCompra = form.dataVenda;
      }
      if (isRetroactivo) {
        dados.motivoRetroactivo = form.motivoRetroactivo.trim();
      }

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
    : 'bg-white border border-gray-200 shadow-xs';
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
              <>
                <div className={`mt-4 p-4 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'}`}>
                  <h3 className={`font-medium ${textClass} mb-2`}>{pacoteSelecionado.nome}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className={subTextClass}>Total sessões:</span>
                      <span className={textClass}>{pacoteSelecionado.sessoes}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={subTextClass}>Preço padrão:</span>
                      <span className={`font-bold text-emerald-500`}>€{pacoteSelecionado.valor?.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Sessões já realizadas */}
                <div className="mt-4">
                  <label className={`block text-sm ${subTextClass} mb-1`}>Sessões já realizadas</label>
                  <input
                    type="number"
                    value={form.sessoesJaRealizadas}
                    onChange={(e) => handleChange('sessoesJaRealizadas', parseInt(e.target.value) || 0)}
                    className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                    min="0"
                    max={pacoteSelecionado.sessoes - 1}
                  />
                  <p className={`text-xs mt-1 font-medium ${sessoesRestantes > 0 ? 'text-indigo-500' : 'text-red-500'}`}>
                    Sessões restantes: {sessoesRestantes}
                  </p>
                </div>

                {/* Valor total editável */}
                <div className="mt-4">
                  <label className={`block text-sm ${subTextClass} mb-1`}>Valor total</label>
                  <input
                    type="number"
                    value={form.valorPersonalizado}
                    onChange={(e) => handleChange('valorPersonalizado', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                    min="0"
                    step="0.01"
                    placeholder={pacoteSelecionado.valor?.toFixed(2)}
                  />
                  <p className={`text-xs ${subTextClass} mt-1`}>
                    Valor por sessão: €{pacoteSelecionado.sessoes > 0 ? (valorTotal / pacoteSelecionado.sessoes).toFixed(2) : '0.00'}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Detalhes da venda — colapsado por defeito.
              Permite registar venda retroactiva (cliente cadastrado tarde, lançamento atrasado, etc).
              Backend exige motivo se a data for anterior a ontem. */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <button
              type="button"
              onClick={() => setShowDetalhesVenda(!showDetalhesVenda)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <History className={`w-5 h-5 ${subTextClass}`} />
                <h2 className={`font-medium ${textClass}`}>Detalhes da venda</h2>
                {dataAlterada && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isRetroactivo
                      ? (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700')
                      : (isDarkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700')
                  }`}>
                    {isRetroactivo ? 'Retroactiva' : 'Data ajustada'}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-5 h-5 ${subTextClass} transition-transform ${showDetalhesVenda ? 'rotate-180' : ''}`}
              />
            </button>

            {showDetalhesVenda && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className={`block text-sm ${subTextClass} mb-1`}>Data da venda</label>
                  <input
                    type="date"
                    value={form.dataVenda}
                    onChange={(e) => handleChange('dataVenda', e.target.value)}
                    max={hojeStr}
                    className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                  />
                  <p className={`text-xs ${subTextClass} mt-1`}>
                    Por defeito hoje. Altera se a venda aconteceu noutro dia.
                  </p>
                </div>

                {isRetroactivo && (
                  <div>
                    <label className={`block text-sm ${subTextClass} mb-1`}>
                      Motivo da retroactividade <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.motivoRetroactivo}
                      onChange={(e) => handleChange('motivoRetroactivo', e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Ex: Cliente cadastrado em atraso; venda física registada após o facto."
                      className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                    />
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>
                      Obrigatório quando a venda foi há mais de 1 dia. Fica registado para auditoria.
                    </p>
                  </div>
                )}
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
                className="w-5 h-5 rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
                className="w-5 h-5 rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={textClass}>Parcelado</span>
            </label>

            {/* PARCELADO — entrada livre + restante dividido por N */}
            {form.parcelado && (
              <div className={`p-4 rounded-xl mb-4 ${isDarkMode ? 'bg-indigo-500/5 border border-indigo-500/20' : 'bg-indigo-50/50 border border-indigo-200'} space-y-4`}>
                {/* Valor de entrada (livre, pode ser 0) */}
                <div>
                  <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                    Valor de entrada (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={valorTotal}
                    value={form.valorEntrada}
                    onChange={(e) => handleChange('valorEntrada', e.target.value)}
                    className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                    placeholder="0,00"
                  />
                  <p className={`text-xs mt-1 ${subTextClass}`}>
                    Deixa 0 se o cliente não dá entrada hoje.
                  </p>
                </div>

                {/* Parcelas do restante */}
                <div>
                  <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                    Parcelas do restante (€{valorRestante.toFixed(2)})
                  </label>
                  <select
                    value={form.numeroParcelas}
                    onChange={(e) => handleChange('numeroParcelas', parseInt(e.target.value))}
                    className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                    disabled={valorRestante <= 0.001}
                  >
                    {[1, 2, 3, 4].map(n => (
                      <option key={n} value={n}>
                        {n}x de €{(valorRestante / n).toFixed(2)}
                        {n === 1 ? ' (pagar restante de uma vez)' : ''}
                      </option>
                    ))}
                  </select>
                  {valorRestante <= 0.001 && (
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      ✓ A entrada cobre o total — sem parcelas pendentes.
                    </p>
                  )}
                </div>

                {/* Forma de pagamento da entrada — só se houver entrada */}
                {entradaValida > 0 && (
                  <div>
                    <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                      Forma de pagamento <span className={`text-xs ${subTextClass}`}>(da entrada)</span>
                    </label>
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
                )}

                {/* Data próxima parcela — só se houver restante */}
                {valorRestante > 0.001 && (
                  <div>
                    <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                      Data prevista da próxima parcela
                    </label>
                    <input
                      type="date"
                      value={form.dataProximaParcela}
                      onChange={(e) => handleChange('dataProximaParcela', e.target.value)}
                      className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                    />
                    <p className={`text-xs ${subTextClass} mt-1`}>
                      🔔 Lembrete WhatsApp 5 dias antes (opcional).
                    </p>
                  </div>
                )}

                {/* Breakdown visual */}
                <div className={`pt-3 border-t ${isDarkMode ? 'border-white/10' : 'border-indigo-200'} space-y-1 text-xs`}>
                  <div className="flex justify-between">
                    <span className={subTextClass}>Valor total:</span>
                    <span className={`font-medium ${textClass}`}>€{valorTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={subTextClass}>Entrada:</span>
                    <span className="font-medium text-emerald-500">€{entradaValida.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={subTextClass}>Restante:</span>
                    <span className={`font-medium ${textClass}`}>€{valorRestante.toFixed(2)}</span>
                  </div>
                  {valorRestante > 0.001 && (
                    <div className="flex justify-between">
                      <span className={subTextClass}>{form.numeroParcelas}x de:</span>
                      <span className="font-bold text-indigo-500">€{parseFloat(valorParcela).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* À VISTA — pagarAgora controla se regista pagamento hoje */}
            {!form.parcelado && (
              <>
                <label className="flex items-center gap-3 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pagarAgora}
                    onChange={(e) => handleChange('pagarAgora', e.target.checked)}
                    className="w-5 h-5 rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className={textClass}>Registrar pagamento à vista</span>
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
                      <span className={`font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>Valor a pagar:</span>
                      <span className={`text-2xl font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        €{valorTotal.toFixed(2)}
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
              </>
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
                  <span className={subTextClass}>Sessões contratadas</span>
                  <span className={textClass}>{pacoteSelecionado.sessoes}</span>
                </div>
                {(parseInt(form.sessoesJaRealizadas) || 0) > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className={subTextClass}>Sessões já realizadas</span>
                      <span className="text-amber-500">{form.sessoesJaRealizadas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={subTextClass}>Sessões restantes</span>
                      <span className="text-indigo-500 font-medium">{sessoesRestantes}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className={subTextClass}>Valor Total</span>
                  <span className={textClass}>€{valorTotal.toFixed(2)}</span>
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
                      ? `€${(form.parcelado ? parseFloat(valorParcela) : valorTotal).toFixed(2)}`
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
              className="flex-1 px-6 py-4 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
