import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Loader2, MessageSquare, Phone, Brain, WifiOff,
  ExternalLink, Search, ArrowLeft,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { ConversationThread, type ThreadMessage } from '../components/leads/ConversationThread';
import { ConversaComposer } from '../components/conversas/ConversaComposer';
import conversasService from '../services/conversasService';
import type { ConversaListItem, ConversaMensagem } from '../types/conversa';

const POLL_INTERVAL = 5_000;

type Filtro = 'todas' | 'leads' | 'clientes';

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'leads', label: '🌱 Leads' },
  { key: 'clientes', label: '👤 Clientes' },
];

function formatHora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function Conversas() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  const [conversas, setConversas] = useState<ConversaListItem[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState<ConversaListItem | null>(null);
  const [messages, setMessages] = useState<ConversaMensagem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedPhoneRef = useRef<string | null>(null);
  selectedPhoneRef.current = selected?.telefone ?? null;

  const fetchConversas = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      else setIsPolling(true);
      const res = await conversasService.list({ tipo: filtro, limit: 100 });
      setConversas(res.data);
    } catch {
      if (!silent) toast.error('Erro ao carregar conversas.');
    } finally {
      setIsLoading(false);
      setIsPolling(false);
    }
  }, [filtro]);

  const fetchMensagens = useCallback(async (telefone: string) => {
    try {
      const res = await conversasService.mensagens(telefone, { limit: 100 });
      setMessages(res.data);
    } catch {
      /* silencioso no polling */
    }
  }, []);

  // Polling: lista + (se houver) thread seleccionada
  useEffect(() => {
    fetchConversas(false);
    pollRef.current = setInterval(() => {
      fetchConversas(true);
      const phone = selectedPhoneRef.current;
      if (phone) fetchMensagens(phone);
    }, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchConversas, fetchMensagens]);

  const handleSelect = async (conv: ConversaListItem) => {
    setSelected(conv);
    setMessages([]);
    await fetchMensagens(conv.telefone);
  };

  const handleToggleAi = async () => {
    if (!selected) return;
    try {
      const res = await conversasService.pauseAi(selected.telefone, !selected.iaAtiva);
      setSelected({ ...selected, iaAtiva: res.data.iaAtiva });
      setConversas((prev) =>
        prev.map((c) => (c.telefone === selected.telefone ? { ...c, iaAtiva: res.data.iaAtiva } : c)),
      );
      toast.success(res.data.iaAtiva ? 'IA reactivada.' : 'IA pausada — humano assume.');
    } catch {
      toast.error('Erro ao alternar IA.');
    }
  };

  // Feedback otimista: mostra a mensagem na thread imediatamente, antes de o
  // envio confirmar (o refetch a seguir reconcilia com o registo real).
  const handleOptimistic = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        _id: `temp-${Date.now()}`,
        mensagem: text,
        origem: 'laura',
        direcao: 'saida',
        geradoPor: 'humano',
        data: new Date().toISOString(),
      },
    ]);
  };

  const handleSent = () => {
    if (!selected) return;
    fetchMensagens(selected.telefone);
  };

  const filtered = busca.trim()
    ? conversas.filter((c) => {
        const q = busca.toLowerCase();
        const digits = busca.replace(/\D/g, '');
        // digits !== '' evita que telefone.includes('') seja sempre true
        // quando a busca não tem dígitos (ex: "André").
        return c.nome.toLowerCase().includes(q) || (digits !== '' && c.telefone.includes(digits));
      })
    : conversas;

  const cardClass = isDarkMode ? 'bg-slate-800/50 border border-white/10' : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subClass = isDarkMode ? 'text-slate-400' : 'text-gray-500';

  // ── Painel esquerdo: lista ────────────────────────────────────────
  const listPanel = (
    <div className={`${cardClass} rounded-2xl flex-col overflow-hidden h-[calc(100vh-9rem)] ${selected ? 'hidden lg:flex' : 'flex'}`}>
      <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`font-semibold ${textClass}`}>Conversas</h2>
          {isPolling && <span className={`text-xs ${subClass}`}>a actualizar…</span>}
        </div>
        {/* Busca */}
        <div className="relative mb-3">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subClass}`} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar nome ou número…"
            className={`w-full pl-9 pr-3 py-2 rounded-xl border text-sm focus:outline-hidden focus:border-indigo-500 ${
              isDarkMode ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400' : 'bg-gray-50 border-gray-300 text-gray-900'
            }`}
          />
        </div>
        {/* Filtro */}
        <div className="flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                filtro === f.key
                  ? 'bg-indigo-500 text-white'
                  : isDarkMode ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
            <MessageSquare className={`w-8 h-8 ${subClass}`} />
            <p className={`text-sm ${subClass}`}>Sem conversas.</p>
          </div>
        ) : (
          filtered.map((c) => {
            const isActive = selected?.telefone === c.telefone;
            return (
              <button
                key={c.telefone}
                onClick={() => handleSelect(c)}
                className={`w-full text-left px-4 py-3 border-b transition-colors ${
                  isDarkMode ? 'border-white/5' : 'border-gray-50'
                } ${isActive ? (isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-50') : isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base leading-none">{c.tipo === 'cliente' ? '👤' : '🌱'}</span>
                  <span className={`text-sm font-medium truncate flex-1 ${textClass}`}>{c.nome}</span>
                  <span className={`text-xs shrink-0 ${subClass}`}>{formatHora(c.ultimaData)}</span>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <p className={`text-xs truncate flex-1 ${c.ultimaDirecao === 'entrada' && c.naoLidas > 0 ? textClass : subClass}`}>
                    {c.ultimaDirecao === 'saida' ? '↩ ' : ''}{c.ultimaMensagem}
                  </p>
                  {c.naoLidas > 0 && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500 text-white">{c.naoLidas}</span>
                  )}
                  {!c.iaAtiva && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500" title="IA pausada">⏸</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Painel central: thread ────────────────────────────────────────
  const threadPanel = selected ? (
    <div className={`${cardClass} rounded-2xl flex flex-col overflow-hidden h-[calc(100vh-9rem)]`}>
      <div className={`px-5 py-3 border-b flex items-center justify-between ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => { setSelected(null); setMessages([]); }}
            className={`lg:hidden p-1 -ml-1 rounded-lg shrink-0 ${isDarkMode ? 'text-slate-400 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100'}`}
            aria-label="Voltar à lista"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-base">{selected.tipo === 'cliente' ? '👤' : '🌱'}</span>
          <div className="min-w-0">
            <h2 className={`font-semibold truncate ${textClass}`}>{selected.nome}</h2>
            <p className={`text-xs ${subClass}`}>{selected.telefone}</p>
          </div>
        </div>
        <button
          onClick={handleToggleAi}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
            selected.iaAtiva
              ? isDarkMode ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10' : 'border-amber-300 text-amber-600 hover:bg-amber-50'
              : isDarkMode ? 'border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          {selected.iaAtiva ? <><WifiOff className="w-3.5 h-3.5" /> Pausar IA</> : <><Brain className="w-3.5 h-3.5" /> Reactivar IA</>}
        </button>
      </div>

      <ConversationThread messages={messages as unknown as ThreadMessage[]} isPolling={isPolling} isDarkMode={isDarkMode} />

      <ConversaComposer
        telefone={selected.telefone}
        iaAtiva={selected.iaAtiva}
        isDarkMode={isDarkMode}
        onOptimistic={handleOptimistic}
        onSent={handleSent}
        onPause={handleToggleAi}
      />
    </div>
  ) : (
    <div className={`${cardClass} rounded-2xl flex-col items-center justify-center gap-3 h-[calc(100vh-9rem)] hidden lg:flex`}>
      <MessageSquare className={`w-12 h-12 ${subClass}`} />
      <p className={`text-sm ${subClass}`}>Seleccione uma conversa à esquerda.</p>
    </div>
  );

  // ── Painel direito: contexto ──────────────────────────────────────
  const contextPanel = selected ? (
    <div className="space-y-4">
      <div className={`${cardClass} rounded-2xl p-5`}>
        <h3 className={`text-sm font-semibold mb-4 ${textClass}`}>Contacto</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Phone className={`w-4 h-4 shrink-0 ${subClass}`} />
            <span className={`text-sm ${textClass}`}>{selected.telefone}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base">{selected.tipo === 'cliente' ? '👤' : '🌱'}</span>
            <span className={`text-sm ${textClass}`}>{selected.tipo === 'cliente' ? 'Cliente' : 'Lead'}</span>
            {selected.estado && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-gray-100 text-gray-600'}`}>
                {selected.estado}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${selected.iaAtiva ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className={`text-sm ${subClass}`}>{selected.iaAtiva ? 'IA activa' : 'IA pausada (humano assume)'}</span>
          </div>
        </div>
      </div>

      {selected.tipo === 'lead' && selected.contactoId && (
        <button
          onClick={() => navigate(`/leads/${selected.contactoId}`)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            isDarkMode ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <ExternalLink className="w-4 h-4" /> Ver lead no pipeline
        </button>
      )}
    </div>
  ) : null;

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pt-24 pb-6 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-4">
            {listPanel}
            {threadPanel}
            <div className="hidden lg:block">{contextPanel}</div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default Conversas;
