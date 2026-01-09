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
const agendamentoFormSchema = z
  .object({
    cliente: z.string().min(1, 'Selecione um cliente'),
    tipoServico: z.enum(['pacote', 'avulso'], {
      required_error: 'Selecione o tipo de serviço',
    }),
    pacote: z.string().optional(),
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
  })
  .refine(
    (data) => {
      // Se for tipo pacote ou avulso, precisa ter pacote selecionado
      return data.pacote && data.pacote.length > 0;
    },
    {
      message: 'Selecione um pacote ou serviço',
      path: ['pacote'],
    }
  );

function CriarAgendamento() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [horariosVagos, setHorariosVagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);

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
      tipoServico: 'pacote',
    },
  });

  const watchTipoServico = watch('tipoServico');
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
      setValue('cliente', '', { shouldValidate: true });
      setValue('pacote', '', { shouldValidate: true });
      setValue('tipoServico', 'pacote');
      return;
    }

    try {
      setIsLoading(true);
      const response = await api.get(`/clientes/${clienteId}`);
      const cliente = response.data;

      setClienteSelecionado(cliente);
      setValue('cliente', clienteId, { shouldValidate: true });

      if (cliente.pacote) {
        const pacoteId = cliente.pacote._id || cliente.pacote;
        setValue('pacote', pacoteId, { shouldValidate: true });
        setValue('tipoServico', 'pacote');
      } else {
        setValue('pacote', '', { shouldValidate: true });
        setValue('tipoServico', 'avulso');
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do cliente');
      console.error('Erro ao carregar cliente:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Handler para tipo de serviço
  const handleTipoServicoChange = (tipo) => {
    if (tipo === 'pacote' && clienteSelecionado && !clienteSelecionado.pacote) {
      toast.warning('Este cliente não possui pacote ativo. Selecione Serviço Avulso.');
      return;
    }

    setValue('tipoServico', tipo);

    if (tipo === 'pacote' && clienteSelecionado && clienteSelecionado.pacote) {
      const pacoteId = clienteSelecionado.pacote._id || clienteSelecionado.pacote;
      setValue('pacote', pacoteId, { shouldValidate: true });
    } else {
      setValue('pacote', '', { shouldValidate: true });
    }
  };

  // Submit
  const onSubmit = async (data) => {
    // Verificar sessões disponíveis se for pacote
    if (data.tipoServico === 'pacote' && clienteSelecionado?.sessoesRestantes <= 0) {
      toast.error('Cliente não possui sessões disponíveis no pacote');
      return;
    }

    setIsSubmitting(true);
    try {
      const dadosParaEnviar = {
        cliente: data.cliente,
        pacote: data.tipoServico === 'pacote' ? data.pacote : null,
        dataHora: data.dataHora,
        observacoes: data.observacoes || '',
        status: 'Agendado',
      };

      if (data.tipoServico === 'avulso') {
        const pacoteSelecionado = pacotes.find((p) => p._id === data.pacote);
        if (pacoteSelecionado) {
          dadosParaEnviar.servicoAvulsoNome = pacoteSelecionado.nome;
          dadosParaEnviar.servicoAvulsoValor = pacoteSelecionado.valor;
        }
      }

      await api.post('/agendamentos', dadosParaEnviar);
      toast.success('Agendamento criado com sucesso!');
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

  const clienteTemPacote = clienteSelecionado && clienteSelecionado.pacote;

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
            <h2 className="text-lg font-medium text-gray-700 mb-3">Detalhes do Serviço</h2>

            {/* Informações do pacote atual */}
            {clienteTemPacote && (
              <div className="p-3 bg-blue-50 rounded-lg mb-4 border border-blue-100">
                <p className="text-sm text-blue-800 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Pacote atual: {clienteSelecionado.pacote.nome}
                </p>
                <p className="text-sm text-blue-800">
                  Sessões restantes: {clienteSelecionado.sessoesRestantes}
                </p>
              </div>
            )}

            {/* Tipo de Serviço */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Serviço <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-4">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="tipoPacote"
                    checked={watchTipoServico === 'pacote'}
                    onChange={() => handleTipoServicoChange('pacote')}
                    disabled={!clienteTemPacote || isSubmitting}
                    className={`h-4 w-4 ${!clienteTemPacote ? 'opacity-50 cursor-not-allowed' : ''
                      } text-amber-600 focus:ring-amber-500 border-gray-300`}
                  />
                  <label
                    htmlFor="tipoPacote"
                    className={`ml-2 text-sm ${!clienteTemPacote ? 'text-gray-400' : 'text-gray-700'
                      }`}
                  >
                    Usar Pacote Contratado
                    {!clienteTemPacote && (
                      <span className="text-xs ml-1">(Cliente sem pacote)</span>
                    )}
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="tipoAvulso"
                    checked={watchTipoServico === 'avulso'}
                    onChange={() => handleTipoServicoChange('avulso')}
                    disabled={isSubmitting}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300"
                  />
                  <label htmlFor="tipoAvulso" className="ml-2 text-sm text-gray-700">
                    Serviço Avulso
                  </label>
                </div>
              </div>
            </div>

            {/* Campo Pacote/Serviço */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {watchTipoServico === 'pacote' ? 'Pacote Contratado' : 'Serviço'}{' '}
                <span className="text-red-500">*</span>
              </label>

              {watchTipoServico === 'pacote' && clienteTemPacote ? (
                <div className="p-2 bg-gray-100 border border-gray-300 rounded text-gray-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {clienteSelecionado.pacote.nome}
                </div>
              ) : (
                <Controller
                  name="pacote"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      disabled={
                        isSubmitting || (watchTipoServico === 'pacote' && clienteTemPacote)
                      }
                      className={getInputClasses('pacote')}
                    >
                      <option value="">Selecione um serviço</option>
                      {pacotes.map((pacote) => (
                        <option key={pacote._id} value={pacote._id}>
                          {pacote.nome} - R$ {pacote.valor}
                        </option>
                      ))}
                    </select>
                  )}
                />
              )}
              <ErrorMessage fieldName="pacote" />
            </div>
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
