import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from '../services/api';
import { toast } from "react-toastify";
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

function EditarPacote() {
 const { id } = useParams(); // Obter o ID do serviço da URL
 const navigate = useNavigate(); // Hook para navegação
 const { isDarkMode } = useTheme();

  const [formData, setFormData] = useState({
    nome: '',
    categoria: '',
    sessoes: '', // Será preenchido com o valor do serviço
    valor: '',   // Será preenchido com o valor do serviço
    descricao: '',
    ativo: true,
  });

const [isLoading, setIsLoading] = useState(true); // Para o carregamento inicial dos dados
  const [isSubmitting, setIsSubmitting] = useState(false); // Para o estado de submissão do formulário
  const [fieldErrors, setFieldErrors] = useState({});



 useEffect(() => {
    async function fetchPacoteData() {
      setIsLoading(true);
      setFieldErrors({});
      try {
        const response = await api.get(`/pacotes/${id}`);
        const pacoteData = response.data;
        setFormData({
          nome: pacoteData.nome || '',
          categoria: pacoteData.categoria || '',
          sessoes: pacoteData.sessoes !== undefined ? String(pacoteData.sessoes) : '', // Inputs esperam string
          valor: pacoteData.valor !== undefined ? String(pacoteData.valor) : '',     // Inputs esperam string
          descricao: pacoteData.descricao || '',
          ativo: pacoteData.ativo !== undefined ? pacoteData.ativo : true,
        });
      } catch (error) {
        console.error('Erro ao carregar dados do serviço:', error);
        toast.error('Erro ao carregar dados do serviço.');
        if (error.response && error.response.status === 404) {
          toast.error('Serviço não encontrado.');
          navigate('/pacotes'); // Volta para a lista se o serviço não existir
        }
      } finally {
        setIsLoading(false);
      }
    }
    if (id) {
      fetchPacoteData();
    }
  }, [id, navigate]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (fieldErrors[name]) {
      setFieldErrors(prevErrors => ({
        ...prevErrors,
        [name]: null,
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.nome.trim()) newErrors.nome = 'O nome do serviço é obrigatório.';
    if (!formData.categoria.trim()) newErrors.categoria = 'A categoria é obrigatória.';
    
    const sessoesNum = parseInt(formData.sessoes, 10);
    if (isNaN(sessoesNum) || sessoesNum < 1) {
      newErrors.sessoes = 'O número de sessões deve ser pelo menos 1.';
    }

    if (formData.valor === '') {
        newErrors.valor = 'O valor do serviço é obrigatório.';
    } else {
        const valorNum = parseFloat(formData.valor);
        if (isNaN(valorNum)) {
            newErrors.valor = 'O valor deve ser um número válido.';
        } else if (valorNum < 0) {
            newErrors.valor = 'O valor não pode ser negativo.';
        }
    }
    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário.');
      return;
    }

    setIsSubmitting(true);
    const dadosParaEnviar = {
      nome: formData.nome.trim(),
      categoria: formData.categoria.trim(),
      sessoes: parseInt(formData.sessoes, 10),
      valor: parseFloat(formData.valor),
      descricao: formData.descricao.trim(),
      ativo: formData.ativo,
    };

    try {
      await api.put(`/pacotes/${id}`, dadosParaEnviar); // Usa o ID da URL para a rota PUT
      toast.success('Serviço atualizado com sucesso! ✨');
      navigate('/pacotes'); // Redireciona para a lista de serviços
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error.response?.data || error.message);
      const errorData = error.response?.data;
      if (errorData?.details && Array.isArray(errorData.details)) {
        const backendErrors = {};
        errorData.details.forEach(detail => {
          backendErrors[detail.field] = detail.message;
        });
        setFieldErrors(prevErrors => ({ ...prevErrors, ...backendErrors }));
        toast.error(errorData.message || 'Erro de validação do servidor ao atualizar.');
      } else {
        toast.error(errorData?.message || 'Erro ao atualizar serviço. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`flex flex-col justify-center items-center h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        <p className={`ml-3 mt-3 text-lg ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>A carregar dados do serviço...</p>
      </div>
    );
  }

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
              Editar Serviço
            </h1>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo Nome */}
              <div>
                <label htmlFor="nome" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Nome do Serviço
                </label>
                <input
                  type="text"
                  name="nome"
                  id="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-md p-2 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-gray-100' 
                      : 'bg-white border-gray-300 text-gray-900'
                  } ${fieldErrors.nome ? 'border-red-500' : ''}`}
                />
                {fieldErrors.nome && <p className="mt-1 text-sm text-red-500">{fieldErrors.nome}</p>}
              </div>

              {/* Campo Categoria */}
              <div>
                <label htmlFor="categoria" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Categoria
                </label>
                <input
                  type="text"
                  name="categoria"
                  id="categoria"
                  value={formData.categoria}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-md p-2 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-gray-100' 
                      : 'bg-white border-gray-300 text-gray-900'
                  } ${fieldErrors.categoria ? 'border-red-500' : ''}`}
                />
                {fieldErrors.categoria && <p className="mt-1 text-sm text-red-500">{fieldErrors.categoria}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Campo Sessões */}
                <div>
                  <label htmlFor="sessoes" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Número de Sessões
                  </label>
                  <input
                    type="number"
                    name="sessoes"
                    id="sessoes"
                    min="1"
                    value={formData.sessoes}
                    onChange={handleChange}
                    className={`mt-1 block w-full rounded-md p-2 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                        : 'bg-white border-gray-300 text-gray-900'
                    } ${fieldErrors.sessoes ? 'border-red-500' : ''}`}
                  />
                  {fieldErrors.sessoes && <p className="mt-1 text-sm text-red-500">{fieldErrors.sessoes}</p>}
                </div>

                {/* Campo Valor */}
                <div>
                  <label htmlFor="valor" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Valor do Pacote (€)
                  </label>
                  <input
                    type="number"
                    name="valor"
                    id="valor"
                    value={formData.valor}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    placeholder="Ex: 50.00"
                    className={`mt-1 block w-full rounded-md p-2 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                        : 'bg-white border-gray-300 text-gray-900'
                    } ${fieldErrors.valor ? 'border-red-500' : ''}`}
                  />
                  {fieldErrors.valor && <p className="mt-1 text-sm text-red-500">{fieldErrors.valor}</p>}
                </div>
              </div>

              {/* Campo Descrição */}
              <div>
                <label htmlFor="descricao" className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Descrição (Opcional)
                </label>
                <textarea
                  name="descricao"
                  id="descricao"
                  rows="3"
                  value={formData.descricao}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-md p-2 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-gray-100' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                ></textarea>
              </div>

              {/* Campo Ativo (Checkbox) */}
              <div className="flex items-center">
                <input
                  id="ativo"
                  name="ativo"
                  type="checkbox"
                  checked={formData.ativo}
                  onChange={handleChange}
                  className="h-4 w-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                />
                <label htmlFor="ativo" className={`ml-2 block text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                  Pacote Ativo
                </label>
              </div>

              {/* Botão */}
              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2.5 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-all duration-150 ease-in-out disabled:opacity-70"
              >
                {isSubmitting ? 'A guardar alterações...' : 'Salvar Alterações'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditarPacote;
//
