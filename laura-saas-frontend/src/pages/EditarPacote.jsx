import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-toastify';
import { pacoteSchema } from '../schemas/validationSchemas';
import { useTheme } from '../contexts/ThemeContext';

function EditarPacote() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [categorias, setCategorias] = useState([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(pacoteSchema),
    defaultValues: { nome: '', categoria: '', sessoes: 1, valor: '', descricao: '', ativo: true },
  });

  const watchDescricao = watch('descricao');

  useEffect(() => {
    async function carregar() {
      setIsLoading(true);
      try {
        const [pacoteRes, listaRes] = await Promise.all([
          api.get(`/pacotes/${id}`),
          api.get('/pacotes', { params: { limit: 100 } }),
        ]);
        // Novo contrato { success, data }; tolera o formato antigo.
        const p = pacoteRes.data?.data ?? pacoteRes.data;
        reset({
          nome: p.nome || '',
          categoria: p.categoria || '',
          sessoes: p.sessoes ?? 1,
          valor: p.valor ?? '',
          descricao: p.descricao || '',
          ativo: p.ativo ?? true,
        });
        const cats = [...new Set((listaRes.data?.data || []).map((x) => x.categoria).filter(Boolean))].sort(
          (a, b) => a.localeCompare(b, 'pt-PT', { sensitivity: 'base' })
        );
        setCategorias(cats);
      } catch (error) {
        console.error('Erro ao carregar serviço:', error);
        toast.error(error.response?.data?.error || 'Erro ao carregar o serviço.');
        if (error.response?.status === 404) navigate('/pacotes');
      } finally {
        setIsLoading(false);
      }
    }
    if (id) carregar();
  }, [id, navigate, reset]);

  const onSubmit = async (data) => {
    try {
      await api.put(`/pacotes/${id}`, {
        nome: data.nome.trim(),
        categoria: data.categoria.trim(),
        sessoes: parseInt(data.sessoes, 10),
        valor: parseFloat(data.valor),
        descricao: data.descricao?.trim() || '',
        ativo: data.ativo,
      });
      toast.success('Serviço atualizado com sucesso! ✨');
      navigate('/pacotes');
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error.response?.data || error.message);
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Erro ao atualizar serviço. Tente novamente.');
    }
  };

  const pageBg = isDarkMode ? 'bg-slate-900' : 'bg-slate-50';
  const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const subtextClass = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const inputBg = isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const inputClass = (field) =>
    `w-full px-3 py-2.5 rounded-xl border ${inputBg} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 ${
      errors[field] ? 'border-red-500' : ''
    }`;

  if (isLoading) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${pageBg}`}>
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className={`mt-3 ${subtextClass}`}>A carregar dados do serviço...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pt-20 pb-8 px-4 ${pageBg}`}>
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/pacotes')}
          className={`mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
            isDarkMode ? 'border-white/10 text-slate-200 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-white'
          }`}
        >
          <ArrowLeft size={18} />
          Voltar para Serviços
        </button>

        <div className={`rounded-2xl border shadow-xl p-6 ${isDarkMode ? 'bg-slate-800/50 border-white/10' : 'bg-white border-slate-200'}`}>
          <h1 className={`text-2xl font-bold mb-6 ${textClass}`}>Editar Serviço</h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Nome */}
            <div>
              <label htmlFor="nome" className={`block text-sm font-medium ${subtextClass} mb-1`}>
                Nome do Serviço <span className="text-red-500">*</span>
              </label>
              <input id="nome" type="text" {...register('nome')} placeholder="Ex: Massagem Relaxante" className={inputClass('nome')} />
              {errors.nome && <p className="mt-1 text-sm text-red-400">{errors.nome.message}</p>}
            </div>

            {/* Categoria com datalist */}
            <div>
              <label htmlFor="categoria" className={`block text-sm font-medium ${subtextClass} mb-1`}>
                Categoria <span className="text-red-500">*</span>
              </label>
              <input
                id="categoria"
                type="text"
                list="categorias-existentes"
                {...register('categoria')}
                placeholder="Ex: Estética, Bem-estar"
                className={inputClass('categoria')}
              />
              <datalist id="categorias-existentes">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {errors.categoria && <p className="mt-1 text-sm text-red-400">{errors.categoria.message}</p>}
            </div>

            {/* Sessões + Valor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="sessoes" className={`block text-sm font-medium ${subtextClass} mb-1`}>
                  Número de Sessões <span className="text-red-500">*</span>
                </label>
                <input id="sessoes" type="number" min="1" {...register('sessoes')} className={inputClass('sessoes')} />
                {errors.sessoes && <p className="mt-1 text-sm text-red-400">{errors.sessoes.message}</p>}
              </div>
              <div>
                <label htmlFor="valor" className={`block text-sm font-medium ${subtextClass} mb-1`}>
                  Valor (€) <span className="text-red-500">*</span>
                </label>
                <input id="valor" type="number" min="0" step="0.01" {...register('valor')} placeholder="Ex: 50.00" className={inputClass('valor')} />
                {errors.valor && <p className="mt-1 text-sm text-red-400">{errors.valor.message}</p>}
              </div>
            </div>

            {/* Descrição */}
            <div>
              <label htmlFor="descricao" className={`block text-sm font-medium ${subtextClass} mb-1`}>
                Descrição (Opcional)
              </label>
              <textarea id="descricao" rows="3" {...register('descricao')} placeholder="Descrição do serviço..." className={inputClass('descricao')} />
              <div className="flex justify-between mt-1">
                {errors.descricao ? (
                  <p className="text-sm text-red-400">{errors.descricao.message}</p>
                ) : (
                  <span />
                )}
                <p className={`text-xs ${subtextClass}`}>{watchDescricao?.length || 0}/500</p>
              </div>
            </div>

            {/* Ativo */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('ativo')} className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500" />
              <span className={`text-sm ${textClass}`}>Serviço Ativo</span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSubmitting ? 'A guardar...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EditarPacote;
