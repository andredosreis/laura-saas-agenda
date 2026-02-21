import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { toast } from 'react-toastify';
import { Settings, Building2, Phone, Mail, Globe, Clock, Save, Loader2 } from 'lucide-react';

const TIMEZONES = [
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

function Configuracoes() {
  const { tenant, refreshAuth } = useAuth();
  const { isDark } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    nome: '',
    contato: {
      email: '',
      telefone: '',
      website: '',
      endereco: {
        rua: '',
        numero: '',
        cidade: '',
        codigoPostal: '',
        pais: 'Portugal',
      },
    },
    configuracoes: {
      timezone: 'Europe/Lisbon',
      idioma: 'pt-PT',
      moedaDisplay: '€',
      duracaoSessaoPadrao: 60,
      antecedenciaMinAgendamento: 2,
      antecedenciaMaxAgendamento: 30,
      permitirAgendamentoOnline: false,
    },
  });

  // Inicializar form com dados do tenant
  useEffect(() => {
    if (!tenant) return;
    setForm({
      nome: tenant.nome || '',
      contato: {
        email: tenant.contato?.email || '',
        telefone: tenant.contato?.telefone || '',
        website: tenant.contato?.website || '',
        endereco: {
          rua: tenant.contato?.endereco?.rua || '',
          numero: tenant.contato?.endereco?.numero || '',
          cidade: tenant.contato?.endereco?.cidade || '',
          codigoPostal: tenant.contato?.endereco?.codigoPostal || '',
          pais: tenant.contato?.endereco?.pais || 'Portugal',
        },
      },
      configuracoes: {
        timezone: tenant.configuracoes?.timezone || 'Europe/Lisbon',
        idioma: tenant.configuracoes?.idioma || 'pt-PT',
        moedaDisplay: tenant.configuracoes?.moedaDisplay || '€',
        duracaoSessaoPadrao: tenant.configuracoes?.duracaoSessaoPadrao ?? 60,
        antecedenciaMinAgendamento: tenant.configuracoes?.antecedenciaMinAgendamento ?? 2,
        antecedenciaMaxAgendamento: tenant.configuracoes?.antecedenciaMaxAgendamento ?? 30,
        permitirAgendamentoOnline: tenant.configuracoes?.permitirAgendamentoOnline ?? false,
      },
    });
  }, [tenant]);

  const handleChange = (section, field, value) => {
    if (section === 'root') {
      setForm(prev => ({ ...prev, [field]: value }));
    } else if (section === 'endereco') {
      setForm(prev => ({
        ...prev,
        contato: {
          ...prev.contato,
          endereco: { ...prev.contato.endereco, [field]: value },
        },
      }));
    } else {
      setForm(prev => ({
        ...prev,
        [section]: { ...prev[section], [field]: value },
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.put('/auth/tenant', {
        nome: form.nome,
        contato: form.contato,
        configuracoes: form.configuracoes,
      });
      await refreshAuth();
      toast.success('Configurações guardadas com sucesso!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao guardar configurações.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const card = isDark
    ? 'bg-slate-800/50 border border-white/10 rounded-2xl p-6'
    : 'bg-white border border-slate-200 rounded-2xl p-6 shadow-sm';

  const label = `block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`;

  const input = `w-full px-3 py-2 rounded-lg text-sm transition-colors outline-none focus:ring-2 focus:ring-indigo-500/50 ${
    isDark
      ? 'bg-slate-900/60 border border-white/10 text-white placeholder-slate-500'
      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400'
  }`;

  return (
    <div className={`min-h-screen pt-20 sm:pt-24 px-4 pb-10 md:px-8 transition-colors ${isDark ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Configurações</h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Dados do estabelecimento e preferências do sistema
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* --- SECÇÃO: Dados do Estabelecimento --- */}
          <div className={card}>
            <h2 className="text-base font-semibold flex items-center gap-2 mb-5">
              <Building2 className="w-4 h-4 text-indigo-400" />
              Dados do Estabelecimento
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={label}>Nome do Estabelecimento</label>
                <input
                  type="text"
                  className={input}
                  value={form.nome}
                  onChange={e => handleChange('root', 'nome', e.target.value)}
                  placeholder="Ex: Estética Avançada"
                />
              </div>

              <div>
                <label className={label}>
                  <Phone className="inline w-3.5 h-3.5 mr-1" />
                  Telefone
                </label>
                <input
                  type="tel"
                  className={input}
                  value={form.contato.telefone}
                  onChange={e => handleChange('contato', 'telefone', e.target.value)}
                  placeholder="+351 912 345 678"
                />
              </div>

              <div>
                <label className={label}>
                  <Mail className="inline w-3.5 h-3.5 mr-1" />
                  Email de Contato
                </label>
                <input
                  type="email"
                  className={input}
                  value={form.contato.email}
                  onChange={e => handleChange('contato', 'email', e.target.value)}
                  placeholder="geral@estetica.pt"
                />
              </div>

              <div className="sm:col-span-2">
                <label className={label}>
                  <Globe className="inline w-3.5 h-3.5 mr-1" />
                  Website
                </label>
                <input
                  type="url"
                  className={input}
                  value={form.contato.website}
                  onChange={e => handleChange('contato', 'website', e.target.value)}
                  placeholder="https://estetica.pt"
                />
              </div>
            </div>
          </div>

          {/* --- SECÇÃO: Morada --- */}
          <div className={card}>
            <h2 className="text-base font-semibold mb-5">Morada</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={label}>Rua</label>
                <input
                  type="text"
                  className={input}
                  value={form.contato.endereco.rua}
                  onChange={e => handleChange('endereco', 'rua', e.target.value)}
                  placeholder="Rua das Flores"
                />
              </div>

              <div>
                <label className={label}>Número</label>
                <input
                  type="text"
                  className={input}
                  value={form.contato.endereco.numero}
                  onChange={e => handleChange('endereco', 'numero', e.target.value)}
                  placeholder="123"
                />
              </div>

              <div>
                <label className={label}>Código Postal</label>
                <input
                  type="text"
                  className={input}
                  value={form.contato.endereco.codigoPostal}
                  onChange={e => handleChange('endereco', 'codigoPostal', e.target.value)}
                  placeholder="1000-001"
                />
              </div>

              <div>
                <label className={label}>Cidade</label>
                <input
                  type="text"
                  className={input}
                  value={form.contato.endereco.cidade}
                  onChange={e => handleChange('endereco', 'cidade', e.target.value)}
                  placeholder="Lisboa"
                />
              </div>

              <div>
                <label className={label}>País</label>
                <input
                  type="text"
                  className={input}
                  value={form.contato.endereco.pais}
                  onChange={e => handleChange('endereco', 'pais', e.target.value)}
                  placeholder="Portugal"
                />
              </div>
            </div>
          </div>

          {/* --- SECÇÃO: Preferências do Sistema --- */}
          <div className={card}>
            <h2 className="text-base font-semibold flex items-center gap-2 mb-5">
              <Clock className="w-4 h-4 text-purple-400" />
              Preferências do Sistema
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>Timezone</label>
                <select
                  className={input}
                  value={form.configuracoes.timezone}
                  onChange={e => handleChange('configuracoes', 'timezone', e.target.value)}
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={label}>Moeda</label>
                <select
                  className={input}
                  value={form.configuracoes.moedaDisplay}
                  onChange={e => handleChange('configuracoes', 'moedaDisplay', e.target.value)}
                >
                  <option value="€">€ — Euro</option>
                  <option value="R$">R$ — Real Brasileiro</option>
                  <option value="$">$ — Dólar</option>
                  <option value="£">£ — Libra</option>
                </select>
              </div>

              <div>
                <label className={label}>Duração padrão de sessão (min)</label>
                <input
                  type="number"
                  min="15"
                  max="480"
                  step="15"
                  className={input}
                  value={form.configuracoes.duracaoSessaoPadrao}
                  onChange={e => handleChange('configuracoes', 'duracaoSessaoPadrao', parseInt(e.target.value) || 60)}
                />
              </div>

              <div>
                <label className={label}>Antecedência mínima (horas)</label>
                <input
                  type="number"
                  min="0"
                  max="72"
                  className={input}
                  value={form.configuracoes.antecedenciaMinAgendamento}
                  onChange={e => handleChange('configuracoes', 'antecedenciaMinAgendamento', parseInt(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className={label}>Antecedência máxima (dias)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  className={input}
                  value={form.configuracoes.antecedenciaMaxAgendamento}
                  onChange={e => handleChange('configuracoes', 'antecedenciaMaxAgendamento', parseInt(e.target.value) || 30)}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.configuracoes.permitirAgendamentoOnline}
                  onClick={() => handleChange('configuracoes', 'permitirAgendamentoOnline', !form.configuracoes.permitirAgendamentoOnline)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    form.configuracoes.permitirAgendamentoOnline ? 'bg-indigo-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      form.configuracoes.permitirAgendamentoOnline ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Permitir agendamento online
                </label>
              </div>
            </div>
          </div>

          {/* Botão Guardar */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSubmitting ? 'A guardar...' : 'Guardar Configurações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Configuracoes;
