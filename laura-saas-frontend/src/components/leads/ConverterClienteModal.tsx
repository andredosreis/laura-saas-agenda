import { useState } from 'react';
import { X, UserCheck, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import leadsService from '../../services/leadsService';
import type { Lead } from '../../types/lead';

interface ConverterClienteModalProps {
  lead: Lead;
  isDarkMode: boolean;
  onClose: () => void;
  onConverted: (updatedLead: Lead) => void;
}

export function ConverterClienteModal({ lead, isDarkMode, onClose, onConverted }: ConverterClienteModalProps) {
  const navigate = useNavigate();
  const [nome, setNome] = useState(lead.nome || '');
  const [email, setEmail] = useState(lead.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [erroNome, setErroNome] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErroNome('Nome é obrigatório para criar o cliente.');
      return;
    }
    try {
      setSubmitting(true);
      const res = await leadsService.convert(lead._id, {
        nome: nome.trim(),
        email: email.trim() || undefined,
      });
      onConverted(res.data.lead);
      toast.success(`Lead convertido para cliente "${nome}".`);
      onClose();
      navigate('/clientes');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string; code?: string } } };
      const code = axErr?.response?.data?.code;
      if (code === 'max_clientes') {
        toast.error('Limite de clientes atingido neste plano.');
      } else if (code === 'already_converted') {
        toast.info('Este lead já foi convertido anteriormente.');
        onClose();
      } else {
        toast.error(axErr?.response?.data?.error || 'Erro ao converter lead em cliente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400 focus:border-indigo-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500';

  const labelClass = `block text-sm font-medium mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl shadow-2xl ${isDarkMode ? 'bg-slate-800 border border-white/10' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Converter em Cliente
              </h2>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                {lead.telefone}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Nome do cliente *</label>
            <input
              autoFocus
              type="text"
              value={nome}
              onChange={(e) => { setNome(e.target.value); setErroNome(''); }}
              placeholder="Nome completo"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all ${inputClass}`}
            />
            {erroNome && <p className="text-red-400 text-xs mt-1">{erroNome}</p>}
          </div>

          <div>
            <label className={labelClass}>Email (opcional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all ${inputClass}`}
            />
          </div>

          <div className={`rounded-xl p-4 text-sm ${isDarkMode ? 'bg-blue-500/10 border border-blue-500/20 text-blue-300' : 'bg-blue-50 border border-blue-100 text-blue-700'}`}>
            Ao converter, um novo <strong>Cliente</strong> é criado e o lead passa para o estado <strong>Convertido</strong>. Esta acção é irreversível.
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                isDarkMode ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-linear-to-r from-green-500 to-emerald-600 hover:opacity-90 disabled:opacity-50 transition-all text-white text-sm font-semibold shadow-lg shadow-green-500/25"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> A converter...</>
                : <><UserCheck className="w-4 h-4" /> Converter</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
