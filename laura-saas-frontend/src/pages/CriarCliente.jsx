import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, XCircle, ArrowLeft, User, Phone, Calendar, FileText, Loader2 } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { clienteSchema, formatPhone } from '../schemas/validationSchemas';
import { useTheme } from '../contexts/ThemeContext';

function CriarCliente() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // React Hook Form com Zod
  const {
    register,
    handleSubmit,
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
      observacoes: '',
    },
  });

  // Watch para contador de caracteres
  const watchObservacoes = watch('observacoes');

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
        dataNascimento: data.dataNascimento || null,
        observacoes: data.observacoes?.trim() || '',
      };

      await api.post('/clientes', dadosParaEnviar);
      toast.success('Cliente cadastrado com sucesso!');
      reset();
      navigate('/clientes');
    } catch (error) {
      console.error('Erro completo:', error);
      const mensagemErro = error.response?.data?.message || 'Erro ao cadastrar cliente';
      toast.error(mensagemErro);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Estilos condicionais
  const cardClass = isDarkMode 
    ? 'bg-slate-800/50 border border-white/10' 
    : 'bg-white border border-gray-200 shadow-sm';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-indigo-500 focus:ring-indigo-500/20'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500/20';

  // Helper para estado visual do input
  const getInputState = (fieldName) => {
    if (errors[fieldName]) return 'error';
    if (dirtyFields[fieldName] && !errors[fieldName]) return 'success';
    return 'default';
  };

  // Classes dinâmicas para inputs
  const getInputClasses = (fieldName) => {
    const state = getInputState(fieldName);
    const baseClasses = `w-full px-4 py-3 rounded-xl border transition-all focus:outline-none focus:ring-2 ${inputClass}`;

    switch (state) {
      case 'error':
        return `${baseClasses} !border-red-500 focus:ring-red-500/20`;
      case 'success':
        return `${baseClasses} !border-emerald-500 focus:ring-emerald-500/20`;
      default:
        return baseClasses;
    }
  };

  // Componente de feedback inline
  const FieldFeedback = ({ fieldName }) => {
    if (!dirtyFields[fieldName]) return null;

    return (
      <span className="absolute right-4 top-1/2 -translate-y-1/2">
        {errors[fieldName] ? (
          <XCircle className="w-5 h-5 text-red-500" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
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
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-20 pb-8 px-4`}>
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/clientes')}
            className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
          >
            <ArrowLeft className={`w-5 h-5 ${subTextClass}`} />
          </button>
          <div>
            <h1 className={`text-2xl font-bold ${textClass}`}>👤 Cadastrar Cliente</h1>
            <p className={subTextClass}>Adicione um novo cliente ao sistema</p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Card Nome */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <User className={`w-5 h-5 ${subTextClass}`} />
              <label className={`font-medium ${textClass}`}>Nome Completo *</label>
            </div>
            <div className="relative">
              <input
                type="text"
                {...register('nome')}
                className={`${getInputClasses('nome')} pr-12`}
                placeholder="Digite o nome do cliente"
              />
              <FieldFeedback fieldName="nome" />
            </div>
            <ErrorMessage fieldName="nome" />
          </div>

          {/* Card Telefone */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Phone className={`w-5 h-5 ${subTextClass}`} />
              <label className={`font-medium ${textClass}`}>Telefone *</label>
            </div>
            <div className="relative">
              <input
                type="text"
                {...register('telefone')}
                onChange={handlePhoneChange}
                placeholder="(99) 99999-9999"
                className={`${getInputClasses('telefone')} pr-12`}
              />
              <FieldFeedback fieldName="telefone" />
            </div>
            <ErrorMessage fieldName="telefone" />
          </div>

          {/* Card Data de Nascimento */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className={`w-5 h-5 ${subTextClass}`} />
              <label className={`font-medium ${textClass}`}>Data de Nascimento</label>
            </div>
            <div className="relative">
              <input
                type="date"
                {...register('dataNascimento')}
                className={`${getInputClasses('dataNascimento')} pr-12`}
              />
              <FieldFeedback fieldName="dataNascimento" />
            </div>
            <ErrorMessage fieldName="dataNascimento" />
            <p className={`mt-2 text-xs ${subTextClass}`}>Opcional - usado para lembretes de aniversário</p>
          </div>

          {/* Card Observações */}
          <div className={`${cardClass} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <FileText className={`w-5 h-5 ${subTextClass}`} />
              <label className={`font-medium ${textClass}`}>Observações</label>
            </div>
            <textarea
              {...register('observacoes')}
              rows="3"
              placeholder="Alergias, preferências, notas importantes..."
              className={`${getInputClasses('observacoes')} resize-none`}
            />
            <ErrorMessage fieldName="observacoes" />
            <p className={`mt-2 text-xs ${subTextClass}`}>
              {watchObservacoes?.length || 0}/500 caracteres
            </p>
          </div>

          {/* Info sobre pacotes */}
          <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-indigo-500/10 border border-indigo-500/20' : 'bg-indigo-50 border border-indigo-100'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'}`}>
              💡 <strong>Dica:</strong> Para associar pacotes ao cliente, use a seção "Vendas" após cadastrá-lo.
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate('/clientes')}
              className={`flex-1 px-6 py-4 rounded-xl border ${cardClass} ${textClass} font-medium hover:opacity-80 transition-all`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-6 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Cadastrar Cliente
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CriarCliente;
