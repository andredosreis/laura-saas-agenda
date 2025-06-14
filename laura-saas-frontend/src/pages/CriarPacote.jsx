import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';

function CriarPacote() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    nome: '',
    categoria: '',
    sessoes: 1,
    valor: '',
    descricao: '',
    ativo: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

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
    if (!formData.nome.trim()) newErrors.nome = 'O nome do pacote é obrigatório.';
    if (!formData.categoria.trim()) newErrors.categoria = 'A categoria é obrigatória.';
    if (formData.sessoes === '' || formData.sessoes < 1) newErrors.sessoes = 'O número de sessões deve ser pelo menos 1.';
    if (formData.valor === '') {
        newErrors.valor = 'O valor do pacote é obrigatório.';
    } else if (isNaN(parseFloat(formData.valor)) || parseFloat(formData.valor) < 0) {
        newErrors.valor = 'O valor deve ser um número positivo.';
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
      ...formData,
      valor: parseFloat(formData.valor),
      sessoes: parseInt(formData.sessoes, 10),
    };

    try {
      await api.post('/pacotes', dadosParaEnviar);
      toast.success('Pacote criado com sucesso!');
      navigate('/pacotes'); // Redireciona para a lista de pacotes
    } catch (error) {
      console.error('Erro ao criar pacote:', error.response?.data || error.message);
      const errorData = error.response?.data;
      if (errorData?.details && Array.isArray(errorData.details)) {
        const backendErrors = {};
        errorData.details.forEach(detail => {
          backendErrors[detail.field] = detail.message;
        });
        setFieldErrors(prevErrors => ({ ...prevErrors, ...backendErrors }));
        toast.error(errorData.message || 'Erro de validação do servidor.');
      } else {
        toast.error(errorData?.message || 'Erro ao criar pacote. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-2xl mx-auto">
        <button
            onClick={() => navigate('/pacotes')}
            className="mb-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
            &larr; Voltar para Pacotes
        </button>
        <div className="bg-white text-black border border-gray-200 shadow-xl rounded-lg p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-8">
            Criar Novo Pacote
          </h1>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campo Nome */}
            <div>
              <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome do Pacote</label>
              <input
                type="text"
                name="nome"
                id="nome"
                value={formData.nome}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.nome ? 'border-red-500' : 'border-gray-300'}`}
              />
              {fieldErrors.nome && <p className="mt-1 text-sm text-red-500">{fieldErrors.nome}</p>}
            </div>

            {/* Campo Categoria */}
            <div>
              <label htmlFor="categoria" className="block text-sm font-medium text-gray-700">Categoria</label>
              <input
                type="text"
                name="categoria"
                id="categoria"
                value={formData.categoria}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.categoria ? 'border-red-500' : 'border-gray-300'}`}
              />
              {fieldErrors.categoria && <p className="mt-1 text-sm text-red-500">{fieldErrors.categoria}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Campo Sessões */}
              <div>
                <label htmlFor="sessoes" className="block text-sm font-medium text-gray-700">Número de Sessões</label>
                <input
                  type="number"
                  name="sessoes"
                  id="sessoes"
                  min="1"
                  value={formData.sessoes}
                  onChange={handleChange}
                  className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.sessoes ? 'border-red-500' : 'border-gray-300'}`}
                />
                {fieldErrors.sessoes && <p className="mt-1 text-sm text-red-500">{fieldErrors.sessoes}</p>}
              </div>

              {/* Campo Valor */}
              <div>
                <label htmlFor="valor" className="block text-sm font-medium text-gray-700">
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
                  className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.valor ? 'border-red-500' : 'border-gray-300'}`}
                />
                {fieldErrors.valor && <p className="mt-1 text-sm text-red-500">{fieldErrors.valor}</p>}
              </div>
            </div>

            {/* Campo Descrição */}
            <div>
              <label htmlFor="descricao" className="block text-sm font-medium text-gray-700">Descrição (Opcional)</label>
              <textarea
                name="descricao"
                id="descricao"
                rows="3"
                value={formData.descricao}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 border-gray-300"
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
              <label htmlFor="ativo" className="ml-2 block text-sm text-gray-900">
                Pacote Ativo
              </label>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-all duration-150 ease-in-out disabled:opacity-70"
            >
              {isSubmitting ? 'A criar pacote...' : 'Criar Pacote'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CriarPacote;