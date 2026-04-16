import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { UserCheck, UserX, CheckCircle, XCircle, X, ArrowRight } from 'lucide-react';
import api from '../services/api';

function FunilAvaliacaoModal({ isOpen, agendamento, onClose, onSuccess }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Quando o modal abre, posiciona no passo correcto:
  // se já compareceu → começa no passo 2 directamente
  useEffect(() => {
    if (isOpen && agendamento) {
      setStep(agendamento.compareceu === true ? 2 : 1);
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
        const clienteCriado = res.data?.clienteCriado;
        if (clienteCriado) {
          toast.success(`Cliente "${clienteCriado.nome}" criado! Registe agora a transação.`);
          onSuccess();
          handleClose();
          navigate('/transacoes');
        } else {
          toast.success('Pacote fechado! Registe agora a transação.');
          onSuccess();
          handleClose();
          navigate('/transacoes');
        }
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

  const handleClose = () => {
    setStep(1);
    onClose();
  };

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
            disabled={isLoading}
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
                    Se fechar, o lead será registado automaticamente como cliente e será redirecionado para as finanças.
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
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={handleClose}
            disabled={isLoading}
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
