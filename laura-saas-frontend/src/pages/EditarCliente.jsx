import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle, Package, Calendar, TrendingUp, User, FileText } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { clienteSchema, formatPhone } from '../schemas/validationSchemas';
import HistoricoAtendimentos from '../components/HistoricoAtendimentos';

function EditarCliente() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pacotes, setPacotes] = useState([]);
  const [pacotesDoCliente, setPacotesDoCliente] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('dados');

  // React Hook Form com Zod
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: zodResolver(clienteSchema),
    mode: 'onChange',
    defaultValues: {
      nome: '',
      telefone: '',
      dataNascimento: '',
      pacote: '',
      sessoesRestantes: '',
      observacoes: '',
    },
  });

  // Watch para contador de caracteres
  const watchObservacoes = watch('observacoes');

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // Buscar dados do cliente, pacotes disponíveis e pacotes do cliente em paralelo
        const [clienteRes, pacotesRes, pacotesClienteRes] = await Promise.all([
          api.get(`/clientes/${id}`),
          api.get('/pacotes'),
          api.get(`/compras-pacotes/cliente/${id}`)
        ]);

        const clienteData = clienteRes.data;
        setPacotes(pacotesRes.data);
        
        // Filtrar apenas pacotes ativos com sessões
        const pacotesAtivos = (pacotesClienteRes.data || []).filter(
          (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
        );
        setPacotesDoCliente(pacotesAtivos);

        // Popular formulário com dados existentes
        reset({
          nome: clienteData.nome || '',
          telefone: formatPhone(clienteData.telefone || ''),
          dataNascimento: clienteData.dataNascimento
            ? clienteData.dataNascimento.substring(0, 10)
            : '',
          pacote: clienteData.pacote?._id || '',
          sessoesRestantes:
            clienteData.sessoesRestantes !== undefined
              ? String(clienteData.sessoesRestantes)
              : '0',
          observacoes: clienteData.observacoes || '',
        });
      } catch (err) {
        console.error('Erro ao carregar dados do cliente:', err);
        toast.error('Erro ao carregar dados do cliente.');
        if (err.response && err.response.status === 404) {
          toast.error('Cliente não encontrado.');
          navigate('/clientes');
        }
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchData();
    }
  }, [id, navigate, reset]);

  // Handler para formatar telefone
  const handlePhoneChange = (e) => {
    const formatted = formatPhone(e.target.value);
    setValue('telefone', formatted, { shouldValidate: true });
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const dadosParaEnviar = {
        nome: data.nome.trim(),
        telefone: data.telefone.replace(/\D/g, ''),
        dataNascimento: data.dataNascimento,
        pacote: data.pacote,
        sessoesRestantes: parseInt(data.sessoesRestantes),
        observacoes: data.observacoes?.trim() || '',
      };

      await api.put(`/clientes/${id}`, dadosParaEnviar);
      toast.success('Cliente atualizado com sucesso!');
      navigate('/clientes');
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error.response);
      const mensagemErro =
        error.response?.data?.message || 'Erro ao atualizar cliente';
      toast.error(mensagemErro);
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

  // Classes dinâmicas para inputs
  const getInputClasses = (fieldName) => {
    const state = getInputState(fieldName);
    const baseClasses =
      'mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 transition-all';

    switch (state) {
      case 'error':
        return `${baseClasses} border-red-500 focus:ring-red-200`;
      case 'success':
        return `${baseClasses} border-green-500 focus:ring-green-200`;
      default:
        return `${baseClasses} border-gray-300`;
    }
  };

  // Componente de feedback inline
  const FieldFeedback = ({ fieldName }) => {
    if (!dirtyFields[fieldName]) return null;

    return (
      <span className="absolute right-3 top-1/2 -translate-y-1/2">
        {errors[fieldName] ? (
          <XCircle className="w-5 h-5 text-red-500" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        )}
      </span>
    );
  };

  // Componente de mensagem de erro
  const ErrorMessage = ({ fieldName }) => {
    if (!errors[fieldName]) return null;

    return (
      <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
        <XCircle className="w-4 h-4 flex-shrink-0" />
        {errors[fieldName].message}
      </p>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-600">Carregando dados do cliente...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mt-10 p-6">
      {/* Tabs de Navegação */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setAbaAtiva('dados')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              abaAtiva === 'dados'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <User className="w-4 h-4" />
            Dados do Cliente
          </button>
          <button
            onClick={() => setAbaAtiva('historico')}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              abaAtiva === 'historico'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4" />
            Histórico de Atendimentos
          </button>
        </nav>
      </div>

      {/* Conteúdo da Aba Dados */}
      {abaAtiva === 'dados' && (
        <>
      {/* Seção de Pacotes Ativos */}
      {pacotesDoCliente.length > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg shadow">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-800">
              Pacotes Ativos ({pacotesDoCliente.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pacotesDoCliente.map((cp) => (
              <div
                key={cp._id}
                className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-800">
                    {cp.pacote?.nome || 'Pacote'}
                  </h3>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                    {cp.status}
                  </span>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>
                      <strong>{cp.sessoesRestantes}</strong> de{' '}
                      {cp.sessoesContratadas} sessões restantes
                    </span>
                  </div>
                  {cp.dataExpiracao && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        Validade:{' '}
                        {new Date(cp.dataExpiracao).toLocaleDateString('pt-PT')}
                      </span>
                    </div>
                  )}
                  <div className="text-gray-600">
                    <strong>Valor:</strong> €{cp.valorTotal.toFixed(2)}
                  </div>
                </div>
                {/* Barra de progresso */}
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${(cp.sessoesRestantes / cp.sessoesContratadas) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulário de Edição */}
      <div className="p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">Editar Cliente</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Nome */}
        <div>
          <label
            htmlFor="nome"
            className="block text-sm font-medium text-gray-700"
          >
            Nome
          </label>
          <div className="relative">
            <input
              type="text"
              id="nome"
              {...register('nome')}
              className={`${getInputClasses('nome')} pr-10`}
              placeholder="Nome completo do cliente"
            />
            <FieldFeedback fieldName="nome" />
          </div>
          <ErrorMessage fieldName="nome" />
        </div>

        {/* Telefone */}
        <div>
          <label
            htmlFor="telefone"
            className="block text-sm font-medium text-gray-700"
          >
            Telefone
          </label>
          <div className="relative">
            <input
              type="tel"
              id="telefone"
              {...register('telefone')}
              onChange={handlePhoneChange}
              placeholder="912 345 678"
              className={`${getInputClasses('telefone')} pr-10`}
            />
            <FieldFeedback fieldName="telefone" />
          </div>
          <ErrorMessage fieldName="telefone" />
        </div>

        {/* Data de nascimento */}
        <div>
          <label
            htmlFor="dataNascimento"
            className="block text-sm font-medium text-gray-700"
          >
            Data de Nascimento
          </label>
          <div className="relative">
            <input
              type="date"
              id="dataNascimento"
              {...register('dataNascimento')}
              className={`${getInputClasses('dataNascimento')} pr-10`}
            />
            <FieldFeedback fieldName="dataNascimento" />
          </div>
          <ErrorMessage fieldName="dataNascimento" />
        </div>

        {/* Pacote */}
        <div>
          <label
            htmlFor="pacote"
            className="block text-sm font-medium text-gray-700"
          >
            Pacote
          </label>
          <div className="relative">
            <Controller
              name="pacote"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  id="pacote"
                  className={`${getInputClasses('pacote')} pr-10`}
                >
                  <option value="">Selecione um pacote</option>
                  {pacotes.map((pacote) => (
                    <option key={pacote._id} value={pacote._id}>
                      {pacote.nome}
                    </option>
                  ))}
                </select>
              )}
            />
            <FieldFeedback fieldName="pacote" />
          </div>
          <ErrorMessage fieldName="pacote" />
        </div>

        {/* Sessões restantes */}
        <div>
          <label
            htmlFor="sessoesRestantes"
            className="block text-sm font-medium text-gray-700"
          >
            Sessões Restantes
          </label>
          <div className="relative">
            <input
              type="number"
              id="sessoesRestantes"
              {...register('sessoesRestantes')}
              min="0"
              className={`${getInputClasses('sessoesRestantes')} pr-10`}
            />
            <FieldFeedback fieldName="sessoesRestantes" />
          </div>
          <ErrorMessage fieldName="sessoesRestantes" />
        </div>

        {/* Observações */}
        <div>
          <label
            htmlFor="observacoes"
            className="block text-sm font-medium text-gray-700"
          >
            Observações
          </label>
          <div className="relative">
            <textarea
              id="observacoes"
              {...register('observacoes')}
              rows="3"
              placeholder="Observações sobre o cliente (opcional)"
              className={getInputClasses('observacoes')}
            />
          </div>
          <ErrorMessage fieldName="observacoes" />
          <p className="mt-1 text-sm text-gray-500">
            {watchObservacoes?.length || 0}/500 caracteres
          </p>
        </div>

        {/* Botões */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate('/clientes')}
            className="flex-1 py-2 px-4 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`flex-1 py-2 px-4 rounded text-white transition-colors flex items-center justify-center
              ${
                isSubmitting
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
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
                Salvando...
              </>
            ) : (
              'Salvar Alterações'
            )}
          </button>
        </div>
      </form>
      </div>
        </>
      )}

      {/* Conteúdo da Aba Histórico */}
      {abaAtiva === 'historico' && (
        <div className="bg-white border border-gray-300 shadow-lg rounded-lg p-6">
          <HistoricoAtendimentos clienteId={id} />
        </div>
      )}
    </div>
  );
}

export default EditarCliente;
