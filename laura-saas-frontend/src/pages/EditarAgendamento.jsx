// Em src/pages/EditarAgendamento.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api'; // Corrigido para importação padrão (verifique seu arquivo api.js)

function EditarAgendamento() {
  const { id } = useParams(); // <<--- ADICIONADO: Pegar o ID da URL
  const navigate = useNavigate(); // <<--- ADICIONADO: Para navegação

  const [formData, setFormData] = useState({
    clienteId: '',
    pacoteId: '',
    servicoAvulsoNome: '',
    servicoAvulsoValor: '',
    dataHora: '',
    observacoes: '',
    status: 'Agendado',
  });

  // CORRIGIDO: "clientes" em vez de "cleintes"
  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // ADICIONADO: Estado para controlar o envio do formulário
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    async function fetchInitialData() {
      setIsLoading(true);
      setFieldErrors({});
      try {
        const agendamentoResponse = await api.get(`/agendamentos/${id}`);
        const agendamentoData = agendamentoResponse.data;

        const [clientesResponse, pacotesResponse] = await Promise.all([
          api.get('/clientes'),
          api.get('/pacotes')
        ]);

        setFormData({
          clienteId: agendamentoData.cliente?._id || agendamentoData.cliente || '',
          pacoteId: agendamentoData.pacote?._id || agendamentoData.pacote || '',
          servicoAvulsoNome: agendamentoData.servicoAvulsoNome || '',
          servicoAvulsoValor: agendamentoData.servicoAvulsoValor !== undefined ? String(agendamentoData.servicoAvulsoValor) : '',
          dataHora: agendamentoData.dataHora ? agendamentoData.dataHora.substring(0, 16) : '',
          observacoes: agendamentoData.observacoes || '',
          status: agendamentoData.status || 'Agendado',
        });

        setClientes(clientesResponse.data || []);
        setPacotes(pacotesResponse.data || []);

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

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
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

  // <<--- ADICIONADA: Função validateForm que estava faltando --- >>
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
    // Adicionar outras validações se necessário
    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) { // Agora validateForm() existe
      toast.error('Por favor, corrija os erros indicados no formulário.');
      return;
    }

    setIsSubmitting(true); // Agora setIsSubmitting está definida
    const dadosParaEnviar = {
      clienteId: formData.clienteId,
      pacoteId: formData.pacoteId || null,
      servicoAvulsoNome: formData.servicoAvulsoNome.trim(),
      servicoAvulsoValor: formData.servicoAvulsoValor !== '' && !isNaN(parseFloat(formData.servicoAvulsoValor)) 
                          ? parseFloat(formData.servicoAvulsoValor) 
                          : null,
      dataHora: formData.dataHora,
      observacoes: formData.observacoes.trim(),
      status: formData.status,
    };
    if (!dadosParaEnviar.pacoteId) delete dadosParaEnviar.pacoteId;
    if (dadosParaEnviar.servicoAvulsoNome === '') delete dadosParaEnviar.servicoAvulsoNome;
    if (dadosParaEnviar.servicoAvulsoValor === null) delete dadosParaEnviar.servicoAvulsoValor;

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

  // <<--- CORRIGIDA E SIMPLIFICADA: Estrutura do JSX --- >>
  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        <p className="mt-3 text-gray-700 text-lg">Carregando dados do agendamento...</p>
      </div>
    );
  }

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
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-800 mb-8">
            Editar Agendamento (ID: {id}) {/* Mostrando o ID para referência */}
          </h1>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campo Cliente */}
            <div>
              <label htmlFor="clienteId" className="block text-sm font-medium text-gray-700">Cliente</label>
              <select
                name="clienteId"
                id="clienteId"
                value={formData.clienteId}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.clienteId ? 'border-red-500' : 'border-gray-300'}`}
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
            
            {/* Campo Data e Hora */}
            <div>
              <label htmlFor="dataHora" className="block text-sm font-medium text-gray-700">Data e Hora</label>
              <input
                type="datetime-local"
                name="dataHora"
                id="dataHora"
                value={formData.dataHora}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.dataHora ? 'border-red-500' : 'border-gray-300'}`}
              />
              {fieldErrors.dataHora && <p className="mt-1 text-sm text-red-500">{fieldErrors.dataHora}</p>}
            </div>

            {/* Campo Pacote */}
            <div>
              <label htmlFor="pacoteId" className="block text-sm font-medium text-gray-700">Pacote (Opcional)</label>
              <select
                name="pacoteId"
                id="pacoteId"
                value={formData.pacoteId}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.pacoteId ? 'border-red-500' : 'border-gray-300'}`}
              >
                <option value="">Nenhum / Definir como Serviço Avulso</option>
                {pacotes.map((pacote) => (
                  <option key={pacote._id} value={pacote._id}>
                    {pacote.nome} ({pacote.sessoes} sessões)
                  </option>
                ))}
              </select>
              {fieldErrors.pacoteId && <p className="mt-1 text-sm text-red-500">{fieldErrors.pacoteId}</p>}
            </div>

            {/* Campo Nome do Serviço Avulso */}
            <div>
              <label htmlFor="servicoAvulsoNome" className="block text-sm font-medium text-gray-700">Nome do Serviço Avulso (se não for pacote)</label>
              <input
                type="text"
                name="servicoAvulsoNome"
                id="servicoAvulsoNome"
                value={formData.servicoAvulsoNome}
                onChange={handleChange}
                placeholder="Ex: Limpeza de Pele Profunda"
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.servicoAvulsoNome ? 'border-red-500' : 'border-gray-300'}`}
              />
              {fieldErrors.servicoAvulsoNome && <p className="mt-1 text-sm text-red-500">{fieldErrors.servicoAvulsoNome}</p>}
            </div>

            {/* Campo Valor do Serviço Avulso */}
            <div>
              <label htmlFor="servicoAvulsoValor" className="block text-sm font-medium text-gray-700">Valor do Serviço Avulso (€)</label>
              <input
                type="number"
                name="servicoAvulsoValor"
                id="servicoAvulsoValor"
                value={formData.servicoAvulsoValor}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="Ex: 35.50"
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.servicoAvulsoValor ? 'border-red-500' : 'border-gray-300'}`}
              />
              {fieldErrors.servicoAvulsoValor && <p className="mt-1 text-sm text-red-500">{fieldErrors.servicoAvulsoValor}</p>}
            </div>
            
            {/* Campo Status do Agendamento */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status do Agendamento</label>
              <select
                name="status"
                id="status"
                value={formData.status}
                onChange={handleChange}
                className={`mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 ${fieldErrors.status ? 'border-red-500' : 'border-gray-300'}`}
              >
                <option value="Agendado">Agendado</option>
                <option value="Confirmado">Confirmado pelo Cliente</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado Pelo Cliente">Cancelado Pelo Cliente</option>
                <option value="Cancelado Pelo Salão">Cancelado Pelo Salão</option>
                <option value="Não Compareceu">Não Compareceu (No-Show)</option>
              </select>
              {fieldErrors.status && <p className="mt-1 text-sm text-red-500">{fieldErrors.status}</p>}
            </div>

            {/* Campo Observações */}
            <div>
              <label htmlFor="observacoes" className="block text-sm font-medium text-gray-700">Observações (Opcional)</label>
              <textarea
                name="observacoes"
                id="observacoes"
                rows="3"
                value={formData.observacoes}
                onChange={handleChange}
                placeholder="Ex: Cliente prefere produto X, chegar 10 minutos antes, etc."
                className="mt-1 block w-full rounded-md p-3 shadow-sm focus:border-amber-500 focus:ring-amber-500 border-gray-300"
              ></textarea>
            </div>

            {/* Botão de Submissão */}
            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-all duration-150 ease-in-out disabled:opacity-70"
            >
              {isSubmitting ? 'Salvando alterações...' : 'Salvar Alterações'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default EditarAgendamento;