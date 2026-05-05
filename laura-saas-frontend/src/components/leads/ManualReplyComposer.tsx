import { useState } from 'react';
import { Send, Loader2, PauseCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import leadsService from '../../services/leadsService';
import type { Lead } from '../../types/lead';

interface ManualReplyComposerProps {
  lead: Lead;
  onReplySent: (updatedLead: Lead) => void;
  isDarkMode: boolean;
}

export function ManualReplyComposer({ lead, onReplySent, isDarkMode }: ManualReplyComposerProps) {
  const [mensagem, setMensagem] = useState('');
  const [pausarIa, setPausarIa] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = mensagem.trim();
    if (!text) return;
    try {
      setSending(true);
      const res = await leadsService.manualReply(lead._id, { mensagem: text, pausarIa });
      setMensagem('');
      onReplySent(res.data.lead);
      if (pausarIa) toast.info('IA pausada para este lead.');
      else toast.success('Mensagem enviada via WhatsApp.');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      toast.error(axErr?.response?.data?.error || 'Falha ao enviar mensagem. Verifique a instância Evolution.');
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
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-indigo-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500';

  return (
    <form onSubmit={handleSubmit} className={`border-t px-4 py-4 space-y-3 ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
      <textarea
        rows={3}
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escrever mensagem manual… (Ctrl+Enter para enviar)"
        disabled={sending}
        className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 resize-none transition-all disabled:opacity-50 ${inputClass}`}
      />
      <div className="flex items-center justify-between gap-3">
        <label className={`flex items-center gap-2 text-sm cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
          <input
            type="checkbox"
            checked={pausarIa}
            onChange={(e) => setPausarIa(e.target.checked)}
            disabled={!lead.iaAtiva || sending}
            className="w-4 h-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500"
          />
          <PauseCircle className="w-4 h-4 text-amber-500" />
          <span>Pausar IA após envio</span>
          {!lead.iaAtiva && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">
              já pausada
            </span>
          )}
        </label>

        <button
          type="submit"
          disabled={sending || !mensagem.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 disabled:opacity-40 transition-all text-white text-sm font-medium shadow-lg shadow-indigo-500/25"
        >
          {sending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />
          }
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </form>
  );
}
