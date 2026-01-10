import { useState } from 'react';
import { toast } from 'react-toastify';
import { X, Loader2, CreditCard, DollarSign } from 'lucide-react';
import api from '../services/api';

const FORMAS_PAGAMENTO = [
  { value: 'Dinheiro', label: '💵 Dinheiro' },
  { value: 'MBWay', label: '📱 MBWay' },
  { value: 'Multibanco', label: '🏧 Multibanco' },
  { value: 'Cartão de Débito', label: '💳 Cartão de Débito' },
  { value: 'Cartão de Crédito', label: '💳 Cartão de Crédito' },
  { value: 'Transferência Bancária', label: '🏦 Transferência' }
];

function RegistrarPagamentoModal({ 
  isOpen, 
  onClose, 
  agendamento, 
  onSuccess, 
  isDarkMode = true 
}) {
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro');
  const [valor, setValor] = useState(agendamento?.valorCobrado || agendamento?.servicoAvulsoValor || 0);
  const [telefoneMBWay, setTelefoneMBWay] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !agendamento) return null;

  // Calcular valor sugerido
  const valorSugerido = agendamento?.valorCobrado || 
    agendamento?.servicoAvulsoValor || 
    agendamento?.pacote?.valor / agendamento?.pacote?.sessoes || 
    0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!valor || valor <= 0) {
      toast.error('Informe um valor válido');
      return;
    }

    if (formaPagamento === 'MBWay' && !telefoneMBWay) {
      toast.error('Informe o telefone para MBWay');
      return;
    }

    setLoading(true);
    try {
      // Primeiro, criar a transação
      const transacaoData = {
        tipo: 'Receita',
        categoria: agendamento.compraPacote ? 'Pacote' : 'Serviço Avulso',
        valor: parseFloat(valor),
        descricao: agendamento.compraPacote 
          ? `Sessão de pacote - ${agendamento.cliente?.nome}`
          : `${agendamento.servicoAvulsoNome || 'Serviço'} - ${agendamento.cliente?.nome}`,
        cliente: agendamento.cliente?._id,
        agendamento: agendamento._id,
        compraPacote: agendamento.compraPacote?._id || agendamento.compraPacote || null,
        statusPagamento: 'Pago',
        formaPagamento,
        dataPagamento: new Date()
      };

      const transacaoRes = await api.post('/transacoes', transacaoData);

      // Registrar pagamento
      const pagamentoData = {
        transacaoId: transacaoRes.data.transacao._id,
        valor: parseFloat(valor),
        formaPagamento,
        observacoes,
        ...(formaPagamento === 'MBWay' && { telefoneMBWay })
      };

      await api.post('/pagamentos', pagamentoData);

      // Atualizar agendamento com statusPagamento
      await api.put(`/agendamentos/${agendamento._id}`, {
        statusPagamento: 'Pago',
        transacao: transacaoRes.data.transacao._id,
        valorCobrado: parseFloat(valor)
      });

      toast.success('Pagamento registrado com sucesso!');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Erro ao registrar pagamento:', error);
      toast.error(error.response?.data?.message || 'Erro ao registrar pagamento');
    } finally {
      setLoading(false);
    }
  };

  // Estilos condicionais
  const cardClass = isDarkMode 
    ? 'bg-slate-800 border border-white/10' 
    : 'bg-white border border-gray-200 shadow-xl';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-indigo-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${cardClass} rounded-2xl w-full max-w-md p-6`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <CreditCard className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className={`text-xl font-bold ${textClass}`}>Registrar Pagamento</h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
          >
            <X className={`w-5 h-5 ${subTextClass}`} />
          </button>
        </div>

        {/* Info do Agendamento */}
        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-slate-700/50' : 'bg-gray-100'} mb-4`}>
          <p className={`font-medium ${textClass}`}>{agendamento.cliente?.nome}</p>
          <p className={`text-sm ${subTextClass}`}>
            {agendamento.servicoAvulsoNome || agendamento.pacote?.nome || 'Serviço'}
          </p>
          {agendamento.compraPacote && (
            <p className={`text-xs ${subTextClass} mt-1`}>
              Sessão do pacote
            </p>
          )}
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
              Valor (€) *
            </label>
            <div className="relative">
              <DollarSign className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${subTextClass}`} />
              <input
                type="number"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border ${inputClass}`}
                placeholder="0.00"
                required
              />
            </div>
            {valorSugerido > 0 && valor != valorSugerido && (
              <button
                type="button"
                onClick={() => setValor(valorSugerido)}
                className={`text-xs ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'} mt-1 hover:underline`}
              >
                Usar valor sugerido: €{valorSugerido.toFixed(2)}
              </button>
            )}
          </div>

          <div>
            <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
              Forma de Pagamento *
            </label>
            <select
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
              required
            >
              {FORMAS_PAGAMENTO.map(forma => (
                <option key={forma.value} value={forma.value}>{forma.label}</option>
              ))}
            </select>
          </div>

          {formaPagamento === 'MBWay' && (
            <div>
              <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
                Telefone MBWay *
              </label>
              <input
                type="tel"
                value={telefoneMBWay}
                onChange={(e) => setTelefoneMBWay(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border ${inputClass}`}
                placeholder="912345678"
                pattern="9[0-9]{8}"
                required
              />
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium ${subTextClass} mb-1`}>
              Observações
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border ${inputClass} resize-none`}
              rows="2"
              placeholder="Observações adicionais..."
            />
          </div>

          {/* Valor a receber */}
          <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'} flex items-center justify-between`}>
            <span className={`font-medium ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
              Total a receber:
            </span>
            <span className={`text-2xl font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
              €{parseFloat(valor || 0).toFixed(2)}
            </span>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`flex-1 px-4 py-3 rounded-xl border ${cardClass} ${textClass} hover:opacity-80 transition-all`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Confirmar Pagamento'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RegistrarPagamentoModal;
