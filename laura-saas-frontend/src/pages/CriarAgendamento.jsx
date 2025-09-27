import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';
import { getAvailableSlots } from '../services/scheduleService'; // Importar a função

function CriarAgendamento() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [horariosVagos, setHorariosVagos] = useState([]);
  
  const formatDateForInput = (date) => {
    return date.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    cliente: '',
    pacote: '',
    dataHora: formatDateForInput(new Date()),
    observacoes: '',
    tipoServico: 'pacote' // 'pacote' ou 'avulso'
  });

  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [errors, setErrors] = useState({});

// useEffect para buscar horários disponíveis quando a dataSelecionada mudar
useEffect(() => {
  if (dataSelecionada) {
    const fetchHorarios = async () => {
      // Chama a sua API do backend para buscar os slots livres
      const slots = await getAvailableSlots(dataSelecionada, 60); // 60 min de duração
      setHorariosVagos(slots);
    };
    fetchHorarios();
  }
}, [dataSelecionada]);

// useEffect para carregar clientes e pacotes ao montar o componente
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
  async function handleClienteChange(clienteId) {
  if (!clienteId) {
    setClienteSelecionado(null);
    setFormData(prev => ({
      ...prev,
      cliente: '',
      pacote: '',
      tipoServico: 'pacote'
    }));
    return;
  }

  try {
    setIsLoading(true);
    const response = await api.get(`/clientes/${clienteId}`);
    const cliente = response.data;

    setClienteSelecionado(cliente);

    // Se o cliente tem pacote ativo, pré-seleciona e força o tipo para 'pacote'
    if (cliente.pacote) {
      const pacoteId = cliente.pacote._id || cliente.pacote;

      setFormData(prev => ({
        ...prev,
        cliente: clienteId,
        pacote: pacoteId,
        tipoServico: 'pacote'
      }));
    } else {
      // Se não tem pacote, limpa o pacote e força para 'avulso'
      setFormData(prev => ({
        ...prev,
        cliente: clienteId,
        pacote: '',
        tipoServico: 'avulso' // Cliente sem pacote só pode fazer serviço avulso
      }));
    }
  } catch (error) {
    toast.error('Erro ao carregar dados do cliente');
    console.error('Erro ao carregar cliente:', error);
  } finally {
    setIsLoading(false);
  }
}

  // Alternar entre pacote e serviço avulso
  const handleTipoServicoChange = (tipo) => {
    // Se o cliente já tem pacote e está tentando mudar para 'pacote', não permitimos
    // O cliente só pode usar o pacote que já tem contratado
    if (tipo === 'pacote' && clienteSelecionado && !clienteSelecionado.pacote) {
      toast.warning('Este cliente não possui pacote ativo. Selecione Serviço Avulso.');
      return;
    }

    setFormData(prev => {
      // Se está mudando para 'pacote' e o cliente tem pacote, usamos o pacote do cliente
      if (tipo === 'pacote' && clienteSelecionado && clienteSelecionado.pacote) {
        const pacoteId = clienteSelecionado.pacote._id || clienteSelecionado.pacote;
        return {
          ...prev,
          tipoServico: tipo,
          pacote: pacoteId
        };
      }
      
      // Se está mudando para 'avulso', limpa o pacote
      return {
        ...prev,
        tipoServico: tipo,
        pacote: ''
      };
    });
  };

  // Validação do formulário
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.cliente) newErrors.cliente = 'Selecione um cliente';
    
    // Pacote só é obrigatório se for do tipo pacote
    if (formData.tipoServico === 'pacote' && !formData.pacote) {
      newErrors.pacote = 'Selecione um pacote';
    }
    
    // Para serviço avulso, também precisamos de um serviço selecionado
    if (formData.tipoServico === 'avulso' && !formData.pacote) {
      newErrors.pacote = 'Selecione um serviço';
    }
    
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
    
    const isValid = validateForm();
    
    if (!isValid) {
      toast.error('Por favor, preencha todos os campos obrigatórios');
      return;
    }

    // Verificar sessões disponíveis se for pacote
    if (formData.tipoServico === 'pacote' && clienteSelecionado?.sessoesRestantes <= 0) {
      toast.error('Cliente não possui sessões disponíveis no pacote');
      return;
    }

    setIsSubmitting(true);
    try {
      const dadosParaEnviar = {
        cliente: formData.cliente,
        pacote: formData.tipoServico === 'pacote' ? formData.pacote : null,
         dataHora: formData.dataHora,
         observacoes: formData.observacoes,
         status: 'Agendado'
      };
      
      // Se for serviço avulso, adicionar informações adicionais
      if (formData.tipoServico === 'avulso') {
        // Buscar informações do pacote selecionado para usar como serviço avulso
        const pacoteSelecionado = pacotes.find(p => p._id === formData.pacote);
        if (pacoteSelecionado) {
          dadosParaEnviar.servicoAvulsoNome = pacoteSelecionado.nome;
          dadosParaEnviar.servicoAvulsoValor = pacoteSelecionado.valor;
        }
      }

      const response = await api.post('/agendamentos', dadosParaEnviar);
      
      toast.success('Agendamento criado com sucesso!');
      navigate('/agendamentos');
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      toast.error(error.response?.data?.message || 'Erro ao criar agendamento');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  // Verifica se o cliente tem pacote ativo
  const clienteTemPacote = clienteSelecionado && clienteSelecionado.pacote;

  return (
    <ErrorBoundary>
      <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Novo Agendamento</h1>
          <button
            onClick={() => navigate('/agendamentos')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Voltar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção 1: Informações Básicas */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Informações Básicas</h2>
            
            {/* Campo Cliente */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente <span className="text-red-500">*</span>
              </label>
              <select
                name="cliente"
                value={formData.cliente}
                onChange={(e) => handleClienteChange(e.target.value)}
                disabled={isSubmitting}
                className={`block w-full rounded border ${
                  errors.cliente ? 'border-red-500' : 'border-gray-300'
                } p-2 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200`}
              >
                <option value="">Selecione um cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente._id} value={cliente._id}>
                    {cliente.nome}
                  </option>
                ))}
                {horariosVagos.map(slot => <option key={slot} value={slot}>{slot}</option>)}
              </select>
              {errors.cliente && (
                <p className="mt-1 text-sm text-red-500">{errors.cliente}</p>
              )}
            </div>

            {/* Campo Data e Hora */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data e Hora <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                name="dataHora"
                value={formData.dataHora}
                onChange={(e) => setFormData({ ...formData, dataHora: e.target.value })}
                disabled={isSubmitting}
                className={`block w-full rounded border ${
                  errors.dataHora ? 'border-red-500' : 'border-gray-300'
                } p-2 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200`}
              />
              {errors.dataHora && (
                <p className="mt-1 text-sm text-red-500">{errors.dataHora}</p>
              )}
            </div>
          </div>

          {/* Seção 2: Detalhes do Serviço */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Detalhes do Serviço</h2>
            
            {/* Informações do pacote atual do cliente */}
            {clienteTemPacote && (
              <div className="p-3 bg-blue-50 rounded-lg mb-4 border border-blue-100">
                <p className="text-sm text-blue-800 font-medium">
                  Pacote atual: {clienteSelecionado.pacote.nome}
                </p>
                <p className="text-sm text-blue-800">
                  Sessões restantes: {clienteSelecionado.sessoesRestantes}
                </p>
              </div>
            )}

            {/* Tipo de Serviço (Radio buttons) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Serviço <span className="text-red-500">*</span>
              </label>
              <div className="flex space-x-4">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="tipoPacote"
                    name="tipoServico"
                    checked={formData.tipoServico === 'pacote'}
                    onChange={() => handleTipoServicoChange('pacote')}
                    disabled={!clienteTemPacote || isSubmitting}
                    className={`h-4 w-4 ${!clienteTemPacote ? 'opacity-50 cursor-not-allowed' : ''} text-amber-600 focus:ring-amber-500 border-gray-300`}
                  />
                  <label 
                    htmlFor="tipoPacote" 
                    className={`ml-2 text-sm ${!clienteTemPacote ? 'text-gray-400' : 'text-gray-700'}`}
                  >
                    Usar Pacote Contratado
                    {!clienteTemPacote && <span className="text-xs ml-1">(Cliente sem pacote)</span>}
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="tipoAvulso"
                    name="tipoServico"
                    checked={formData.tipoServico === 'avulso'}
                    onChange={() => handleTipoServicoChange('avulso')}
                    disabled={isSubmitting}
                    className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300"
                  />
                  <label htmlFor="tipoAvulso" className="ml-2 text-sm text-gray-700">
                    Serviço Avulso
                  </label>
                </div>
              </div>
            </div>

            {/* Campo Pacote/Serviço */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.tipoServico === 'pacote' ? 'Pacote Contratado' : 'Serviço'} <span className="text-red-500">*</span>
              </label>
              
              {/* Se for pacote e o cliente tem pacote, mostramos o pacote fixo */}
              {formData.tipoServico === 'pacote' && clienteTemPacote ? (
                <div className="p-2 bg-gray-100 border border-gray-300 rounded text-gray-700">
                  {clienteSelecionado.pacote.nome}
                </div>
              ) : (
                /* Se for serviço avulso ou cliente sem pacote, mostramos seleção de serviços */
                <select
                  name="pacote"
                  value={formData.pacote}
                  onChange={(e) => setFormData({ ...formData, pacote: e.target.value })}
                  disabled={isSubmitting || (formData.tipoServico === 'pacote' && clienteTemPacote)}
                  className={`block w-full rounded border ${
                    errors.pacote ? 'border-red-500' : 'border-gray-300'
                  } p-2 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200`}
                >
                  <option value="">Selecione um serviço</option>
                  {pacotes.map((pacote) => (
                    <option key={pacote._id} value={pacote._id}>
                      {pacote.nome} - {pacote.valor} R$
                    </option>
                  ))}
                </select>
              )}
              
              {errors.pacote && (
                <p className="mt-1 text-sm text-red-500">{errors.pacote}</p>
              )}
            </div>
          </div>

          {/* Seção 3: Observações */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-700 mb-3">Observações</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações (opcional)
              </label>
              <textarea
                name="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                disabled={isSubmitting}
                className="block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200"
                rows={3}
                placeholder="Ex: Cliente quer massagem com pressão leve."
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-4 pt-2">
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
                  ? 'bg-amber-400 cursor-not-allowed' 
                  : 'bg-amber-500 hover:bg-amber-600'
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
