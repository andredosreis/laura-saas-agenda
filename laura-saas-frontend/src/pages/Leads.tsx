import { useEffect, useState, useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  Inbox, Plus, Search, Phone, Mail, Trash2, Loader2, RefreshCw,
  X, Sparkles, AlertCircle, List, Columns,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import leadsService from '../services/leadsService';
import {
  type Lead,
  type LeadStatus,
  type LeadOrigem,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
} from '../types/lead';
import { createLeadFormSchema, type CreateLeadInput } from '../schemas/leadSchemas';

type StatusFilter = 'todos' | LeadStatus;

const semAcentos = (s?: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Leads() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [totalServidor, setTotalServidor] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-white/10'
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';

  const fetchLeads = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: { limit: number; status?: LeadStatus } = { limit: 100 };
      if (statusFilter !== 'todos') params.status = statusFilter;
      const res = await leadsService.list(params);
      setLeads(res.data || []);
      setTotalServidor(res.pagination?.total ?? res.data.length);
    } catch (err: unknown) {
      // 403 leadsAtivo=false → mostra ecrã específico em vez de toast
      const axiosErr = err as { response?: { status?: number; data?: { code?: string } } };
      if (axiosErr?.response?.status === 403 && axiosErr.response.data?.code === 'leads_inactive') {
        setLeads([]);
        setTotalServidor(0);
      } else {
        console.error('Erro ao carregar leads:', err);
        toast.error('Erro ao carregar lista de leads.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const leadsFiltrados = useMemo(() => {
    const termo = semAcentos(busca.trim());
    return leads.filter((lead) =>
      !termo ||
      semAcentos(lead.nome).includes(termo) ||
      (lead.telefone || '').includes(termo) ||
      semAcentos(lead.email || '').includes(termo)
    );
  }, [leads, busca]);

  const handleDelete = async (lead: Lead) => {
    const nome = lead.nome || lead.telefone;
    if (!window.confirm(`Eliminar o lead ${nome}?`)) return;
    try {
      await leadsService.remove(lead._id);
      setLeads((prev) => prev.filter((l) => l._id !== lead._id));
      toast.success('Lead eliminado.');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      toast.error(axiosErr?.response?.data?.error || 'Erro ao eliminar lead.');
      fetchLeads();
    }
  };

  if (isLoading && leads.length === 0) {
    return (
      <div className={`min-h-screen pt-24 flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className={`mt-3 text-base ${subTextClass}`}>A carregar leads...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pt-24 pb-8 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <div>
              <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${textClass}`}>
                <Inbox className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500" />
                Leads
              </h1>
              <p className={`text-sm mt-1 ${subTextClass}`}>
                {leadsFiltrados.length} {leadsFiltrados.length === 1 ? 'lead' : 'leads'}
                {busca && ` para "${busca}"`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchLeads}
                disabled={isLoading}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                    : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
                title="Atualizar lista"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
              {/* Toggle Lista / Kanban */}
              <div className={`flex rounded-xl overflow-hidden border text-sm font-medium ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                <button
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white"
                  aria-current="page"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  onClick={() => navigate('/leads/kanban')}
                  className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${
                    isDarkMode
                      ? 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Columns className="w-4 h-4" />
                  <span className="hidden sm:inline">Kanban</span>
                </button>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium shadow-lg shadow-indigo-500/25"
              >
                <Plus className="w-4 h-4" />
                Novo Lead
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextClass} pointer-events-none`} />
              <input
                type="text"
                placeholder="Pesquisar por nome, telefone ou email..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all ${inputClass}`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={`px-4 py-3 rounded-xl border text-sm focus:outline-hidden focus:border-indigo-500 transition-all ${inputClass}`}
            >
              <option value="todos">Todos os estados</option>
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {totalServidor > leads.length && (
            <div className={`mb-4 flex items-center gap-2 p-3 rounded-xl border text-sm ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>A mostrar {leads.length} de {totalServidor} leads. Usa pesquisa/filtros para encontrar um específico.</span>
            </div>
          )}

          {/* Lista */}
          {leads.length === 0 ? (
            <div className={`${cardClass} rounded-2xl p-12 text-center`}>
              <Inbox className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
              <p className={`text-base ${textClass}`}>
                {statusFilter === 'todos'
                  ? 'Ainda sem leads.'
                  : `Sem leads em ${LEAD_STAGE_LABELS[statusFilter]}.`}
              </p>
              <p className={`text-sm mt-1 ${subTextClass}`}>
                Os leads chegarão automaticamente via WhatsApp quando o ia-service estiver activo.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium"
              >
                <Plus className="w-4 h-4" />
                Adicionar Lead manualmente
              </button>
            </div>
          ) : leadsFiltrados.length === 0 ? (
            <div className={`${cardClass} rounded-2xl p-12 text-center`}>
              <Search className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
              <p className={`text-base ${textClass}`}>Nenhum lead encontrado para "{busca}".</p>
              <button
                onClick={() => setBusca('')}
                className="mt-3 text-sm text-indigo-500 hover:text-indigo-600 font-medium"
              >
                Limpar pesquisa
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leadsFiltrados.map((lead) => (
                <LeadCard
                  key={lead._id}
                  lead={lead}
                  onView={(id) => navigate(`/leads/${id}`)}
                  onDelete={handleDelete}
                  cardClass={cardClass}
                  textClass={textClass}
                  subTextClass={subTextClass}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          )}
        </div>

        {showCreate && (
          <CreateLeadModal
            isDarkMode={isDarkMode}
            onClose={() => setShowCreate(false)}
            onCreated={(lead) => {
              setLeads((prev) => [lead, ...prev]);
              setShowCreate(false);
              toast.success('Lead criado!');
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// =====================================================================
// LeadCard
// =====================================================================

interface LeadCardProps {
  lead: Lead;
  onView: (id: string) => void;
  onDelete: (lead: Lead) => void;
  cardClass: string;
  textClass: string;
  subTextClass: string;
  isDarkMode: boolean;
}

function LeadCard({ lead, onView, onDelete, cardClass, textClass, subTextClass, isDarkMode }: LeadCardProps) {
  const cor = LEAD_STAGE_COLORS[lead.status];
  const inicial = (lead.nome || lead.telefone || '?').charAt(0).toUpperCase();
  const horas = Math.floor((Date.now() - new Date(lead.ultimaInteracao).getTime()) / (1000 * 60 * 60));
  const tempoRel = horas < 1 ? 'agora' : horas < 24 ? `há ${horas}h` : `há ${Math.floor(horas / 24)}d`;

  return (
    <div
      className={`${cardClass} rounded-2xl p-5 hover:shadow-lg transition-all cursor-pointer`}
      onClick={() => onView(lead._id)}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center font-bold text-lg"
          style={{
            backgroundColor: `${cor}20`,
            border: `1px solid ${cor}40`,
            color: cor,
          }}
        >
          {inicial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={`font-semibold truncate ${textClass}`} title={lead.nome}>
              {lead.nome || 'Lead sem nome'}
            </h2>
            {!lead.iaAtiva && (
              <span title="IA pausada" className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
                IA off
              </span>
            )}
          </div>
          <p className={`text-xs flex items-center gap-1 mt-0.5 ${subTextClass}`}>
            <Phone className="w-3 h-3" />
            {lead.telefone}
          </p>
          {lead.email && (
            <p className={`text-xs flex items-center gap-1 mt-0.5 ${subTextClass}`}>
              <Mail className="w-3 h-3" />
              <span className="truncate">{lead.email}</span>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ backgroundColor: `${cor}20`, color: cor }}
          >
            {LEAD_STAGE_LABELS[lead.status]}
          </span>
          <span className={`text-xs ${subTextClass}`}>{tempoRel}</span>
        </div>
        {lead.interesse && (
          <div className={`flex items-center gap-2 text-sm ${subTextClass}`}>
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="truncate">{lead.interesse}</span>
          </div>
        )}
        <div className={`text-xs ${subTextClass}`}>
          Origem: <strong className={textClass}>{originLabel(lead.origem)}</strong>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView(lead._id);
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl ${
            isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'
          } transition-colors text-sm font-medium`}
        >
          <span className={textClass}>Abrir</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(lead);
          }}
          className={`p-2 rounded-xl ${
            isDarkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
          } transition-colors`}
          title="Eliminar"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>
    </div>
  );
}

const originLabel = (o: LeadOrigem) => ({
  whatsapp: 'WhatsApp',
  manual: 'Manual',
  import: 'Importado',
  outro: 'Outro',
}[o]);

// =====================================================================
// CreateLeadModal
// =====================================================================

interface CreateLeadModalProps {
  isDarkMode: boolean;
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}

function CreateLeadModal({ isDarkMode, onClose, onCreated }: CreateLeadModalProps) {
  const [form, setForm] = useState<CreateLeadInput>({
    nome: '', telefone: '', email: '', interesse: '', urgencia: 'baixa', observacoes: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateLeadInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof CreateLeadInput>(k: K, v: CreateLeadInput[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = createLeadFormSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of result.error.issues) {
        const k = issue.path[0] as keyof CreateLeadInput;
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    try {
      setSubmitting(true);
      const payload: CreateLeadInput = {
        ...result.data,
        email: result.data.email || undefined, // remove ''
      };
      const res = await leadsService.create(payload);
      onCreated(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; code?: string } } };
      const code = axiosErr?.response?.data?.code;
      if (code === 'leads_inactive') {
        toast.error('Funcionalidade Leads não está activa neste plano.');
      } else if (axiosErr?.response?.data?.error?.toLowerCase().includes('telefone')) {
        toast.error('Já existe um lead com este telefone.');
      } else {
        toast.error(axiosErr?.response?.data?.error || 'Erro ao criar lead.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputC = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-2xl ${isDarkMode ? 'bg-slate-800 border border-white/10' : 'bg-white'} shadow-2xl`}>
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Novo Lead</h2>
          <button onClick={onClose} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Nome (opcional)</label>
            <input
              type="text" value={form.nome ?? ''}
              onChange={(e) => update('nome', e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-hidden focus:border-indigo-500 ${inputC}`}
            />
            {errors.nome && <p className="text-red-400 text-xs mt-1">{errors.nome}</p>}
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Telefone *</label>
            <input
              type="tel" required value={form.telefone}
              onChange={(e) => update('telefone', e.target.value)}
              placeholder="912345678"
              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-hidden focus:border-indigo-500 ${inputC}`}
            />
            {errors.telefone && <p className="text-red-400 text-xs mt-1">{errors.telefone}</p>}
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Email (opcional)</label>
            <input
              type="email" value={form.email ?? ''}
              onChange={(e) => update('email', e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-hidden focus:border-indigo-500 ${inputC}`}
            />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Interesse</label>
              <input
                type="text" value={form.interesse ?? ''}
                onChange={(e) => update('interesse', e.target.value)}
                placeholder="Ex: Drenagem"
                className={`w-full px-4 py-2.5 rounded-xl border focus:outline-hidden focus:border-indigo-500 ${inputC}`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Urgência</label>
              <select
                value={form.urgencia ?? 'baixa'}
                onChange={(e) => update('urgencia', e.target.value as CreateLeadInput['urgencia'])}
                className={`w-full px-4 py-2.5 rounded-xl border focus:outline-hidden focus:border-indigo-500 ${inputC}`}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div>
            <label className={`block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>Observações</label>
            <textarea
              rows={3} value={form.observacoes ?? ''}
              onChange={(e) => update('observacoes', e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-hidden focus:border-indigo-500 ${inputC}`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium disabled:opacity-50"
            >
              {submitting ? 'A criar...' : 'Criar Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Leads;
