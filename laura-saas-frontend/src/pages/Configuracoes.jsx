import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  Settings, Building2, Phone, Mail, Globe, Clock, Save, Loader2, MessageCircle,
  Users, UserPlus, Edit, Power, PowerOff, ShieldCheck, Trash2, Send
} from 'lucide-react';
import ColaboradorModal from '../components/ColaboradorModal';

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
  const { tenant, refreshAuth, user, isAdmin } = useAuth();
  const { isDark } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Gestão de colaboradores
  const [colaboradores, setColaboradores] = useState([]);
  const [colaboradoresMeta, setColaboradoresMeta] = useState({ total: 0, maxUsuarios: null });
  const [colaboradoresLoading, setColaboradoresLoading] = useState(false);
  const [showModalColab, setShowModalColab] = useState(false);
  const [colabEditando, setColabEditando] = useState(null);

  const fetchColaboradores = async () => {
    if (!isAdmin) return;
    setColaboradoresLoading(true);
    try {
      const res = await api.get('/users?incluirInativos=true');
      setColaboradores(res.data?.data || []);
      setColaboradoresMeta(res.data?.meta || { total: 0, maxUsuarios: null });
    } catch (err) {
      console.error('Erro ao listar colaboradores:', err);
      toast.error('Erro ao carregar colaboradores');
    } finally {
      setColaboradoresLoading(false);
    }
  };

  useEffect(() => {
    fetchColaboradores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleAbrirCriar = () => { setColabEditando(null); setShowModalColab(true); };
  const handleEditar = (colab) => { setColabEditando(colab); setShowModalColab(true); };
  const handleEliminar = async (colab) => {
    if (colab._id === user?._id) {
      toast.error('Não podes eliminar-te a ti próprio');
      return;
    }
    if (!window.confirm(
      `ELIMINAR ${colab.nome} permanentemente?\n\n` +
      `Esta acção é irreversível. O registo desaparece da base de dados.\n` +
      `Histórico de atendimentos/agendamentos antigos podem ficar com referências órfãs.`
    )) return;
    try {
      await api.delete(`/users/${colab._id}`);
      toast.success('Colaborador eliminado');
      fetchColaboradores();
    } catch (err) {
      console.error('Erro ao eliminar:', err);
      toast.error(err.response?.data?.error || 'Erro ao eliminar');
    }
  };
  const handleToggleAtivo = async (colab) => {
    const acao = colab.ativo ? 'desativar' : 'ativar';
    if (colab.ativo && colab._id === user?._id) {
      toast.error('Não podes desactivar-te a ti próprio');
      return;
    }
    if (colab.ativo && !window.confirm(`Desactivar ${colab.nome}? A pessoa não poderá entrar até ser reactivada.`)) return;
    try {
      await api.patch(`/users/${colab._id}/${acao}`);
      toast.success(colab.ativo ? 'Colaborador desactivado' : 'Colaborador reactivado');
      fetchColaboradores();
    } catch (err) {
      console.error(`Erro ao ${acao}:`, err);
      toast.error(err.response?.data?.error || `Erro ao ${acao}`);
    }
  };
  const handleReenviarConvite = async (colab) => {
    if (!window.confirm(`Reenviar convite para ${colab.nome} (${colab.email})? Será gerado um novo link de definição de password.`)) return;
    try {
      const res = await api.post(`/users/${colab._id}/reenviar-convite`);
      const emailEnviado = res.data?.meta?.emailEnviado;
      if (emailEnviado) {
        toast.success('Convite reenviado por email');
      } else {
        toast.warn('Token actualizado mas o email falhou. Verifica SMTP.');
      }
    } catch (err) {
      console.error('Erro ao reenviar convite:', err);
      toast.error(err.response?.data?.error || 'Erro ao reenviar convite');
    }
  };

  const roleBadge = (role) => {
    const map = {
      superadmin:    { label: 'Superadmin',    cls: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
      admin:         { label: 'Admin',         cls: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
      gerente:       { label: 'Gerente',       cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
      recepcionista: { label: 'Recepcionista', cls: 'bg-teal-500/10 text-teal-500 border-teal-500/20' },
      terapeuta:     { label: 'Terapeuta',     cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
    };
    const item = map[role] || { label: role, cls: 'bg-gray-500/10 text-gray-500 border-gray-500/20' };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${item.cls}`}>{item.label}</span>
    );
  };

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
    whatsapp: {
      numeroWhatsapp: '',
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
      whatsapp: {
        numeroWhatsapp: tenant.whatsapp?.numeroWhatsapp || '',
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
        whatsapp: form.whatsapp,
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
    : 'bg-white border border-slate-200 rounded-2xl p-6 shadow-xs';

  const label = `block text-sm font-medium mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`;

  const input = `w-full px-3 py-2 rounded-lg text-sm transition-colors outline-hidden focus:ring-2 focus:ring-indigo-500/50 ${
    isDark
      ? 'bg-slate-900/60 border border-white/10 text-white placeholder-slate-500'
      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400'
  }`;

  return (
    <div className={`min-h-screen pt-20 sm:pt-24 px-4 pb-10 md:px-8 transition-colors ${isDark ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'}`}>
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
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
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-indigo-500/50 ${
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

          {/* --- SECÇÃO: WhatsApp --- */}
          <div className={card}>
            <h2 className="text-base font-semibold flex items-center gap-2 mb-2">
              <MessageCircle className="w-4 h-4 text-green-400" />
              WhatsApp
            </h2>
            <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Número que recebe alertas quando um cliente não confirma o agendamento 1h antes.
            </p>

            <div>
              <label className={label}>
                <Phone className="inline w-3.5 h-3.5 mr-1" />
                Número do Admin (com código do país)
              </label>
              <input
                type="tel"
                className={input}
                value={form.whatsapp.numeroWhatsapp}
                onChange={e => setForm(prev => ({
                  ...prev,
                  whatsapp: { ...prev.whatsapp, numeroWhatsapp: e.target.value.replace(/[^\d]/g, '') }
                }))}
                placeholder="351912345678"
              />
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Formato: 351 seguido do número sem espaços. Ex: 351912345678
              </p>
            </div>
          </div>

          {/* Botão Guardar */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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

        {/* Secção: Colaboradores — só visível para admin/superadmin */}
        {isAdmin && (
          <section className={`${card} mt-8`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-400" />
                  Colaboradores
                </h2>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Convida pessoas para a tua equipa. Cada colaborador define a sua password ao receber o convite.
                  {colaboradoresMeta.maxUsuarios != null && colaboradoresMeta.maxUsuarios > 0 ? (
                    <span className="ml-1">
                      <strong>{colaboradoresMeta.total}</strong>
                      {' de '}
                      <strong>{colaboradoresMeta.maxUsuarios}</strong> activos.
                    </span>
                  ) : (
                    <span className="ml-1">
                      <strong>{colaboradoresMeta.total}</strong> activo{colaboradoresMeta.total === 1 ? '' : 's'} (sem limite).
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleAbrirCriar}
                disabled={colaboradoresMeta.maxUsuarios != null && colaboradoresMeta.maxUsuarios > 0 && colaboradoresMeta.total >= colaboradoresMeta.maxUsuarios}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white text-sm font-medium shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title={
                  colaboradoresMeta.maxUsuarios != null && colaboradoresMeta.maxUsuarios > 0 && colaboradoresMeta.total >= colaboradoresMeta.maxUsuarios
                    ? 'Limite do plano atingido'
                    : 'Convidar novo colaborador'
                }
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Novo Colaborador</span>
              </button>
            </div>

            {/* Aviso se atingiu o limite (só quando há um limite REAL > 0) */}
            {colaboradoresMeta.maxUsuarios != null && colaboradoresMeta.maxUsuarios > 0 && colaboradoresMeta.total >= colaboradoresMeta.maxUsuarios && (
              <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
                isDark ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700'
              }`}>
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Atingiste o limite do teu plano. Desactiva um colaborador para criar outro, ou faz upgrade do plano.</span>
              </div>
            )}

            {/* Lista */}
            {colaboradoresLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
                <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>A carregar colaboradores...</p>
              </div>
            ) : colaboradores.length === 0 ? (
              <div className="py-8 text-center">
                <Users className={`w-10 h-10 mx-auto mb-2 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
                <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Ainda sem colaboradores convidados.</p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  Convida o primeiro para começar a partilhar o trabalho.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {colaboradores.map(c => {
                  const isSelf = c._id === user?._id;
                  const inicial = (c.nome || '?').charAt(0).toUpperCase();
                  return (
                    <div
                      key={c._id}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${
                        isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-slate-50'
                      } ${!c.ativo ? 'opacity-60' : ''}`}
                    >
                      <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-bold ${
                        isDark
                          ? 'bg-linear-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300'
                          : 'bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 text-indigo-600'
                      }`}>
                        {inicial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{c.nome}</span>
                          {roleBadge(c.role)}
                          {isSelf && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-medium">
                              tu
                            </span>
                          )}
                          {!c.ativo && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 font-medium">
                              Inactivo
                            </span>
                          )}
                          {c.ativo && !c.emailVerificado && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
                              Convite pendente
                            </span>
                          )}
                        </div>
                        <div className={`text-xs mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.email}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleEditar(c)}
                          className={`p-2 rounded-lg transition-colors ${
                            isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                          }`}
                          title="Editar colaborador"
                          aria-label={`Editar ${c.nome}`}
                        >
                          <Edit className="w-4 h-4 text-indigo-500" />
                        </button>
                        {c.ativo && !c.emailVerificado && (
                          <button
                            type="button"
                            onClick={() => handleReenviarConvite(c)}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-amber-500/20' : 'hover:bg-amber-50'
                            }`}
                            title="Reenviar convite por email"
                            aria-label={`Reenviar convite para ${c.nome}`}
                          >
                            <Send className="w-4 h-4 text-amber-500" />
                          </button>
                        )}
                        {!isSelf && (
                          <button
                            type="button"
                            onClick={() => handleToggleAtivo(c)}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                            }`}
                            title={c.ativo ? 'Desactivar' : 'Reactivar'}
                            aria-label={c.ativo ? `Desactivar ${c.nome}` : `Reactivar ${c.nome}`}
                          >
                            {c.ativo
                              ? <PowerOff className="w-4 h-4 text-red-500" />
                              : <Power className="w-4 h-4 text-emerald-500" />}
                          </button>
                        )}
                        {/* Eliminar permanente — só para inactivos (workflow de segurança) */}
                        {!isSelf && !c.ativo && (
                          <button
                            type="button"
                            onClick={() => handleEliminar(c)}
                            className={`p-2 rounded-lg transition-colors ${
                              isDark ? 'hover:bg-red-500/20' : 'hover:bg-red-50'
                            }`}
                            title="Eliminar permanentemente"
                            aria-label={`Eliminar ${c.nome} permanentemente`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modal de criar / editar colaborador */}
      <ColaboradorModal
        isOpen={showModalColab}
        onClose={() => setShowModalColab(false)}
        onSuccess={() => fetchColaboradores()}
        colaborador={colabEditando}
      />
    </div>
  );
}

export default Configuracoes;
