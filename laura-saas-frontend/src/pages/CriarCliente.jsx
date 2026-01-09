import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { clienteSchema, formatPhone } from '../schemas/validationSchemas';

function CriarCliente() {
  const [pacotes, setPacotes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPacotes, setIsLoadingPacotes] = useState(true);

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
    fetchPacotes();
  }, []);

  async function fetchPacotes() {
    setIsLoadingPacotes(true);
    try {
      const response = await api.get('/pacotes');
      setPacotes(response.data);
    } catch (error) {
      toast.error('Erro ao carregar pacotes');
      console.error('Erro ao buscar pacotes:', error);
    } finally {
      setIsLoadingPacotes(false);
    }
  }

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

      await api.post('/clientes', dadosParaEnviar);
      toast.success('Cliente cadastrado com sucesso!');
      reset();
    } catch (error) {
      console.error('Erro completo:', error);
      const mensagemErro = error.response?.data?.message || 'Erro ao cadastrar cliente';
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
    const baseClasses = 'mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 transition-all';

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

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Cadastrar Novo Cliente</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Campo Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <div className="relative">
            <input
              type="text"
              {...register('nome')}
              className={`${getInputClasses('nome')} pr-10`}
              placeholder="Nome completo do cliente"
            />
            <FieldFeedback fieldName="nome" />
          </div>
          <ErrorMessage fieldName="nome" />
        </div>

        {/* Campo Telefone */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Telefone</label>
          <div className="relative">
            <input
              type="text"
              {...register('telefone')}
              onChange={handlePhoneChange}
              placeholder="(99) 99999-9999"
              className={`${getInputClasses('telefone')} pr-10`}
            />
            <FieldFeedback fieldName="telefone" />
          </div>
          <ErrorMessage fieldName="telefone" />
        </div>

        {/* Campo Data de Nascimento */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Data de Nascimento
          </label>
          <div className="relative">
            <input
              type="date"
              {...register('dataNascimento')}
              className={`${getInputClasses('dataNascimento')} pr-10`}
            />
            <FieldFeedback fieldName="dataNascimento" />
          </div>
          <ErrorMessage fieldName="dataNascimento" />
        </div>

        {/* Campo Pacote */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Pacote</label>
          <div className="relative">
            <Controller
              name="pacote"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  disabled={isLoadingPacotes}
                  className={`${getInputClasses('pacote')} pr-10`}
                >
                  <option value="">
                    {isLoadingPacotes ? 'Carregando pacotes...' : 'Selecione um pacote'}
                  </option>
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

        {/* Campo Sessões Restantes */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Sessões Restantes
          </label>
          <div className="relative">
            <input
              type="number"
              {...register('sessoesRestantes')}
              min="0"
              placeholder="0"
              className={`${getInputClasses('sessoesRestantes')} pr-10`}
            />
            <FieldFeedback fieldName="sessoesRestantes" />
          </div>
          <ErrorMessage fieldName="sessoesRestantes" />
        </div>

        {/* Campo Observações */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Observações
          </label>
          <div className="relative">
            <textarea
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

        {/* Botão Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-2 px-4 rounded text-white transition-colors flex items-center justify-center
            ${isSubmitting
              ? 'bg-blue-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Cadastrando...
            </>
          ) : (
            'Cadastrar Cliente'
          )}
        </button>
      </form>
    </div>
  );
}

export default CriarCliente;
