import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, XCircle, ArrowLeft, UserPlus, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';
import ErrorBoundary from '../components/ErrorBoundary';
import { getAvailableSlots } from '../services/scheduleService';

const sessaoSchema = z.object({
  cliente: z.string().min(1, 'Selecione um cliente'),
  pacote: z.string().min(1, 'Selecione um pacote do cliente'),
  dataHora: z
    .string()
    .min(1, 'Selecione data e hora')
    .refine((val) => new Date(val) > new Date(), { message: 'A data e hora devem ser no futuro' }),
  observacoes: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

const avaliacaoSchema = z.object({
  leadNome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  leadTelefone: z
    .string()
    .min(9, 'Telefone deve ter pelo menos 9 dígitos')
    .regex(/^[\d\+\-\(\)\s]+$/, 'Formato de telefone inválido'),
  leadEmail: z.string().email('Email inválido').optional().or(z.literal('')),
  dataHora: z
    .string()
    .min(1, 'Selecione data e hora')
    .refine((val) => new Date(val) > new Date(), { message: 'A data e hora devem ser no futuro' }),
  observacoes: z.string().max(500, 'Máximo 500 caracteres').optional(),
});

function CriarAgendamento() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState('Sessao');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [horariosVagos, setHorariosVagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [pacotesDoCliente, setPacotesDoCliente] = useState([]);

  const formatDateForInput = (date) => date.toISOString().slice(0, 16);

  // Formulário para Sessão
  const sessaoForm = useForm({
    resolver: zodResolver(sessaoSchema),
    mode: 'onChange',
    defaultValues: { cliente: '', pacote: '', dataHora: formatDateForInput(new Date()), observacoes: '' },
  });

  // Formulário para Avaliação
  const avaliacaoForm = useForm({
    resolver: zodResolver(avaliacaoSchema),
    mode: 'onChange',
    defaultValues: { leadNome: '', leadTelefone: '', leadEmail: '', dataHora: formatDateForInput(new Date()), observacoes: '' },
  });

  const watchObsSessao = sessaoForm.watch('observacoes');
  const watchObsAval = avaliacaoForm.watch('observacoes');

  useEffect(() => {
    if (dataSelecionada) {
      getAvailableSlots(dataSelecionada, 60).then(setHorariosVagos);
    }
  }, [dataSelecionada]);

  useEffect(() => {
    async function fetchClientes() {
      setIsLoadingData(true);
      try {
        const res = await api.get('/clientes');
        setClientes(res.data?.data || []);
      } catch {
        toast.error('Erro ao carregar clientes');
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchClientes();
  }, []);

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
      setClienteSelecionado(clienteRes.data);
      sessaoForm.setValue('cliente', clienteId, { shouldValidate: true });

      const pacotesAtivos = (pacotesRes.data || []).filter(
        (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
      );
      setPacotesDoCliente(pacotesAtivos);

      if (pacotesAtivos.length === 0) {
        toast.warning('Cliente sem pacotes ativos. Vá em "Vendas" para vender um pacote.', { autoClose: 5000 });
        sessaoForm.setValue('pacote', '', { shouldValidate: true });
      } else if (pacotesAtivos.length === 1) {
        sessaoForm.setValue('pacote', pacotesAtivos[0]._id, { shouldValidate: true });
      }
    } catch {
      toast.error('Erro ao carregar dados do cliente');
      setPacotesDoCliente([]);
    } finally {
      setIsLoadingData(false);
    }
  }

  const onSubmitSessao = async (data) => {
    if (pacotesDoCliente.length === 0) {
      toast.error('Cliente não possui pacotes ativos.');
      return;
    }
    const compraPacote = pacotesDoCliente.find((cp) => cp._id === data.pacote);
    if (!compraPacote || compraPacote.sessoesRestantes <= 0) {
      toast.error('Pacote sem sessões disponíveis');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/agendamentos', {
        tipo: 'Sessao',
        cliente: data.cliente,
        compraPacote: data.pacote,
        dataHora: data.dataHora,
        observacoes: data.observacoes || '',
        status: 'Agendado',
      });
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
        status: 'Agendado',
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
    const base = 'block w-full rounded border p-2 shadow-sm focus:ring focus:ring-amber-200 transition-all text-gray-900 bg-white placeholder:text-gray-400';
    if (errors[fieldName]) return `${base} border-red-500 focus:border-red-500`;
    if (dirtyFields[fieldName]) return `${base} border-green-500 focus:border-green-500`;
    return `${base} border-gray-300 focus:border-amber-500`;
  };

  const ErrorMsg = ({ form, name }) => {
    const err = form.formState.errors[name];
    if (!err) return null;
    return (
      <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
        <XCircle className="w-4 h-4 flex-shrink-0" />
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
              <h2 className="text-lg font-medium text-gray-700 mb-3">Pacote do Cliente</h2>

              {clienteSelecionado && pacotesDoCliente.length === 0 && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800 font-medium flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Cliente não possui pacotes ativos
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/vender-pacote')}
                    className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                  >
                    Ir para Vendas
                  </button>
                </div>
              )}

              {pacotesDoCliente.length > 0 && (
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
        className="flex-1 bg-gray-500 text-white font-semibold py-2 px-4 rounded hover:bg-gray-600 transition-colors disabled:opacity-50"
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
