import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';

function CriarAgendamento() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const formatDateForInput = (date) => {
    return date.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    cliente: '',
    pacote: '',
    dataHora: formatDateForInput(new Date()),
    observacoes: '',
    isAvulso: false
  });

  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [errors, setErrors] = useState({});

  // Carregar dados iniciais
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [clientesRes, pacotesRes] = await Promise.all([
          api.get('/clientes'),
          api.get('/pacotes')
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

  // Atualizar cliente selecionado quando mudar a seleção
  const handleClienteChange = async (clienteId) => {
    if (!clienteId) {
      setClienteSelecionado(null);
      setFormData(prev => ({
        ...prev,
        cliente: '',
        pacote: '',
        isAvulso: false
      }));
      return;
    }

    try {
      setIsLoading(true);
      const response = await api.get(`/clientes/${clienteId}`);
      const cliente = response.data;
      setClienteSelecionado(cliente);
      
      // Se o cliente tem pacote ativo, pré-seleciona
      if (cliente.pacote) {
        setFormData(prev => ({
          ...prev,
          cliente: clienteId,
          pacote: cliente.pacote._id,
          isAvulso: false
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          cliente: clienteId,
          pacote: '',
          isAvulso: false
        }));
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do cliente');
      console.error('Erro ao carregar cliente:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle para serviço avulso
  const handleAvulsoToggle = () => {
    setFormData(prev => ({
      ...prev,
      isAvulso: !prev.isAvulso,
      pacote: '' // Limpa o pacote selecionado quando alternar
    }));
  };

  // Validação do formulário
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.cliente) newErrors.cliente = 'Selecione um cliente';
    if (!formData.pacote) newErrors.pacote = 'Selecione um pacote';
    if (!formData.dataHora) {
      newErrors.dataHora = 'Selecione uma data e hora';
    } else {
      const selectedDate = new Date(formData.dataHora);
      const now = new Date();
      if (selectedDate < now) {
        newErrors.dataHora = 'A data não pode ser no passado';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handler para submit do formulário
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    // Verificar sessões disponíveis se não for avulso
    if (!formData.isAvulso && clienteSelecionado?.sessoesRestantes <= 0) {
      toast.error('Cliente não possui sessões disponíveis no pacote');
      return;
    }

    setIsSubmitting(true);
    try {
      const dadosParaEnviar = {
        ...formData,
        status: 'AGENDADO'
      };

      await api.post('/agendamentos', dadosParaEnviar);
      toast.success('Agendamento criado com sucesso!');
      navigate('/agendamentos');
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast.error(error.response?.data?.error || 'Erro ao criar agendamento');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Novo Agendamento</h1>
          <button
            onClick={() => navigate('/agendamentos')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Voltar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campo Cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Cliente *
            </label>
            <select
              name="cliente"
              value={formData.cliente}
              onChange={(e) => handleClienteChange(e.target.value)}
              disabled={isSubmitting}
              className={`mt-1 block w-full rounded border ${
                errors.cliente ? 'border-red-500' : 'border-gray-300'
              } p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200`}
            >
              <option value="">Selecione um cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente._id} value={cliente._id}>
                  {cliente.nome}
                </option>
              ))}
            </select>
            {errors.cliente && (
              <p className="mt-1 text-sm text-red-500">{errors.cliente}</p>
            )}
          </div>

          {/* Informações do pacote atual do cliente */}
          {clienteSelecionado && clienteSelecionado.pacote && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Pacote atual: {clienteSelecionado.pacote.nome}
              </p>
              <p className="text-sm text-blue-800">
                Sessões restantes: {clienteSelecionado.sessoesRestantes}
              </p>
            </div>
          )}

          {/* Toggle Serviço Avulso */}
          <div className={`flex items-center space-x-2 ${
            formData.isAvulso ? 'bg-yellow-50 p-2 rounded' : ''
          }`}>
            <input
              type="checkbox"
              id="isAvulso"
              checked={formData.isAvulso}
              onChange={handleAvulsoToggle}
              disabled={isSubmitting}
              className="rounded border-gray-300"
            />
            <label htmlFor="isAvulso" className="text-sm text-gray-700">
              Serviço Avulso
            </label>
          </div>

          {/* Campo Pacote (mostrado apenas se for serviço avulso ou cliente sem pacote) */}
          {(formData.isAvulso || !clienteSelecionado?.pacote) && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Pacote *
              </label>
              <select
                name="pacote"
                value={formData.pacote}
                onChange={(e) => setFormData({ ...formData, pacote: e.target.value })}
                disabled={isSubmitting}
                className={`mt-1 block w-full rounded border ${
                  errors.pacote ? 'border-red-500' : 'border-gray-300'
                } p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200`}
              >
                <option value="">Selecione um pacote</option>
                {pacotes.map((pacote) => (
                  <option key={pacote._id} value={pacote._id}>
                    {pacote.nome} - {pacote.valor} R$
                  </option>
                ))}
              </select>
              {errors.pacote && (
                <p className="mt-1 text-sm text-red-500">{errors.pacote}</p>
              )}
            </div>
          )}

          {/* Campo Data e Hora */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Data e Hora *
            </label>
            <input
              type="datetime-local"
              name="dataHora"
              value={formData.dataHora}
              onChange={(e) => setFormData({ ...formData, dataHora: e.target.value })}
              disabled={isSubmitting}
              className={`mt-1 block w-full rounded border ${
                errors.dataHora ? 'border-red-500' : 'border-gray-300'
              } p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200`}
            />
            {errors.dataHora && (
              <p className="mt-1 text-sm text-red-500">{errors.dataHora}</p>
            )}
          </div>

          {/* Campo Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Observações
            </label>
            <textarea
              name="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              disabled={isSubmitting}
              className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
              rows={3}
              placeholder="Ex: Cliente quer massagem com pressão leve."
            />
          </div>

          {/* Botões */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Deseja cancelar o agendamento? As alterações serão perdidas.')) {
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
              className={`flex-1 ${
                isSubmitting 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white font-semibold py-2 px-4 rounded transition-colors`}
            >
              {isSubmitting ? 'Criando...' : 'Criar Agendamento'}
            </button>
          </div>
        </form>
      </div>
    </ErrorBoundary>
  );
}

export default CriarAgendamento;