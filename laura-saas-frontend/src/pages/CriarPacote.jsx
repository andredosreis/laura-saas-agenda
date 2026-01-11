import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { pacoteSchema } from '../schemas/validationSchemas';
import { useTheme } from '../contexts/ThemeContext';

function CriarPacote() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
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
      toast.success('Serviço criado com sucesso!');
      navigate('/pacotes');
    } catch (error) {
      console.error('Erro ao criar serviço:', error.response?.data || error.message);
      toast.error(error.response?.data?.message || 'Erro ao criar serviço. Tente novamente.');
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
    const baseClasses = `mt-1 block w-full rounded-md p-2 shadow-sm focus:ring-amber-500 transition-all ${
      isDarkMode 
        ? 'bg-gray-700 border-gray-600 text-gray-100' 
        : 'bg-white border-gray-300 text-gray-900'
    }`;

    switch (state) {
      case 'error':
        return `${baseClasses} border-red-500 focus:border-red-500`;
      case 'success':
        return `${baseClasses} border-green-500 focus:border-green-500`;
      default:
        return `${baseClasses} focus:border-amber-500`;
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
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} py-8`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-20">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => navigate('/pacotes')}
            className={`mb-6 inline-flex items-center gap-2 px-4 py-2 border rounded-lg shadow-sm text-sm font-medium transition-colors ${
              isDarkMode 
                ? 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700' 
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <ArrowLeft size={18} />
            Voltar para Serviços
          </button>

          <div className={`shadow-xl rounded-lg p-6 ${
            isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
          }`}>
            <h1 className={`text-2xl font-bold text-center mb-6 ${
              isDarkMode ? 'text-gray-100' : 'text-gray-800'
            }`}>
              Criar Novo Serviço
            </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Campo Nome */}
            <div>
              <label htmlFor="nome" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Nome do Serviço <span className="text-red-500">*</span>
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
              <label htmlFor="categoria" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Campo Sessões */}
              <div>
                <label htmlFor="sessoes" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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
                <label htmlFor="valor" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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
              <label htmlFor="descricao" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Descrição (Opcional)
              </label>
              <textarea
                id="descricao"
                {...register('descricao')}
                rows="3"
                placeholder="Descrição do serviço..."
                className={getInputClasses('descricao')}
              />
              <ErrorMessage fieldName="descricao" />
              <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
              <label htmlFor="ativo" className={`ml-2 block text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                Serviço Ativo
              </label>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-all duration-150 ease-in-out disabled:opacity-70"
            >
              {isSubmitting ? 'A criar serviço...' : 'Criar Serviço'}
            </button>
          </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CriarPacote;
