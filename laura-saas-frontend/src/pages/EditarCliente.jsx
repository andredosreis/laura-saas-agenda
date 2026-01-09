import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { clienteSchema, formatPhone } from '../schemas/validationSchemas';

function EditarCliente() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [pacotes, setPacotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        // Buscar dados do cliente e pacotes em paralelo
        const [clienteRes, pacotesRes] = await Promise.all([
          api.get(`/clientes/${id}`),
          api.get('/pacotes'),
        ]);

        const clienteData = clienteRes.data;
        setPacotes(pacotesRes.data);

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
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
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
              placeholder="(99) 99999-9999"
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
  );
}

export default EditarCliente;
