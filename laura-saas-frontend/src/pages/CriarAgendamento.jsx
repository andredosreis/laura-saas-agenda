import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, XCircle, ArrowLeft, UserPlus, Users, Gift, Package } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';
import { getAvailableSlots } from '../services/scheduleService';

const sessaoSchema = z.object({
  cliente: z.string().min(1, 'Selecione um cliente'),
  servicoTipo: z.enum(['pacote', 'avulso', 'oferta']),
  pacote: z.string().optional(),
  servicoAvulsoNome: z.string().optional(),
  servicoAvulsoValor: z.string().optional(),
  servicoOfertaNome: z.string().optional(),
  dataHora: z
    .string()
    .min(1, 'Selecione data e hora')
    .refine((val) => new Date(val) > new Date(), { message: 'A data e hora devem ser no futuro' }),
  observacoes: z.string().max(500, 'Máximo 500 caracteres').optional(),
}).superRefine((data, ctx) => {
  if (data.servicoTipo === 'pacote' && !data.pacote) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pacote'],
      message: 'Selecione um pacote do cliente',
    });
  }

  if (data.servicoTipo === 'avulso') {
    if (!data.servicoAvulsoNome?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servicoAvulsoNome'],
        message: 'Informe o nome do serviço avulso',
      });
    }
    const valor = Number(data.servicoAvulsoValor);
    if (!data.servicoAvulsoValor || Number.isNaN(valor) || valor <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['servicoAvulsoValor'],
        message: 'Informe um valor maior que zero',
      });
    }
  }

  if (data.servicoTipo === 'oferta' && !data.servicoOfertaNome?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['servicoOfertaNome'],
      message: 'Informe o serviço ofertado',
    });
  }
});

