import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { DateTime } from 'luxon';
import { ArrowLeft, CalendarClock, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

// O backend devolve dataHora em UTC (ISO com 'Z'). O input datetime-local precisa
// da hora de parede de Lisboa. `substring(0,16)` cortava o 'Z' e mostrava/regravava
// a hora UTC — deslocando o agendamento 1h ao guardar a edição (no verão WEST).
const toInputLisboa = (iso) =>
  iso ? DateTime.fromISO(iso).setZone('Europe/Lisbon').toFormat("yyyy-MM-dd'T'HH:mm") : '';

function EditarAgendamento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const [formData, setFormData] = useState({
    clienteId: '',
    pacoteId: '',
    servicoAvulsoNome: '',
    servicoAvulsoValor: '',
    dataHora: '',
    observacoes: '',
    status: 'Agendado',
    tipoServico: 'pacote', // 'pacote' | 'avulso' | 'oferta'
    tipoAgendamento: 'Sessao', // 'Sessao' | 'Retorno' | 'Avaliacao'
    leadNome: '',
    leadTelefone: '',
    leadEmail: ''
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
          api.get('/clientes?limit=100'),
          api.get('/pacotes?limit=100')
        ]);

        // Determinar o tipo de serviço
        const isAvulso = agendamentoData.servicoAvulsoNome && agendamentoData.servicoAvulsoNome.trim() !== '';
        const tipoServico = agendamentoData.servicoTipo || (isAvulso ? 'avulso' : 'pacote');
        const tipoAgendamento = agendamentoData.tipo || 'Sessao';

        setFormData({
          clienteId: agendamentoData.cliente?._id || agendamentoData.cliente || '',
          pacoteId: agendamentoData.pacote?._id || agendamentoData.pacote || '',
          servicoAvulsoNome: agendamentoData.servicoAvulsoNome || '',
          servicoAvulsoValor: agendamentoData.servicoAvulsoValor !== undefined ? String(agendamentoData.servicoAvulsoValor) : '',
          dataHora: toInputLisboa(agendamentoData.dataHora),
          observacoes: agendamentoData.observacoes || '',
          status: agendamentoData.status || 'Agendado',
          tipoServico,
          tipoAgendamento,
          leadNome: agendamentoData.lead?.nome || '',
          leadTelefone: agendamentoData.lead?.telefone || '',
          leadEmail: agendamentoData.lead?.email || ''
        });

        const sortByName = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-PT', { sensitivity: 'base' });
        setClientes((clientesResponse.data?.data || []).slice().sort(sortByName));
        setPacotes((pacotesResponse.data?.data || []).slice().sort(sortByName));

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
      setClienteSelecionado(response.data?.data || response.data);
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
        tipoServico: 'oferta'
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
          tipoServico: 'oferta'
        }));
      }
    } catch (error) {
      toast.error('Erro ao carregar dados do cliente');
      console.error('Erro ao carregar cliente:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Alternar entre pacote, serviço avulso e oferta
  const handleTipoServicoChange = (tipo) => {
    if (tipo === 'pacote' && clienteSelecionado && !clienteSelecionado.pacote) {
      toast.warning('Este cliente não possui pacote ativo. Use serviço avulso ou oferta.');
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

      // Se está mudando para avulso/oferta, limpa o pacote
      return {
        ...prev,
        tipoServico: tipo,
        pacoteId: '',
        servicoAvulsoValor: tipo === 'oferta' ? '0' : prev.servicoAvulsoValor
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

    if (formData.tipoAgendamento === 'Avaliacao') {
      if (!formData.leadNome || formData.leadNome.trim() === '') {
        newErrors.leadNome = 'Nome do lead é obrigatório.';
      }
      if (!formData.leadTelefone || formData.leadTelefone.trim() === '') {
        newErrors.leadTelefone = 'Telefone do lead é obrigatório.';
      }
    } else {
      if (!formData.clienteId) {
        newErrors.clienteId = 'Por favor, selecione um cliente.';
      }
    }

    if (!formData.dataHora) {
      newErrors.dataHora = 'A data e hora do agendamento são obrigatórias.';
    }

    if (!formData.status || formData.status.trim() === '') {
      newErrors.status = 'Por favor, selecione um status para o agendamento.';
    }

    if (formData.tipoAgendamento !== 'Avaliacao' && formData.tipoServico === 'oferta' && !formData.servicoAvulsoNome.trim()) {
      newErrors.servicoAvulsoNome = 'Informe o serviço ofertado.';
    }

    if (formData.tipoAgendamento !== 'Avaliacao' && formData.tipoServico === 'avulso') {
      const servicoSelecionado = pacotes.find(p => p._id === formData.pacoteId);
      if (!servicoSelecionado && !formData.servicoAvulsoNome.trim()) {
        newErrors.servicoAvulsoNome = 'Informe ou selecione o serviço avulso.';
      }
    }

    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Por favor, corrija os erros indicados no formulário.');
      return;
    }

    setIsSubmitting(true);

    // Status NUNCA vai no PUT: mudanças de status têm semântica própria
    // (Realizado decrementa sessão do pacote, cancelamentos aplicam política)
    // que só o PATCH /status executa. O PUT trata dos restantes campos.
    let dadosParaEnviar;
    if (formData.tipoAgendamento === 'Avaliacao') {
      // Fluxo lead (avaliação): editar lead, sem cliente/pacote
      dadosParaEnviar = {
        lead: {
          nome: formData.leadNome.trim(),
          telefone: formData.leadTelefone.trim(),
          email: formData.leadEmail.trim() || undefined
        },
        dataHora: formData.dataHora,
        observacoes: formData.observacoes.trim()
      };
    } else {
      // Fluxo cliente: Sessao/Retorno
      const servicoSelecionado = pacotes.find(p => p._id === formData.pacoteId);
      dadosParaEnviar = {
        cliente: formData.clienteId,
        pacote: formData.tipoServico === 'pacote' ? (formData.pacoteId || null) : null,
        compraPacote: null,
        servicoTipo: formData.tipoServico,
        servicoAvulsoNome: formData.tipoServico === 'avulso' || formData.tipoServico === 'oferta'
          ? (servicoSelecionado?.nome || formData.servicoAvulsoNome || '')
          : '',
        servicoAvulsoValor: formData.tipoServico === 'oferta'
          ? 0
          : formData.tipoServico === 'avulso'
          ? (servicoSelecionado?.valor ||
             (formData.servicoAvulsoValor !== '' && !isNaN(parseFloat(formData.servicoAvulsoValor))
               ? parseFloat(formData.servicoAvulsoValor) : null))
          : null,
        dataHora: formData.dataHora,
        observacoes: formData.observacoes.trim()
      };
    }

    // Remover propriedades com valor undefined (mantém null e string vazia — backend trata)
    Object.keys(dadosParaEnviar).forEach(key => {
      if (dadosParaEnviar[key] === undefined) {
        delete dadosParaEnviar[key];
      }
    });

    try {
      await api.put(`/agendamentos/${id}`, dadosParaEnviar);

      // Status alterado → caminho próprio (PATCH) com a semântica de negócio.
      if (agendamentoOriginal && formData.status !== agendamentoOriginal.status) {
        await api.patch(`/agendamentos/${id}/status`, { status: formData.status });
      }

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

  // ── Design system (mesmas classes das Configurações) ──
  const pageClass = `min-h-screen pt-20 sm:pt-24 px-4 pb-10 md:px-8 transition-colors ${
    isDark ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'
  }`;
  const card = isDark
    ? 'bg-slate-800/50 border border-white/10 rounded-2xl p-5'
    : 'bg-white border border-slate-200 rounded-2xl p-5 shadow-xs';
  const sectionTitle = `text-base font-semibold mb-4 ${isDark ? 'text-white' : 'text-slate-800'}`;
  const label = `block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`;
  const inputBase = `block w-full px-3 py-2.5 rounded-lg text-sm transition-colors outline-hidden focus:ring-2 focus:ring-indigo-500/50 ${
    isDark
      ? 'bg-slate-900/60 border border-white/10 text-white placeholder-slate-500'
      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400'
  }`;
  const inputErr = 'border-red-500/60';
  const infoBox = isDark
    ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
    : 'bg-indigo-50 border border-indigo-100 text-indigo-800';
  const radioLabel = isDark ? 'text-slate-300' : 'text-slate-700';
  const radioLabelOff = isDark ? 'text-slate-500' : 'text-slate-400';

  if (isLoading) {
    return (
      <div className={`${pageClass} flex flex-col justify-center items-center`}>
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className={`mt-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>A carregar agendamento...</p>
      </div>
    );
  }

  // Verifica se o cliente tem pacote ativo
  const clienteTemPacote = clienteSelecionado && clienteSelecionado.pacote;

  return (
    <div className={pageClass}>
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/agendamentos')}
          className={`mb-6 inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-3 py-2 transition-colors ${
            isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Agendamentos
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <CalendarClock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Editar Agendamento</h1>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                {formData.tipoAgendamento === 'Avaliacao' ? 'Avaliação (Lead)' : formData.tipoAgendamento}
              </span>
              {agendamentoOriginal?.criadoPorIA && (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-medium">
                  🤖 IA
                </span>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Seção 1: Informações Básicas */}
          <div className={card}>
            <h2 className={sectionTitle}>Informações Básicas</h2>

            {formData.tipoAgendamento === 'Avaliacao' ? (
              <>
                {/* Campos editáveis do lead */}
                <div className="mb-4">
                  <label htmlFor="leadNome" className={label}>
                    Nome do Lead <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="leadNome"
                    id="leadNome"
                    value={formData.leadNome}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="Nome completo"
                    className={`${inputBase} ${fieldErrors.leadNome ? inputErr : ''}`}
                  />
                  {fieldErrors.leadNome && <p className="mt-1 text-sm text-red-400">{fieldErrors.leadNome}</p>}
                </div>

                <div className="mb-4">
                  <label htmlFor="leadTelefone" className={label}>
                    Telefone <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="leadTelefone"
                    id="leadTelefone"
                    value={formData.leadTelefone}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="910 000 000"
                    className={`${inputBase} ${fieldErrors.leadTelefone ? inputErr : ''}`}
                  />
                  {fieldErrors.leadTelefone && <p className="mt-1 text-sm text-red-400">{fieldErrors.leadTelefone}</p>}
                </div>

                <div className="mb-4">
                  <label htmlFor="leadEmail" className={label}>
                    Email (opcional)
                  </label>
                  <input
                    type="email"
                    name="leadEmail"
                    id="leadEmail"
                    value={formData.leadEmail}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="email@exemplo.com"
                    className={inputBase}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Campo Cliente (Sessao/Retorno) */}
                <div className="mb-4">
                  <label htmlFor="clienteId" className={label}>
                    Cliente <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="clienteId"
                    id="clienteId"
                    value={formData.clienteId}
                    onChange={(e) => handleClienteChange(e.target.value)}
                    disabled={isSubmitting}
                    className={`${inputBase} ${fieldErrors.clienteId ? inputErr : ''}`}
                  >
                    <option value="">Selecione um cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente._id} value={cliente._id}>
                        {cliente.nome}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.clienteId && <p className="mt-1 text-sm text-red-400">{fieldErrors.clienteId}</p>}
                </div>

                {/* Informações do cliente selecionado */}
                {clienteSelecionado && (
                  <div className={`p-3 rounded-lg mb-4 text-sm ${infoBox}`}>
                    <p className="font-medium">{clienteSelecionado.nome}</p>
                    {clienteTemPacote && (
                      <>
                        <p>Pacote atual: {clienteSelecionado.pacote.nome}</p>
                        <p>Sessões restantes: {clienteSelecionado.sessoesRestantes}</p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Campo Data e Hora */}
            <div>
              <label htmlFor="dataHora" className={label}>
                Data e Hora <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                name="dataHora"
                id="dataHora"
                value={formData.dataHora}
                onChange={handleChange}
                disabled={isSubmitting}
                className={`${inputBase} ${fieldErrors.dataHora ? inputErr : ''}`}
              />
              {fieldErrors.dataHora && <p className="mt-1 text-sm text-red-400">{fieldErrors.dataHora}</p>}
            </div>
          </div>

          {/* Seção 2: Detalhes do Serviço — não se aplica a Avaliacao */}
          {formData.tipoAgendamento !== 'Avaliacao' && (
          <div className={card}>
            <h2 className={sectionTitle}>Detalhes do Serviço</h2>

            {/* Tipo de Serviço (Radio buttons) */}
            <div className="mb-4">
              <label className={label}>Tipo de Serviço</label>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="tipoPacote"
                    name="tipoServico"
                    value="pacote"
                    checked={formData.tipoServico === 'pacote'}
                    onChange={() => handleTipoServicoChange('pacote')}
                    disabled={!clienteTemPacote || isSubmitting}
                    className={`h-4 w-4 accent-indigo-500 ${!clienteTemPacote ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <label
                    htmlFor="tipoPacote"
                    className={`ml-2 text-sm ${!clienteTemPacote ? radioLabelOff : radioLabel}`}
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
                    className="h-4 w-4 accent-indigo-500"
                  />
                  <label htmlFor="tipoAvulso" className={`ml-2 text-sm ${radioLabel}`}>
                    Serviço Avulso
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="tipoOferta"
                    name="tipoServico"
                    value="oferta"
                    checked={formData.tipoServico === 'oferta'}
                    onChange={() => handleTipoServicoChange('oferta')}
                    disabled={isSubmitting}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <label htmlFor="tipoOferta" className={`ml-2 text-sm ${radioLabel}`}>
                    Oferta sem cobrança
                  </label>
                </div>
              </div>
            </div>

            {/* Campo Pacote/Serviço */}
            <div>
              <label htmlFor="pacoteId" className={label}>
                {formData.tipoServico === 'pacote'
                  ? 'Pacote Contratado'
                  : formData.tipoServico === 'oferta'
                    ? 'Serviço ofertado'
                    : 'Serviço (opcional)'}
              </label>

              {/* Se for pacote e o cliente tem pacote, mostramos o pacote fixo */}
              {formData.tipoServico === 'pacote' && clienteTemPacote ? (
                <div className={`px-3 py-2.5 rounded-lg text-sm ${
                  isDark ? 'bg-slate-900/60 border border-white/10 text-slate-300' : 'bg-slate-100 border border-slate-200 text-slate-700'
                }`}>
                  {clienteSelecionado.pacote.nome}
                </div>
              ) : formData.tipoServico === 'oferta' ? (
                <>
                  <input
                    type="text"
                    name="servicoAvulsoNome"
                    id="servicoAvulsoNome"
                    value={formData.servicoAvulsoNome}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    placeholder="Ex: Sessão cortesia"
                    className={`${inputBase} ${fieldErrors.servicoAvulsoNome ? inputErr : ''}`}
                  />
                  <p className={`mt-2 text-sm rounded-lg p-2 ${
                    isDark ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-emerald-700 bg-emerald-50 border border-emerald-100'
                  }`}>
                    Esta oferta fica no agendamento e no histórico, mas não entra no faturamento.
                  </p>
                </>
              ) : (
                /* Se for serviço avulso ou cliente sem pacote, mostramos seleção de serviços */
                <select
                  name="pacoteId"
                  id="pacoteId"
                  value={formData.pacoteId}
                  onChange={handleChange}
                  disabled={isSubmitting || (formData.tipoServico === 'pacote' && clienteTemPacote)}
                  className={`${inputBase} ${fieldErrors.pacoteId ? inputErr : ''}`}
                >
                  <option value="">Selecione um serviço (opcional)</option>
                  {pacotes.map((pacote) => (
                    <option key={pacote._id} value={pacote._id}>
                      {pacote.nome} - {pacote.valor} €
                    </option>
                  ))}
                </select>
              )}

              {fieldErrors.pacoteId && <p className="mt-1 text-sm text-red-400">{fieldErrors.pacoteId}</p>}
              {fieldErrors.servicoAvulsoNome && <p className="mt-1 text-sm text-red-400">{fieldErrors.servicoAvulsoNome}</p>}
            </div>
          </div>
          )}

          {/* Seção 3: Observações e Status */}
          <div className={card}>
            <h2 className={sectionTitle}>Detalhes Adicionais</h2>

            {/* Campo Observações */}
            <div className="mb-4">
              <label htmlFor="observacoes" className={label}>
                Observações (opcional)
              </label>
              <textarea
                name="observacoes"
                id="observacoes"
                value={formData.observacoes}
                onChange={handleChange}
                disabled={isSubmitting}
                className={inputBase}
                rows="3"
                placeholder="Ex: Cliente quer massagem com pressão leve."
              ></textarea>
            </div>

            {/* Campo Status — a mudança segue pelo PATCH /status ao guardar
                (Realizado decrementa sessão; cancelamentos aplicam política) */}
            <div>
              <label htmlFor="status" className={label}>
                Status <span className="text-red-500">*</span>
              </label>
              <select
                name="status"
                id="status"
                value={formData.status}
                onChange={handleChange}
                disabled={isSubmitting}
                className={`${inputBase} ${fieldErrors.status ? inputErr : ''}`}
              >
                <option value="Agendado">Agendado</option>
                <option value="Confirmado">Confirmado</option>
                <option value="Realizado">Realizado</option>
                <option value="Cancelado Pelo Cliente">Cancelado Pelo Cliente</option>
                <option value="Cancelado Pelo Salão">Cancelado Pelo Salão</option>
              </select>
              {fieldErrors.status && <p className="mt-1 text-sm text-red-400">{fieldErrors.status}</p>}
              {agendamentoOriginal && formData.status !== agendamentoOriginal.status && (
                <p className={`mt-2 text-sm rounded-lg p-2 ${infoBox}`}>
                  O status muda de "{agendamentoOriginal.status}" para "{formData.status}" ao guardar
                  {formData.status === 'Realizado' ? ' — a sessão do pacote será descontada.' : '.'}
                </p>
              )}
            </div>
          </div>

          {/* Botão de Salvar */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-60 disabled:transform-none"
            >
              {isSubmitting ? 'A guardar...' : 'Guardar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditarAgendamento;
