import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';

function EditarAgendamento() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    clienteId: '',
    pacoteId: '',
    servicoAvulsoNome: '',
    servicoAvulsoValor: '',
    dataHora: '',
    observacoes: '',
    status: 'Agendado',
    tipoServico: 'pacote' // 'pacote' ou 'avulso'
  });

  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [agendamentoOriginal, setAgendamentoOriginal] = useState(null);

  useEffect(() => {
    async function fetchInitialData() {
      setIsLoading(true);
      setFieldErrors({});
      try {
        const agendamentoResponse = await api.get(`/agendamentos/${id}`);
        const agendamentoData = agendamentoResponse.data;
        setAgendamentoOriginal(agendamentoData);

        const [clientesResponse, pacotesResponse] = await Promise.all([
          api.get('/clientes'),
          api.get('/pacotes')
        ]);

        // Determinar o tipo de serviço
        const isAvulso = agendamentoData.servicoAvulsoNome && agendamentoData.servicoAvulsoNome.trim() !== '';

        setFormData({
          clienteId: agendamentoData.cliente?._id || agendamentoData.cliente || '',
          pacoteId: agendamentoData.pacote?._id || agendamentoData.pacote || '',
          servicoAvulsoNome: agendamentoData.servicoAvulsoNome || '',
          servicoAvulsoValor: agendamentoData.servicoAvulsoValor !== undefined ? String(agendamentoData.servicoAvulsoValor) : '',
          dataHora: agendamentoData.dataHora ? agendamentoData.dataHora.substring(0, 16) : '',
          observacoes: agendamentoData.observacoes || '',
          status: agendamentoData.status || 'Agendado',
          tipoServico: isAvulso ? 'avulso' : 'pacote'
        });

        setClientes(clientesResponse.data || []);
        setPacotes(pacotesResponse.data || []);

        // Carregar dados do cliente selecionado
        if (agendamentoData.cliente) {
          const clienteId = agendamentoData.cliente._id || agendamentoData.cliente;
          await loadClienteData(clienteId);
        }

      } catch (error) {
        console.error('Erro ao carregar dados iniciais para edição do agendamento:', error);
        toast.error('Falha ao carregar dados para edição.');
        if (error.response && error.response.status === 404) {
          toast.error('Agendamento não encontrado.');
          navigate('/agendamentos');
        }
      } finally {
        setIsLoading(false);
      }
    }

    if (id) {
      fetchInitialData();
    } else {
      setIsLoading(false);
      toast.error("ID do agendamento não fornecido.");
      navigate('/agendamentos');
    }
  }, [id, navigate]);

  // Carregar dados do cliente
  const loadClienteData = async (clienteId) => {
    try {
      const response = await api.get(`/clientes/${clienteId}`);
      setClienteSelecionado(response.data);
    } catch (error) {
      console.error('Erro ao carregar dados do cliente:', error);
    }
  };

  // Atualizar cliente selecionado quando mudar a seleção
  const handleClienteChange = async (clienteId) => {
    if (!clienteId) {
      setClienteSelecionado(null);
      setFormData(prev => ({
        ...prev,
        clienteId: '',
        pacoteId: '',
        tipoServico: 'avulso'
      }));
      return;
    }

    try {
      setIsLoading(true);
      await loadClienteData(clienteId);
      
      // Manter o mesmo pacote se for o mesmo cliente
      if (clienteId === formData.clienteId) {
        setIsLoading(false);
        return;
      }
      
      // Se for um cliente diferente
      if (clienteSelecionado && clienteSelecionado.pacote) {
        const pacoteId = clienteSelecionado.pacote._id || clienteSelecionado.pacote;
        setFormData(prev => ({
          ...prev,
          clienteId: clienteId,
          pacoteId: pacoteId,
          tipoServico: 'pacote'
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          clienteId: clienteId,
          pacoteId: '',
          tipoServico: 'avulso'
        }));
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do cliente');
      console.error('Erro ao carregar cliente:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
          pacoteId: pacoteId
        };
      }
      
      // Se está mudando para 'avulso', limpa o pacote
      return {
        ...prev,
        tipoServico: tipo,
        pacoteId: ''
      };
    });
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Se estiver tentando mudar o pacote e o cliente já tem um pacote contratado, não permitir
    if (name === 'pacoteId' && clienteSelecionado?.pacote && formData.tipoServico === 'pacote') {
      toast.warning('Não é possível alterar o pacote contratado. Use Serviço Avulso para outros serviços.');
      return;
    }
    
    setFormData(prevFormData => ({
      ...prevFormData,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    if (fieldErrors[name]) {
      setFieldErrors(prevErrors => ({
        ...prevErrors,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.clienteId) {
      newErrors.clienteId = 'Por favor, selecione um cliente.';
    }
    if (!formData.dataHora) {
      newErrors.dataHora = 'A data e hora do agendamento são obrigatórias.';
    } else {
      const dataAgendamento = new Date(formData.dataHora);
      const agora = new Date();
      agora.setMinutes(agora.getMinutes() - 1); 
      if (dataAgendamento < agora) {
        newErrors.dataHora = 'A data e hora do agendamento não podem estar no passado.';
      }
    }
    if (!formData.status || formData.status.trim() === '') {
      newErrors.status = 'Por favor, selecione um status para o agendamento.';
    }
    
    // Validar campos de serviço avulso
    if (formData.tipoServico === 'avulso') {
      if (!formData.pacoteId) {
        newErrors.pacoteId = 'Por favor, selecione um serviço.';
      }
    }
    
    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleStatusChange = async (newStatus) => {
    const oldStatus = formData.status;
    
    // Atualizar estado local primeiro
    setFormData(prev => ({
      ...prev,
      status: newStatus
    }));
    
    // Se for uma ação rápida (Realizado, Cancelado), atualizar imediatamente via API
    if (newStatus === 'Realizado' || newStatus.includes('Cancelado')) {
      const shouldProceed = window.confirm(`Deseja realmente marcar este agendamento como "${newStatus}"?`);
      if (shouldProceed) {
        try {
          setIsSubmitting(true);
          // Usar PATCH para atualizar apenas o status
          await api.patch(`/agendamentos/${id}/status`, { status: newStatus });
          toast.success(`Status alterado para "${newStatus}"! ${newStatus === 'Realizado' ? '✅ Sessão decrementada.' : ''}`);
          
          // Recarregar dados do agendamento
          const agendamentoResponse = await api.get(`/agendamentos/${id}`);
          setAgendamentoOriginal(agendamentoResponse.data);
        } catch (error) {
          console.error('Erro ao alterar status:', error);
          toast.error(error.response?.data?.message || 'Erro ao alterar status.');
          // Reverter para o status anterior em caso de erro
          setFormData(prev => ({
            ...prev,
            status: oldStatus
          }));
        } finally {
          setIsSubmitting(false);
        }
      } else {
        // Se cancelou, reverter o status
        setFormData(prev => ({
          ...prev,
          status: oldStatus
        }));
      }
    }
  };

  const handleSubmit = async (e, isQuickAction = false, quickActionStatus = null) => {
    if (e && !isQuickAction) e.preventDefault();
    
    // Se for ação rápida, não validamos o formulário completo
    if (!isQuickAction && !validateForm()) {
      toast.error('Por favor, corrija os erros indicados no formulário.');
      return;
    }

    setIsSubmitting(true);
    
    // Se for ação rápida, usamos apenas os dados necessários
    const dadosParaEnviar = isQuickAction ? {
      status: quickActionStatus,
      clienteId: formData.clienteId,
      dataHora: formData.dataHora
    } : {
      clienteId: formData.clienteId,
      pacoteId: formData.tipoServico === 'pacote' ? formData.pacoteId : null,
      servicoAvulsoNome: formData.tipoServico === 'avulso' ? 
        (pacotes.find(p => p._id === formData.pacoteId)?.nome || formData.servicoAvulsoNome) : '',
      servicoAvulsoValor: formData.tipoServico === 'avulso' ? 
        (pacotes.find(p => p._id === formData.pacoteId)?.valor || 
         (formData.servicoAvulsoValor !== '' && !isNaN(parseFloat(formData.servicoAvulsoValor)) ? 
          parseFloat(formData.servicoAvulsoValor) : null)) : null,
      dataHora: formData.dataHora,
      observacoes: formData.observacoes.trim(),
      status: formData.status,
    };

    // Limpar campos vazios ou nulos
    Object.keys(dadosParaEnviar).forEach(key => {
      if (dadosParaEnviar[key] === null || dadosParaEnviar[key] === '') {
        delete dadosParaEnviar[key];
      }
    });

    try {
      await api.put(`/agendamentos/${id}`, dadosParaEnviar);
      toast.success('Agendamento atualizado com sucesso! ✨');
      navigate('/agendamentos');
    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error.response?.data || error.message);
      const errorData = error.response?.data;
      if (errorData?.details && Array.isArray(errorData.details)) {
        const backendErrors = {};
        errorData.details.forEach(detail => {
          backendErrors[detail.field] = detail.message;
        });
        setFieldErrors(prevErrors => ({ ...prevErrors, ...backendErrors }));
        toast.error(errorData.message || 'Erro de validação do servidor ao atualizar.');
      } else {
        toast.error(errorData?.message || 'Erro ao atualizar o agendamento. Tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        <p className="mt-3 text-gray-700 text-lg">Carregando dados do agendamento...</p>
      </div>
    );
  }

  // Verifica se o cliente tem pacote ativo
  const clienteTemPacote = clienteSelecionado && clienteSelecionado.pacote;

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/agendamentos')}
          className="mb-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          &larr; Voltar para Agendamentos
        </button>

        <div className="bg-white text-black border border-gray-200 shadow-xl rounded-lg p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-6">
            Editar Agendamento
          </h1>
          
          {/* Botões de Ação Rápida */}
          <div className="mb-8 flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={() => handleStatusChange('Realizado')}
              disabled={isSubmitting}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-colors"
            >
              ✓ Marcar como Realizado
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('Cancelado Pelo Cliente')}
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors"
            >
              ✗ Cancelar (Cliente)
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('Cancelado Pelo Salão')}
              disabled={isSubmitting}
              className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 transition-colors"
            >
              ✗ Cancelar (Salão)
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seção 1: Informações Básicas */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Informações Básicas</h2>
              
              {/* Campo Cliente */}
              <div className="mb-4">
                <label htmlFor="clienteId" className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select
                  name="clienteId"
                  id="clienteId"
                  value={formData.clienteId}
                  onChange={(e) => handleClienteChange(e.target.value)}
                  disabled={isSubmitting}
                  className={`block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200 ${fieldErrors.clienteId ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="">Selecione um cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente._id} value={cliente._id}>
                      {cliente.nome}
                    </option>
                  ))}
                </select>
                {fieldErrors.clienteId && <p className="mt-1 text-sm text-red-500">{fieldErrors.clienteId}</p>}
              </div>
              
              {/* Informações do cliente selecionado */}
              {clienteSelecionado && (
                <div className="p-3 bg-blue-50 rounded-lg mb-4 border border-blue-100">
                  <p className="text-sm text-blue-800 font-medium">
                    Cliente: {clienteSelecionado.nome}
                  </p>
                  {clienteTemPacote && (
                    <>
                      <p className="text-sm text-blue-800">
                        Pacote atual: {clienteSelecionado.pacote.nome}
                      </p>
                      <p className="text-sm text-blue-800">
                        Sessões restantes: {clienteSelecionado.sessoesRestantes}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Campo Data e Hora */}
              <div>
                <label htmlFor="dataHora" className="block text-sm font-medium text-gray-700 mb-1">
                  Data e Hora <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  name="dataHora"
                  id="dataHora"
                  value={formData.dataHora}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className={`block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200 ${fieldErrors.dataHora ? 'border-red-500' : 'border-gray-300'}`}
                />
                {fieldErrors.dataHora && <p className="mt-1 text-sm text-red-500">{fieldErrors.dataHora}</p>}
              </div>
            </div>
          
            {/* Seção 2: Detalhes do Serviço */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Detalhes do Serviço</h2>

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
                      value="pacote"
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
                      value="avulso"
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
                <label htmlFor="pacoteId" className="block text-sm font-medium text-gray-700 mb-1">
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
                    name="pacoteId"
                    id="pacoteId"
                    value={formData.pacoteId}
                    onChange={handleChange}
                    disabled={isSubmitting || (formData.tipoServico === 'pacote' && clienteTemPacote)}
                    className={`block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200 ${fieldErrors.pacoteId ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Selecione um serviço</option>
                    {pacotes.map((pacote) => (
                      <option key={pacote._id} value={pacote._id}>
                        {pacote.nome} - {pacote.valor} R$
                      </option>
                    ))}
                  </select>
                )}

                {fieldErrors.pacoteId && <p className="mt-1 text-sm text-red-500">{fieldErrors.pacoteId}</p>}
              </div>
            </div>

            {/* Seção 3: Observações e Status */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Detalhes Adicionais</h2>

              {/* Campo Observações */}
              <div className="mb-4">
                <label htmlFor="observacoes" className="block text-sm font-medium text-gray-700 mb-1">
                  Observações (opcional)
                </label>
                <textarea
                  name="observacoes"
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className="block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200 border-gray-300"
                  rows="3"
                  placeholder="Ex: Cliente quer massagem com pressão leve."
                ></textarea>
              </div>

              {/* Campo Status */}
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  name="status"
                  id="status"
                  value={formData.status}
                  onChange={handleChange}
                  disabled={isSubmitting}
                  className={`block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring focus:ring-amber-200 ${fieldErrors.status ? 'border-red-500' : 'border-gray-300'}`}
                >
                  <option value="Agendado">Agendado</option>
                  <option value="Confirmado">Confirmado</option>
                  <option value="Realizado">Realizado</option>
                  <option value="Cancelado Pelo Cliente">Cancelado Pelo Cliente</option>
                  <option value="Cancelado Pelo Salão">Cancelado Pelo Salão</option>
                </select>
                {fieldErrors.status && <p className="mt-1 text-sm text-red-500">{fieldErrors.status}</p>}
              </div>
            </div>

            {/* Botão de Salvar */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4 rounded-md font-semibold text-white transition-colors ${
                  isSubmitting ? 'bg-amber-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500'
                }`}
              >
                {isSubmitting ? 'A guardar...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EditarAgendamento;

