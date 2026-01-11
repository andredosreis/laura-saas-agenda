import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';
import { getAvailableSlots } from '../services/scheduleService';

// Schema de validação específico para agendamento
const agendamentoFormSchema = z.object({
  cliente: z.string().min(1, 'Selecione um cliente'),
  pacote: z.string().min(1, 'Selecione um pacote do cliente'),
  dataHora: z
    .string()
    .min(1, 'Selecione data e hora')
    .refine(
      (val) => {
        const selectedDate = new Date(val);
        const now = new Date();
        return selectedDate > now;
      },
      { message: 'A data e hora devem ser no futuro' }
    ),
  observacoes: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

function CriarAgendamento() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [horariosVagos, setHorariosVagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [pacotesDoCliente, setPacotesDoCliente] = useState([]);

  const formatDateForInput = (date) => {
    return date.toISOString().slice(0, 16);
  };

  // React Hook Form
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: zodResolver(agendamentoFormSchema),
    mode: 'onChange',
    defaultValues: {
      cliente: '',
      pacote: '',
      dataHora: formatDateForInput(new Date()),
      observacoes: '',
    },
  });

  const watchObservacoes = watch('observacoes');

  // Buscar horários disponíveis
  useEffect(() => {
    if (dataSelecionada) {
      const fetchHorarios = async () => {
        const slots = await getAvailableSlots(dataSelecionada, 60);
        setHorariosVagos(slots);
      };
      fetchHorarios();
    }
  }, [dataSelecionada]);

  // Carregar clientes e pacotes
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [clientesRes, pacotesRes] = await Promise.all([
          api.get('/clientes'),
          api.get('/pacotes'),
        ]);
        setClientes(clientesRes.data);
        setPacotes(pacotesRes.data);
      } catch (error) {
        toast.error('Erro ao carregar dados necessários');
        console.error('Erro ao carregar dados:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Handler quando cliente é selecionado
  async function handleClienteChange(clienteId) {
    if (!clienteId) {
      setClienteSelecionado(null);
      setPacotesDoCliente([]);
      setValue('cliente', '', { shouldValidate: true });
      setValue('pacote', '', { shouldValidate: true });
      return;
    }

    try {
      setIsLoading(true);
      
      // Buscar cliente
      const clienteResponse = await api.get(`/clientes/${clienteId}`);
      const cliente = clienteResponse.data;
      setClienteSelecionado(cliente);
      setValue('cliente', clienteId, { shouldValidate: true });

      // Buscar pacotes ativos do cliente (comprados em Vendas)
      const pacotesResponse = await api.get(`/compras-pacotes/cliente/${clienteId}`);
      // A API já retorna array direto
      const pacotesAtivos = (pacotesResponse.data || []).filter(
        (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
      );
      
      setPacotesDoCliente(pacotesAtivos);

      // Verificar se cliente tem pacotes ativos
      if (pacotesAtivos.length === 0) {
        toast.warning(
          '⚠️ Este cliente não possui pacotes ativos. Vá em "Vendas" para vender um pacote antes de agendar.',
          { autoClose: 5000 }
        );
        setValue('pacote', '', { shouldValidate: true });
      } else if (pacotesAtivos.length === 1) {
        // Auto-selecionar se houver apenas 1 pacote
        setValue('pacote', pacotesAtivos[0]._id, { shouldValidate: true });
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do cliente');
      console.error('Erro ao carregar cliente:', error);
      setPacotesDoCliente([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Handler para tipo de serviço - REMOVIDO (só permitiremos pacotes comprados)
  // const handleTipoServicoChange = (tipo) => {...}

  // Submit
  const onSubmit = async (data) => {
    // Verificar se cliente tem pacote ativo
    if (pacotesDoCliente.length === 0) {
      toast.error('Cliente não possui pacotes ativos. Venda um pacote antes de agendar.');
      return;
    }

    // Buscar o pacote selecionado para verificar sessões
    const compraPacote = pacotesDoCliente.find((cp) => cp._id === data.pacote);
    if (!compraPacote) {
      toast.error('Pacote selecionado não encontrado');
      return;
    }

    if (compraPacote.sessoesRestantes <= 0) {
      toast.error('Este pacote não possui sessões disponíveis');
      return;
    }

    setIsSubmitting(true);
    try {
      const dadosParaEnviar = {
        cliente: data.cliente,
        compraPacote: data.pacote, // ID da CompraPacote
        dataHora: data.dataHora,
        observacoes: data.observacoes || '',
        status: 'Agendado',
      };

      await api.post('/agendamentos', dadosParaEnviar);
      toast.success('✅ Agendamento criado com sucesso!');
      navigate('/agendamentos');
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast.error(error.response?.data?.message || 'Erro ao criar agendamento');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper para estado visual do input
  const getInputState = (fieldName) => {
    if (errors[fieldName]) return 'error';
    if (dirtyFields[fieldName] && !errors[fieldName]) return 'success';
    return 'default';
  };

  // Classes dinâmicas
  const getInputClasses = (fieldName) => {
    const state = getInputState(fieldName);
    const baseClasses =
      'block w-full rounded border p-2 shadow-sm focus:ring focus:ring-amber-200 transition-all text-gray-900 bg-white placeholer:text-gray-400';

    switch (state) {
      case 'error':
        return `${baseClasses} border-red-500 focus:border-red-500`;
      case 'success':
        return `${baseClasses} border-green-500 focus:border-green-500`;
      default:
        return `${baseClasses} border-gray-300 focus:border-amber-500`;
    }
  };

  // Componente de erro
  const ErrorMessage = ({ fieldName }) => {
    if (!errors[fieldName]) return null;
    return (
      <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        {errors[fieldName].message}
      </p>
    );
  };

  if (isLoading && clientes.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Novo Agendamento</h1>
          <button
            onClick={() => navigate('/agendamentos')}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Seção 1: Informações Básicas */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Informações Básicas</h2>

            {/* Campo Cliente */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente <span className="text-red-500">*</span>
              </label>
              <Controller
                name="cliente"
                control={control}
                render={({ field }) => (
                  <select
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleClienteChange(e.target.value);
                    }}
                    disabled={isSubmitting}
                    className={getInputClasses('cliente')}
                  >
                    <option value="">Selecione um cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente._id} value={cliente._id}>
                        {cliente.nome}
                      </option>
                    ))}
                  </select>
                )}
              />
              <ErrorMessage fieldName="cliente" />
            </div>

            {/* Campo Data e Hora */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data e Hora <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                {...register('dataHora')}
                disabled={isSubmitting}
                className={getInputClasses('dataHora')}
              />
              <ErrorMessage fieldName="dataHora" />
            </div>
          </div>

          {/* Seção 2: Detalhes do Serviço */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Pacote do Cliente</h2>

            {/* Mostrar pacotes do cliente ou mensagem de aviso */}
            {clienteSelecionado && pacotesDoCliente.length === 0 && (
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Cliente não possui pacotes ativos
                </p>
                <p className="text-sm text-yellow-700 mt-2">
                  Para agendar este cliente, primeiro vá em <strong>"Vendas"</strong> e venda um pacote para ele.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/vender-pacote')}
                  className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                >
                  Ir para Vendas
                </button>
              </div>
            )}

            {/* Lista de pacotes ativos do cliente */}
            {pacotesDoCliente.length > 0 && (
              <div className="space-y-3">
                {pacotesDoCliente.map((compraPacote) => (
                  <div
                    key={compraPacote._id}
                    className="p-3 bg-blue-50 rounded-lg border border-blue-100"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm text-blue-900 font-semibold">
                          {compraPacote.pacote?.nome || 'Pacote'}
                        </p>
                        <div className="mt-1 space-y-1 text-xs text-blue-700">
                          <p>
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />
                            Sessões: {compraPacote.sessoesUsadas}/{compraPacote.sessoesContratadas}
                            <span className="font-medium ml-1">
                              ({compraPacote.sessoesRestantes} restantes)
                            </span>
                          </p>
                          {compraPacote.dataExpiracao && (
                            <p>
                              📅 Válido até:{' '}
                              {new Date(compraPacote.dataExpiracao).toLocaleDateString('pt-PT')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Campo de seleção de pacote */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selecionar Pacote <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="pacote"
                    control={control}
                    render={({ field }) => (
                      <select
                        {...field}
                        disabled={isSubmitting || pacotesDoCliente.length === 0}
                        className={getInputClasses('pacote')}
                      >
                        <option value="">Selecione o pacote para este agendamento</option>
                        {pacotesDoCliente.map((cp) => (
                          <option key={cp._id} value={cp._id}>
                            {cp.pacote?.nome} - {cp.sessoesRestantes} sessões restantes
                          </option>
                        ))}
                      </select>
                    )}
                  />
                  <ErrorMessage fieldName="pacote" />
                </div>
              </div>
            )}
          </div>

          {/* Seção 3: Observações */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Observações</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações (opcional)
              </label>
              <textarea
                {...register('observacoes')}
                disabled={isSubmitting}
                className={getInputClasses('observacoes')}
                rows={3}
                placeholder="Ex: Cliente quer massagem com pressão leve."
              />
              <ErrorMessage fieldName="observacoes" />
              <p className="mt-1 text-sm text-gray-500">
                {watchObservacoes?.length || 0}/500 caracteres
              </p>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Deseja cancelar o agendamento? As alterações serão perdidas.'
                  )
                ) {
                  navigate('/agendamentos');
                }
              }}
              disabled={isSubmitting}
              className="flex-1 bg-gray-500 text-white font-semibold py-2 px-4 rounded hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 flex items-center justify-center ${isSubmitting
                  ? 'bg-amber-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600'
                } text-white font-semibold py-2 px-4 rounded transition-colors`}
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Criando...
                </>
              ) : (
                'Criar Agendamento'
              )}
            </button>
          </div>
        </form>
      </div>
    </ErrorBoundary>
  );
}

export default CriarAgendamento;
