import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Loader2, Phone, Mail, Sparkles, Clock,
  UserCheck, Brain, WifiOff, ChevronDown,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { ConversationThread } from '../components/leads/ConversationThread';
import { ManualReplyComposer } from '../components/leads/ManualReplyComposer';
import { ConverterClienteModal } from '../components/leads/ConverterClienteModal';
import leadsService from '../services/leadsService';
import {
  type Lead,
  type LeadStatus,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
} from '../types/lead';
import type { ThreadMessage } from '../components/leads/ConversationThread';

const POLL_INTERVAL = 5_000;

function LeadDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [changingStage, setChangingStage] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLead = useCallback(async (silent = false) => {
    if (!id) return;
    try {
      if (!silent) setIsLoading(true);
      else setIsPolling(true);
      const res = await leadsService.get(id);
      const data = res.data as { lead: Lead; conversa: unknown; messages?: ThreadMessage[] };
      setLead(data.lead);
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number } };
      if (axErr?.response?.status === 404) {
        toast.error('Lead não encontrado.');
        navigate('/leads');
      } else if (!silent) {
        toast.error('Erro ao carregar o lead.');
      }
    } finally {
      setIsLoading(false);
      setIsPolling(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchLead(false);
    pollRef.current = setInterval(() => fetchLead(true), POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchLead]);

  const handleStageChange = async (toStage: LeadStatus) => {
    if (!lead || toStage === lead.status || changingStage) return;
    if (toStage === 'convertido') {
      setShowConverter(true);
      return;
    }
    try {
      setChangingStage(true);
      const res = await leadsService.moveStage(lead._id, { stage: toStage });
      setLead(res.data);
      toast.success(`Lead movido para "${LEAD_STAGE_LABELS[toStage]}".`);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      toast.error(axErr?.response?.data?.error || 'Erro ao mover stage.');
    } finally {
      setChangingStage(false);
    }
  };

  const handleToggleAi = async () => {
    if (!lead) return;
    try {
      const res = await leadsService.pauseAi(lead._id, !lead.iaAtiva);
      setLead(res.data);
      toast.success(res.data.iaAtiva ? 'IA reactivada.' : 'IA pausada.');
    } catch {
      toast.error('Erro ao alternar IA.');
    }
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen pt-24 flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className={`mt-3 text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>A carregar lead...</p>
      </div>
    );
  }

  if (!lead) return null;

  const cor = LEAD_STAGE_COLORS[lead.status];
  const isConverted = lead.status === 'convertido';
  const isPerdido = lead.status === 'perdido';
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-white/10'
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subClass = isDarkMode ? 'text-slate-400' : 'text-gray-500';

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pt-24 pb-8 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">

          {/* Back + Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate('/leads')}
              className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className={`text-xl font-bold truncate ${textClass}`}>
                {lead.nome || 'Lead sem nome'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${cor}20`, color: cor }}
                >
                  {LEAD_STAGE_LABELS[lead.status]}
                </span>
                {isPolling && (
                  <span className={`text-xs ${subClass}`}>a actualizar...</span>
                )}
              </div>
            </div>
          </div>

          {/* Main layout: thread (left) + info panel (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Thread column */}
            <div className={`lg:col-span-2 rounded-2xl flex flex-col overflow-hidden min-h-[500px] ${cardClass}`}>
              <div className={`px-5 py-4 border-b flex items-center justify-between ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
                <h2 className={`font-semibold ${textClass}`}>Conversa WhatsApp</h2>
                {!isConverted && !isPerdido && (
                  <span className={`text-xs ${subClass}`}>
                    {lead.iaAtiva ? '● IA activa' : '○ IA pausada'}
                  </span>
                )}
              </div>

              <ConversationThread
                messages={messages}
                isPolling={isPolling}
                isDarkMode={isDarkMode}
              />

              {!isConverted && !isPerdido && (
                <ManualReplyComposer
                  lead={lead}
                  isDarkMode={isDarkMode}
                  onReplySent={(updatedLead) => setLead(updatedLead)}
                />
              )}
            </div>

            {/* Info panel */}
            <div className="space-y-4">

              {/* Contact info */}
              <div className={`${cardClass} rounded-2xl p-5`}>
                <h3 className={`text-sm font-semibold mb-4 ${textClass}`}>Contacto</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Phone className={`w-4 h-4 shrink-0 ${subClass}`} />
                    <span className={`text-sm ${textClass}`}>{lead.telefone}</span>
                  </div>
                  {lead.email && (
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 shrink-0 ${subClass}`} />
                      <span className={`text-sm truncate ${textClass}`}>{lead.email}</span>
                    </div>
                  )}
                  {lead.interesse && (
                    <div className="flex items-center gap-3">
                      <Sparkles className={`w-4 h-4 shrink-0 ${subClass}`} />
                      <span className={`text-sm ${textClass}`}>{lead.interesse}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Clock className={`w-4 h-4 shrink-0 ${subClass}`} />
                    <span className={`text-xs ${subClass}`}>
                      {new Date(lead.ultimaInteracao).toLocaleString('pt-PT', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stage selector */}
              {!isConverted && (
                <div className={`${cardClass} rounded-2xl p-5`}>
                  <h3 className={`text-sm font-semibold mb-3 ${textClass}`}>Etapa do pipeline</h3>
                  <div className="relative">
                    <select
                      value={lead.status}
                      onChange={(e) => handleStageChange(e.target.value as LeadStatus)}
                      disabled={changingStage}
                      className={`w-full appearance-none px-4 py-2.5 pr-9 rounded-xl border text-sm font-medium focus:outline-hidden focus:border-indigo-500 disabled:opacity-60 transition-all ${
                        isDarkMode
                          ? 'bg-slate-700/50 border-white/10 text-white'
                          : 'bg-gray-50 border-gray-300 text-gray-900'
                      }`}
                      style={{ color: cor }}
                    >
                      {LEAD_STAGES.filter((s) => s !== 'convertido').map((s) => (
                        <option key={s} value={s}>{LEAD_STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                    <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${subClass}`} />
                  </div>
                </div>
              )}

              {/* Qualificação */}
              {lead.qualificacao?.score != null && (
                <div className={`${cardClass} rounded-2xl p-5`}>
                  <h3 className={`text-sm font-semibold mb-3 ${textClass}`}>Qualificação IA</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${subClass}`}>Score</span>
                      <span className={`text-sm font-bold ${textClass}`}>{lead.qualificacao.score}/100</span>
                    </div>
                    <div className={`h-2 rounded-full ${isDarkMode ? 'bg-white/10' : 'bg-gray-200'}`}>
                      <div
                        className="h-2 rounded-full bg-linear-to-r from-indigo-500 to-purple-500 transition-all"
                        style={{ width: `${lead.qualificacao.score}%` }}
                      />
                    </div>
                    {lead.qualificacao.motivoInteresse && (
                      <p className={`text-xs mt-2 ${subClass}`}>{lead.qualificacao.motivoInteresse}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Observações */}
              {lead.observacoes && (
                <div className={`${cardClass} rounded-2xl p-5`}>
                  <h3 className={`text-sm font-semibold mb-2 ${textClass}`}>Observações</h3>
                  <p className={`text-sm whitespace-pre-wrap ${subClass}`}>{lead.observacoes}</p>
                </div>
              )}

              {/* Perdido info */}
              {isPerdido && lead.perdido?.motivo && (
                <div className={`rounded-2xl p-4 border ${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-100'}`}>
                  <p className="text-xs text-red-500 font-semibold mb-1">Motivo de perda</p>
                  <p className={`text-sm ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{lead.perdido.motivo}</p>
                </div>
              )}

              {/* Action buttons */}
              {!isConverted && !isPerdido && (
                <div className="space-y-2">
                  <button
                    onClick={() => setShowConverter(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-linear-to-r from-green-500 to-emerald-600 hover:opacity-90 transition-all text-white font-semibold shadow-lg shadow-green-500/20"
                  >
                    <UserCheck className="w-4 h-4" />
                    Converter em Cliente
                  </button>

                  <button
                    onClick={handleToggleAi}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      lead.iaAtiva
                        ? isDarkMode ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-300 text-amber-600 hover:bg-amber-50'
                        : isDarkMode ? 'border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
                    }`}
                  >
                    {lead.iaAtiva
                      ? <><WifiOff className="w-4 h-4" /> Pausar IA</>
                      : <><Brain className="w-4 h-4" /> Reactivar IA</>
                    }
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConverter && (
        <ConverterClienteModal
          lead={lead}
          isDarkMode={isDarkMode}
          onClose={() => setShowConverter(false)}
          onConverted={(updatedLead) => setLead(updatedLead)}
        />
      )}
    </ErrorBoundary>
  );
}

export default LeadDetalhe;
