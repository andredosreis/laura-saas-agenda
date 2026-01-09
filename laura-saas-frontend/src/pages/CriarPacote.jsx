import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { pacoteSchema } from '../schemas/validationSchemas';

function CriarPacote() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // React Hook Form com Zod
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, dirtyFields },
  } = useForm({
    resolver: zodResolver(pacoteSchema),
    mode: 'onChange',
    defaultValues: {
      nome: '',
      categoria: '',
      sessoes: 1,
      valor: '',
      descricao: '',
      ativo: true,
    },
  });

  const watchDescricao = watch('descricao');

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const dadosParaEnviar = {
        nome: data.nome.trim(),
        categoria: data.categoria.trim(),
        sessoes: parseInt(data.sessoes, 10),
        valor: parseFloat(data.valor),
        descricao: data.descricao?.trim() || '',
        ativo: data.ativo,
      };

      await api.post('/pacotes', dadosParaEnviar);
      toast.success('Pacote criado com sucesso!');
      navigate('/pacotes');
    } catch (error) {
      console.error('Erro ao criar pacote:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'Erro ao criar pacote. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper para estado visual
  const getInputState = (fieldName) => {
    if (errors[fieldName]) return 'error';
    if (dirtyFields[fieldName] && !errors[fieldName]) return 'success';
    return 'default';
  };

  const getInputClasses = (fieldName) => {
    const state = getInputState(fieldName);
    const baseClasses = 'mt-1 block w-full rounded-md p-3 shadow-sm focus:ring-amber-500 transition-all';

    switch (state) {
      case 'error':
        return `${baseClasses} border-red-500 focus:border-red-500`;
      case 'success':
        return `${baseClasses} border-green-500 focus:border-green-500`;
      default:
        return `${baseClasses} border-gray-300 focus:border-amber-500`;
    }
  };

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
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/pacotes')}
          className="mb-6 inline-flex items-center gap-1 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Pacotes
        </button>

        <div className="bg-white text-black border border-gray-200 shadow-xl rounded-lg p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-8">
            Criar Novo Pacote
          </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Campo Nome */}
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700">
                Nome do Pacote <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="nome"
                  {...register('nome')}
                  placeholder="Ex: Massagem Relaxante"
                  className={`${getInputClasses('nome')} pr-10`}
                />
                <FieldFeedback fieldName="nome" />
              </div>
              <ErrorMessage fieldName="nome" />
            </div>

            {/* Campo Categoria */}
            <div>
              <label htmlFor="categoria" className="block text-sm font-medium text-gray-700">
                Categoria <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="categoria"
                  {...register('categoria')}
                  placeholder="Ex: Estética, Bem-estar"
                  className={`${getInputClasses('categoria')} pr-10`}
                />
                <FieldFeedback fieldName="categoria" />
              </div>
              <ErrorMessage fieldName="categoria" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Campo Sessões */}
              <div>
                <label htmlFor="sessoes" className="block text-sm font-medium text-gray-700">
                  Número de Sessões <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="sessoes"
                    {...register('sessoes')}
                    min="1"
                    className={`${getInputClasses('sessoes')} pr-10`}
                  />
                  <FieldFeedback fieldName="sessoes" />
                </div>
                <ErrorMessage fieldName="sessoes" />
              </div>

              {/* Campo Valor */}
              <div>
                <label htmlFor="valor" className="block text-sm font-medium text-gray-700">
                  Valor (€) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="valor"
                    {...register('valor')}
                    min="0"
                    step="0.01"
                    placeholder="Ex: 50.00"
                    className={`${getInputClasses('valor')} pr-10`}
                  />
                  <FieldFeedback fieldName="valor" />
                </div>
                <ErrorMessage fieldName="valor" />
              </div>
            </div>

            {/* Campo Descrição */}
            <div>
              <label htmlFor="descricao" className="block text-sm font-medium text-gray-700">
                Descrição (Opcional)
              </label>
              <textarea
                id="descricao"
                {...register('descricao')}
                rows="3"
                placeholder="Descrição do pacote..."
                className={getInputClasses('descricao')}
              />
              <ErrorMessage fieldName="descricao" />
              <p className="mt-1 text-sm text-gray-500">
                {watchDescricao?.length || 0}/500 caracteres
              </p>
            </div>

            {/* Campo Ativo */}
            <div className="flex items-center">
              <input
                id="ativo"
                type="checkbox"
                {...register('ativo')}
                className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
              />
              <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900">
                Pacote Ativo
              </label>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-black shadow-md transition-all flex items-center justify-center ${
                isSubmitting
                  ? 'bg-amber-400 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600 hover:shadow-lg'
              }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Criando...
                </>
              ) : (
                'Criar Pacote'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CriarPacote;
