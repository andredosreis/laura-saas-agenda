import { useState } from 'react';
import { Send, Loader2, Bot, WifiOff } from 'lucide-react';
import { toast } from 'react-toastify';
import conversasService from '../../services/conversasService';

interface ConversaComposerProps {
  telefone: string;
  /** IA activa nesta conversa. Quando true, a caixa fica bloqueada — é preciso pausar a IA para assumir. */
  iaAtiva: boolean;
  isDarkMode: boolean;
  /** Mostra a mensagem imediatamente na thread (feedback otimista) antes de o envio confirmar. */
  onOptimistic: (text: string) => void;
  /** Chamado após envio com sucesso (refetch da thread). */
  onSent: () => void;
  /** Pausa a IA e assume a conversa (handoff humano). */
  onPause: () => void;
}

/**
 * Composer de resposta manual do inbox (handoff humano).
 *
 * Regra: só se pode responder manualmente quando a IA está **pausada**. Com a
 * IA ligada, a caixa fica bloqueada e mostra um botão para pausar/assumir —
 * evita que IA e humano respondam em simultâneo.
 */
export function ConversaComposer({
  telefone, iaAtiva, isDarkMode, onOptimistic, onSent, onPause,
}: ConversaComposerProps) {
  const [mensagem, setMensagem] = useState('');
  const [sending, setSending] = useState(false);

  // ── IA ligada → caixa bloqueada, com convite a assumir ───────────────
  if (iaAtiva) {
    return (
      <div className={`border-t px-4 py-4 ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
        <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
          isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-50'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-4 h-4 shrink-0 text-indigo-400" />
            <p className={`text-sm truncate ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              A IA está a responder esta conversa. Para responder tu, assume a conversa.
            </p>
          </div>
          <button
            onClick={onPause}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium shrink-0 transition-all border-amber-400 text-amber-600 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10"
          >
            <WifiOff className="w-3.5 h-3.5" /> Pausar IA e assumir
          </button>
        </div>
      </div>
    );
  }

  // ── IA pausada → composer activo ─────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = mensagem.trim();
    if (!text || sending) return;
    setSending(true);
    setMensagem('');
    onOptimistic(text); // mostra já na thread
    try {
      await conversasService.reply(telefone, { mensagem: text });
      onSent();
      toast.success('Mensagem enviada via WhatsApp.');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      toast.error(axErr?.response?.data?.error || 'Falha ao enviar. Verifique a instância Evolution.');
      setMensagem(text); // devolve o texto para reenviar
      onSent(); // refetch remove a mensagem otimista que não foi gravada
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-emerald-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-emerald-500';

  return (
    <form onSubmit={handleSubmit} className={`border-t px-4 py-4 space-y-2 ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
      <p className="text-xs font-medium text-emerald-500 flex items-center gap-1.5">
        <WifiOff className="w-3.5 h-3.5" /> Estás a responder manualmente (IA pausada)
      </p>
      <textarea
        rows={3}
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escrever mensagem manual… (Ctrl+Enter para enviar)"
        disabled={sending}
        autoFocus
        className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 resize-none transition-all disabled:opacity-50 ${inputClass}`}
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={sending || !mensagem.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 hover:opacity-90 disabled:opacity-40 transition-all text-white text-sm font-medium shadow-lg shadow-emerald-500/25"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'A enviar…' : 'Enviar'}
        </button>
      </div>
    </form>
  );
}