const avaliacaoSchema = z.object({
  leadNome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  leadTelefone: z
    .string()
    .min(9, 'Telefone deve ter pelo menos 9 dígitos')
    .regex(/^[\d+\-()\s]+$/, 'Formato de telefone inválido'),
  leadEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  dataHora: z
    .string()
    .min(1, 'Selecione data e hora')
    .refine((val) => new Date(val) > new Date(), { message: 'A data e hora devem ser no futuro' }),
  observacoes: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

function CriarAgendamento() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preSelecaoFeita = useRef(false);
  const [tipo, setTipo] = useState('Sessao');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataSelecionada] = useState('');
  const [, setHorariosVagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [pacotesDoCliente, setPacotesDoCliente] = useState([]);

  const formatDateForInput = (date) => date.toISOString().slice(0, 16);

  // Formulário para Sessão
  const sessaoForm = useForm({
    resolver: zodResolver(sessaoSchema),
    mode: 'onChange',
    defaultValues: {
      cliente: '',
      servicoTipo: 'pacote',
      pacote: '',
      servicoAvulsoNome: '',
      servicoAvulsoValor: '',
      servicoOfertaNome: '',
      dataHora: formatDateForInput(new Date()),
      observacoes: '',
    },
  });

  // Formulário para Avaliação
  const avaliacaoForm = useForm({
    resolver: zodResolver(avaliacaoSchema),
    mode: 'onChange',
    defaultValues: { leadNome: '', leadTelefone: '', leadEmail: '', dataHora: formatDateForInput(new Date()), observacoes: '' },
  });

  const watchObsSessao = sessaoForm.watch('observacoes');
  const watchObsAval = avaliacaoForm.watch('observacoes');
  const servicoTipoSessao = sessaoForm.watch('servicoTipo');

  useEffect(() => {
    if (dataSelecionada) {
      getAvailableSlots(dataSelecionada, 60).then(setHorariosVagos);
    }
  }, [dataSelecionada]);

  useEffect(() => {
    async function fetchClientes() {
      setIsLoadingData(true);
      try {
        const res = await api.get('/clientes?limit=100');
        const lista = (res.data?.data || []).slice()
          .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-PT', { sensitivity: 'base' }));
        setClientes(lista);
      } catch {
        toast.error('Erro ao carregar clientes');
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchClientes();
  }, []);

  // Pré-selecção via deep-link (?cliente=:id), ex: vindo do card do cliente.
  // Corre uma vez assim que a lista de clientes existir.
  useEffect(() => {
    if (preSelecaoFeita.current) return;
    const clienteParam = searchParams.get('cliente');
    if (clienteParam && clientes.some((c) => c._id === clienteParam)) {
      preSelecaoFeita.current = true;
      handleClienteChange(clienteParam);
    }
    // handleClienteChange é uma função estável do componente — fora das deps de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, searchParams]);

  async function handleClienteChange(clienteId) {
    if (!clienteId) {
      setClienteSelecionado(null);
      setPacotesDoCliente([]);
      sessaoForm.setValue('cliente', '', { shouldValidate: true });
      sessaoForm.setValue('pacote', '', { shouldValidate: true });
      return;
    }
    try {
      setIsLoadingData(true);
      const [clienteRes, pacotesRes] = await Promise.all([
        api.get(`/clientes/${clienteId}`),
        api.get(`/compras-pacotes/cliente/${clienteId}`),
      ]);
      setClienteSelecionado(clienteRes.data?.data || clienteRes.data);
      sessaoForm.setValue('cliente', clienteId, { shouldValidate: true });

      const pacotesAtivos = (pacotesRes.data || []).filter(
        (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
      );
      setPacotesDoCliente(pacotesAtivos);

      if (pacotesAtivos.length === 0) {
        toast.info('Cliente sem pacotes ativos. Pode vender um pacote, agendar avulso ou oferecer um serviço.', { autoClose: 6000 });
        sessaoForm.setValue('pacote', '', { shouldValidate: true });
        if (sessaoForm.getValues('servicoTipo') === 'pacote') {
          sessaoForm.setValue('servicoTipo', 'oferta', { shouldValidate: true });
        }
      } else if (pacotesAtivos.length === 1) {
        sessaoForm.setValue('pacote', pacotesAtivos[0]._id, { shouldValidate: true });
        if (sessaoForm.getValues('servicoTipo') === 'oferta') {
          sessaoForm.setValue('servicoTipo', 'pacote', { shouldValidate: true });
        }
      }
    } catch {
      toast.error('Erro ao carregar dados do cliente');
      setPacotesDoCliente([]);
    } finally {
      setIsLoadingData(false);
    }
  }

  const onSubmitSessao = async (data) => {
    let payload = {
      tipo: 'Sessao',
      cliente: data.cliente,
      dataHora: data.dataHora,
      observacoes: data.observacoes || '',
    };

    if (data.servicoTipo === 'pacote') {
      const compraPacote = pacotesDoCliente.find((cp) => cp._id === data.pacote);
      if (!compraPacote || compraPacote.sessoesRestantes <= 0) {
        toast.error('Pacote sem sessões disponíveis');
        return;
      }
      payload = {
        ...payload,
        servicoTipo: 'pacote',
        compraPacote: data.pacote,
      };
    } else if (data.servicoTipo === 'avulso') {
      payload = {
        ...payload,
        servicoTipo: 'avulso',
        servicoAvulsoNome: data.servicoAvulsoNome.trim(),
        servicoAvulsoValor: parseFloat(data.servicoAvulsoValor),
      };
    } else {
      payload = {
        ...payload,
        servicoTipo: 'oferta',
        servicoAvulsoNome: data.servicoOfertaNome.trim(),
        servicoAvulsoValor: 0,
      };
    }

    setIsSubmitting(true);
    try {
      await api.post('/agendamentos', payload);
      toast.success('Agendamento criado com sucesso!');
      navigate('/agendamentos');
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Erro ao criar agendamento');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmitAvaliacao = async (data) => {
    setIsSubmitting(true);
    try {
      await api.post('/agendamentos', {
        tipo: 'Avaliacao',
        lead: {
          nome: data.leadNome,
          telefone: data.leadTelefone,
          email: data.leadEmail || undefined,
        },
        dataHora: data.dataHora,
        observacoes: data.observacoes || '',
      });
      toast.success('Avaliação agendada com sucesso!');
      navigate('/agendamentos');
    } catch (error) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Erro ao criar avaliação');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInputClasses = (form, fieldName) => {
    const errors = form.formState.errors;
    const dirtyFields = form.formState.dirtyFields;
    const base = 'block w-full rounded-sm border p-2 shadow-xs focus:ring-3 focus:ring-amber-200 transition-all text-gray-900 bg-white placeholder:text-gray-400';
    if (errors[fieldName]) return `${base} border-red-500 focus:border-red-500`;
    if (dirtyFields[fieldName]) return `${base} border-green-500 focus:border-green-500`;
    return `${base} border-gray-300 focus:border-amber-500`;
  };

  const ErrorMsg = ({ form, name }) => {
    const err = form.formState.errors[name];
    if (!err) return null;
    return (
      <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
        <XCircle className="w-4 h-4 shrink-0" />
        {err.message}
      </p>
    );
  };

  if (isLoadingData && clientes.length === 0 && tipo === 'Sessao') {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Novo Agendamento</h1>
          <button
            onClick={() => navigate('/agendamentos')}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        </div>

        {/* Toggle de tipo */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-2">Tipo de agendamento</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('Sessao')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${
                tipo === 'Sessao'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              Sessão / Retorno
            </button>
            <button
              type="button"
              onClick={() => setTipo('Avaliacao')}
              className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-all ${
                tipo === 'Avaliacao'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Avaliação (lead)
            </button>
          </div>
        </div>

        {/* ── FORMULÁRIO SESSÃO ── */}
        {tipo === 'Sessao' && (
          <form onSubmit={sessaoForm.handleSubmit(onSubmitSessao)} className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Informações Básicas</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <Controller
                  name="cliente"
                  control={sessaoForm.control}
                  render={({ field }) => (
                    <select
                      {...field}
                      onChange={(e) => { field.onChange(e); handleClienteChange(e.target.value); }}
                      disabled={isSubmitting}
                      className={getInputClasses(sessaoForm, 'cliente')}
                    >
                      <option value="">Selecione um cliente</option>
                      {clientes.map((c) => (
                        <option key={c._id} value={c._id}>{c.nome}</option>
                      ))}
                    </select>
                  )}
                />
                <ErrorMsg form={sessaoForm} name="cliente" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data e Hora <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  {...sessaoForm.register('dataHora')}
                  disabled={isSubmitting}
                  className={getInputClasses(sessaoForm, 'dataHora')}
                />
                <ErrorMsg form={sessaoForm} name="dataHora" />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Serviço do Agendamento</h2>

              {clienteSelecionado && pacotesDoCliente.length === 0 && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200 mb-4">
                  <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Cliente não possui pacotes ativos
                  </p>
                  <p className="text-sm text-yellow-700 mt-1">
                    Pode vender um pacote, cobrar um serviço avulso ou registrar uma oferta sem faturamento.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => sessaoForm.setValue('servicoTipo', 'oferta', { shouldValidate: true })}
                      className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                    >
                      Dar oferta
                    </button>
                    <button
                      type="button"
                      onClick={() => sessaoForm.setValue('servicoTipo', 'avulso', { shouldValidate: true })}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Serviço avulso
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/vender-pacote')}
                      className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                    >
                      Ir para Vendas
                    </button>
                  </div>
                </div>
              )}

              <Controller
                name="servicoTipo"
                control={sessaoForm.control}
                render={({ field }) => (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => field.onChange('pacote')}
                      disabled={isSubmitting || pacotesDoCliente.length === 0}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                        field.value === 'pacote'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : pacotesDoCliente.length === 0
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      Pacote
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange('avulso')}
                      disabled={isSubmitting}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                        field.value === 'avulso'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      Serviço avulso
                    </button>
                    <button
                      type="button"
                      onClick={() => field.onChange('oferta')}
                      disabled={isSubmitting}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                        field.value === 'oferta'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Gift className="w-4 h-4" />
                      Oferta
                    </button>
                  </div>
                )}
              />

              {servicoTipoSessao === 'pacote' && pacotesDoCliente.length > 0 && (
                <div className="space-y-3">
                  {pacotesDoCliente.map((cp) => (
                    <div key={cp._id} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-sm text-blue-900 font-semibold">{cp.pacote?.nome || 'Pacote'}</p>
                      <p className="text-xs text-blue-700 mt-1">
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        {cp.sessoesRestantes} sessões restantes
                      </p>
                    </div>
                  ))}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Selecionar Pacote <span className="text-red-500">*</span>
                    </label>
                    <Controller
                      name="pacote"
                      control={sessaoForm.control}
                      render={({ field }) => (
                        <select
                          {...field}
                          disabled={isSubmitting || pacotesDoCliente.length === 0}
                          className={getInputClasses(sessaoForm, 'pacote')}
                        >
                          <option value="">Selecione o pacote</option>
                          {pacotesDoCliente.map((cp) => (
                            <option key={cp._id} value={cp._id}>
                              {cp.pacote?.nome} — {cp.sessoesRestantes} sessões restantes
                            </option>
                          ))}
                        </select>
                      )}
                    />
                    <ErrorMsg form={sessaoForm} name="pacote" />
                  </div>
                </div>
              )}

              {servicoTipoSessao === 'pacote' && pacotesDoCliente.length === 0 && (
                <p className="text-sm text-gray-500">
                  Selecione “Oferta” ou “Serviço avulso” para continuar sem pacote ativo.
                </p>
              )}

              {servicoTipoSessao === 'avulso' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serviço avulso <span className="text-red-500">*</span>
                    </label>
                    <input
                      {...sessaoForm.register('servicoAvulsoNome')}
                      disabled={isSubmitting}
                      className={getInputClasses(sessaoForm, 'servicoAvulsoNome')}
                      placeholder="Ex: Drenagem linfática"
                    />
                    <ErrorMsg form={sessaoForm} name="servicoAvulsoNome" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valor <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      {...sessaoForm.register('servicoAvulsoValor')}
                      disabled={isSubmitting}
                      className={getInputClasses(sessaoForm, 'servicoAvulsoValor')}
                      placeholder="0.00"
                    />
                    <ErrorMsg form={sessaoForm} name="servicoAvulsoValor" />
                  </div>
                </div>
              )}

              {servicoTipoSessao === 'oferta' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serviço ofertado <span className="text-red-500">*</span>
                  </label>
                  <input
                    {...sessaoForm.register('servicoOfertaNome')}
                    disabled={isSubmitting}
                    className={getInputClasses(sessaoForm, 'servicoOfertaNome')}
                    placeholder="Ex: Sessão cortesia"
                  />
                  <ErrorMsg form={sessaoForm} name="servicoOfertaNome" />
                  <p className="mt-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                    Esta oferta fica no agendamento e no histórico de realizados, mas não entra no faturamento.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Observações</h2>
              <textarea
                {...sessaoForm.register('observacoes')}
                disabled={isSubmitting}
                className={getInputClasses(sessaoForm, 'observacoes')}
                rows={3}
                placeholder="Ex: Cliente quer massagem com pressão leve."
              />
              <p className="mt-1 text-sm text-gray-500">{watchObsSessao?.length || 0}/500</p>
            </div>

            <BotoesSubmit isSubmitting={isSubmitting} onVoltar={() => navigate('/agendamentos')} label="Criar Agendamento" />
          </form>
        )}

        {/* ── FORMULÁRIO AVALIAÇÃO ── */}
        {tipo === 'Avaliacao' && (
          <form onSubmit={avaliacaoForm.handleSubmit(onSubmitAvaliacao)} className="space-y-6">
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <p className="text-sm text-amber-800">
                Agendamento de avaliação para lead — o cliente não precisa estar cadastrado. Se fechar pacote, será cadastrado automaticamente.
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Dados do Lead</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  {...avaliacaoForm.register('leadNome')}
                  disabled={isSubmitting}
                  className={getInputClasses(avaliacaoForm, 'leadNome')}
                  placeholder="Nome completo"
                />
                <ErrorMsg form={avaliacaoForm} name="leadNome" />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  {...avaliacaoForm.register('leadTelefone')}
                  disabled={isSubmitting}
                  className={getInputClasses(avaliacaoForm, 'leadTelefone')}
                  placeholder="910 000 000"
                />
                <ErrorMsg form={avaliacaoForm} name="leadTelefone" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (opcional)
                </label>
                <input
                  {...avaliacaoForm.register('leadEmail')}
                  disabled={isSubmitting}
                  className={getInputClasses(avaliacaoForm, 'leadEmail')}
                  placeholder="email@exemplo.com"
                />
                <ErrorMsg form={avaliacaoForm} name="leadEmail" />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Data e Hora</h2>
              <input
                type="datetime-local"
                {...avaliacaoForm.register('dataHora')}
                disabled={isSubmitting}
                className={getInputClasses(avaliacaoForm, 'dataHora')}
              />
              <ErrorMsg form={avaliacaoForm} name="dataHora" />
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-700 mb-3">Observações</h2>
              <textarea
                {...avaliacaoForm.register('observacoes')}
                disabled={isSubmitting}
                className={getInputClasses(avaliacaoForm, 'observacoes')}
                rows={3}
                placeholder="Ex: Lead veio pelo Instagram."
              />
              <p className="mt-1 text-sm text-gray-500">{watchObsAval?.length || 0}/500</p>
            </div>

            <BotoesSubmit isSubmitting={isSubmitting} onVoltar={() => navigate('/agendamentos')} label="Agendar Avaliação" />
          </form>
        )}
      </div>
    </ErrorBoundary>
  );
}

function BotoesSubmit({ isSubmitting, onVoltar, label }) {
  return (
    <div className="flex gap-4 pt-2">
      <button
        type="button"
        onClick={onVoltar}
        disabled={isSubmitting}
        className="flex-1 bg-gray-500 text-white font-semibold py-2 px-4 rounded-sm hover:bg-gray-600 transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={isSubmitting}
        className={`flex-1 flex items-center justify-center ${
          isSubmitting ? 'bg-amber-400 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-600'
        } text-white font-semibold py-2 px-4 rounded transition-colors`}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            A processar...
          </>
        ) : label}
      </button>
    </div>
  );
}

export default CriarAgendamento;
