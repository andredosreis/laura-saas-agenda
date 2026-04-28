import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  X, Loader2, User, Mail, Phone, Shield, Sparkles, ChevronDown, ChevronUp, Save, UserPlus
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

/**
 * Modal de criar / editar colaborador.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - onSuccess: () => void  — chamado após save bem sucedido (refetch da lista)
 * - colaborador: object | null  — se passado, é modo edição; senão é criação
 */
const ROLES_DISPONIVEIS = [
  { value: 'admin',         label: 'Admin',         desc: 'Acesso total à plataforma' },
  { value: 'gerente',       label: 'Gerente',       desc: 'Gere clientes, agendamentos e finanças' },
  { value: 'recepcionista', label: 'Recepcionista', desc: 'Marca agendamentos e atende clientes' },
  { value: 'terapeuta',     label: 'Terapeuta',     desc: 'Faz atendimentos e vê os seus dados' },
];

// Permissões agrupadas por área para a UI ser legível
const PERMISSOES_GROUPS = [
  { area: 'Clientes', items: [
    { key: 'verClientes', label: 'Ver clientes' },
    { key: 'criarClientes', label: 'Criar clientes' },
    { key: 'editarClientes', label: 'Editar clientes' },
    { key: 'deletarClientes', label: 'Eliminar clientes' },
  ]},
  { area: 'Agendamentos', items: [
    { key: 'verAgendamentos', label: 'Ver agendamentos' },
    { key: 'criarAgendamentos', label: 'Criar agendamentos' },
    { key: 'editarAgendamentos', label: 'Editar agendamentos' },
    { key: 'deletarAgendamentos', label: 'Eliminar agendamentos' },
  ]},
  { area: 'Pacotes', items: [
    { key: 'verPacotes', label: 'Ver pacotes' },
    { key: 'criarPacotes', label: 'Criar pacotes' },
    { key: 'editarPacotes', label: 'Editar pacotes' },
    { key: 'deletarPacotes', label: 'Eliminar pacotes' },
  ]},
  { area: 'Outros', items: [
    { key: 'verFinanceiro', label: 'Ver financeiro' },
    { key: 'editarConfiguracoes', label: 'Editar configurações' },
    { key: 'gerenciarUsuarios', label: 'Gerir colaboradores' },
  ]},
];

// Defaults frontend que espelham User.getDefaultPermissions(role)
function getDefaultPermissoes(role) {
  const map = {
    superadmin: { verClientes: true, criarClientes: true, editarClientes: true, deletarClientes: true, verAgendamentos: true, criarAgendamentos: true, editarAgendamentos: true, deletarAgendamentos: true, verPacotes: true, criarPacotes: true, editarPacotes: true, deletarPacotes: true, verFinanceiro: true, editarConfiguracoes: true, gerenciarUsuarios: true },
    admin:      { verClientes: true, criarClientes: true, editarClientes: true, deletarClientes: true, verAgendamentos: true, criarAgendamentos: true, editarAgendamentos: true, deletarAgendamentos: true, verPacotes: true, criarPacotes: true, editarPacotes: true, deletarPacotes: true, verFinanceiro: true, editarConfiguracoes: true, gerenciarUsuarios: true },
    gerente:    { verClientes: true, criarClientes: true, editarClientes: true, deletarClientes: false, verAgendamentos: true, criarAgendamentos: true, editarAgendamentos: true, deletarAgendamentos: true, verPacotes: true, criarPacotes: true, editarPacotes: true, deletarPacotes: false, verFinanceiro: true, editarConfiguracoes: false, gerenciarUsuarios: false },
    recepcionista: { verClientes: true, criarClientes: true, editarClientes: true, deletarClientes: false, verAgendamentos: true, criarAgendamentos: true, editarAgendamentos: true, deletarAgendamentos: false, verPacotes: true, criarPacotes: false, editarPacotes: false, deletarPacotes: false, verFinanceiro: false, editarConfiguracoes: false, gerenciarUsuarios: false },
    terapeuta:  { verClientes: true, criarClientes: false, editarClientes: false, deletarClientes: false, verAgendamentos: true, criarAgendamentos: false, editarAgendamentos: false, deletarAgendamentos: false, verPacotes: true, criarPacotes: false, editarPacotes: false, deletarPacotes: false, verFinanceiro: false, editarConfiguracoes: false, gerenciarUsuarios: false },
  };
  return map[role] || map.terapeuta;
}

function ColaboradorModal({ isOpen, onClose, onSuccess, colaborador }) {
  const { isDarkMode } = useTheme();
  const { user: currentUser } = useAuth();
  const isEdit = Boolean(colaborador);
  const isSuperadmin = currentUser?.role === 'superadmin';

  const [form, setForm] = useState({
    nome: '', email: '', role: 'recepcionista',
    telefone: '', comissaoPadrao: '',
    iban: '',
  });
  const [permissoes, setPermissoes] = useState(getDefaultPermissoes('recepcionista'));
  const [showPermissoes, setShowPermissoes] = useState(false);
  const [permissoesCustom, setPermissoesCustom] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Carregar dados quando muda o colaborador
  useEffect(() => {
    if (!isOpen) return;
    if (colaborador) {
      setForm({
        nome: colaborador.nome || '',
        email: colaborador.email || '',
        role: colaborador.role || 'recepcionista',
        telefone: colaborador.telefone || '',
        comissaoPadrao: colaborador.comissaoPadrao != null ? String(colaborador.comissaoPadrao) : '',
        iban: colaborador.dadosBancarios?.iban || '',
      });
      setPermissoes(colaborador.permissoes || getDefaultPermissoes(colaborador.role));
      setPermissoesCustom(true); // assume que existem permissões guardadas → mostra-as
    } else {
      setForm({ nome: '', email: '', role: 'recepcionista', telefone: '', comissaoPadrao: '', iban: '' });
      setPermissoes(getDefaultPermissoes('recepcionista'));
      setPermissoesCustom(false);
      setShowPermissoes(false);
    }
  }, [isOpen, colaborador]);

  // Quando muda role, reaplica defaults se utilizador NÃO está em modo personalizado
  const handleRoleChange = (novaRole) => {
    setForm(prev => ({ ...prev, role: novaRole }));
    if (!permissoesCustom) {
      setPermissoes(getDefaultPermissoes(novaRole));
    }
  };

  const togglePermissao = (key) => {
    setPermissoesCustom(true);
    setPermissoes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetParaDefaults = () => {
    setPermissoes(getDefaultPermissoes(form.role));
    setPermissoesCustom(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim() || (!isEdit && !form.email.trim())) {
      toast.error('Nome e email são obrigatórios');
      return;
    }
    if (form.role === 'superadmin' && !isSuperadmin) {
      toast.error('Só superadmin pode atribuir o role superadmin');
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      role: form.role,
    };
    if (form.telefone.trim()) payload.telefone = form.telefone.trim();
    if (form.comissaoPadrao !== '' && !isNaN(parseFloat(form.comissaoPadrao))) {
      payload.comissaoPadrao = parseFloat(form.comissaoPadrao);
    }
    if (form.iban.trim()) {
      payload.dadosBancarios = { iban: form.iban.trim() };
    }
    if (permissoesCustom) {
      payload.permissoes = permissoes;
    }

    if (!isEdit) {
      payload.email = form.email.trim().toLowerCase();
    }

    setSubmitting(true);
    try {
      let res;
      if (isEdit) {
        res = await api.put(`/users/${colaborador._id}`, payload);
        toast.success('Colaborador actualizado');
      } else {
        res = await api.post('/users', payload);
        const emailEnviado = res.data?.meta?.emailEnviado;
        toast.success(emailEnviado
          ? 'Convite enviado por email'
          : 'Colaborador criado (email de convite falhou — reenvia depois)');
      }
      onSuccess?.(res.data?.data);
      onClose?.();
    } catch (err) {
      console.error('Erro ao guardar colaborador:', err);
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Erro ao guardar');
    } finally {
      setSubmitting(false);
    }
  };

  // Hooks devem ser chamados ANTES de qualquer return condicional (Rules of Hooks)
  const rolesVisiveis = useMemo(() =>
    isSuperadmin
      ? [{ value: 'superadmin', label: 'Superadmin', desc: 'Acesso total a todos os tenants' }, ...ROLES_DISPONIVEIS]
      : ROLES_DISPONIVEIS,
  [isSuperadmin]);

  if (!isOpen) return null;

  // Estilos condicionais
  const cardClass = isDarkMode ? 'bg-slate-800 border border-white/10' : 'bg-white border border-gray-200';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-500 focus:border-indigo-500'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400 focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className={`${cardClass} rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-indigo-500/20' : 'bg-indigo-50'}`}>
              {isEdit ? <User className="w-5 h-5 text-indigo-500" /> : <UserPlus className="w-5 h-5 text-indigo-500" />}
            </div>
            <div>
              <h2 className={`text-lg font-bold ${textClass}`}>
                {isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}
              </h2>
              <p className={`text-xs ${subTextClass}`}>
                {isEdit ? 'Actualiza role, permissões e dados profissionais' : 'O colaborador recebe email para definir password'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"
            className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}>
            <X className={`w-5 h-5 ${subTextClass}`} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Nome */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>
              <User className="inline w-3.5 h-3.5 mr-1" />
              Nome *
            </label>
            <input
              type="text" required
              value={form.nome}
              onChange={(e) => setForm(prev => ({ ...prev, nome: e.target.value }))}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm ${inputClass}`}
              placeholder="Nome completo"
            />
          </div>

          {/* Email — só editável na criação */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>
              <Mail className="inline w-3.5 h-3.5 mr-1" />
              Email {!isEdit && '*'}
            </label>
            <input
              type="email" required={!isEdit}
              value={form.email}
              onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
              disabled={isEdit}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm ${inputClass} ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="email@exemplo.com"
            />
            {isEdit && (
              <p className={`text-xs mt-1 ${subTextClass}`}>O email não pode ser alterado depois da criação.</p>
            )}
          </div>

          {/* Telefone */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>
              <Phone className="inline w-3.5 h-3.5 mr-1" />
              Telefone
            </label>
            <input
              type="tel"
              value={form.telefone}
              onChange={(e) => setForm(prev => ({ ...prev, telefone: e.target.value }))}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm ${inputClass}`}
              placeholder="912345678"
            />
          </div>

          {/* Role */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${subTextClass}`}>
              <Shield className="inline w-3.5 h-3.5 mr-1" />
              Função
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {rolesVisiveis.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => handleRoleChange(r.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    form.role === r.value
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`font-medium ${textClass}`}>{r.label}</div>
                  <div className={`text-xs mt-0.5 ${subTextClass}`}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Campos extra para terapeuta */}
          {form.role === 'terapeuta' && (
            <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-purple-500/5 border border-purple-500/20' : 'bg-purple-50/50 border border-purple-200'} space-y-3`}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" />
                <span className={`text-sm font-medium ${textClass}`}>Dados profissionais</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${subTextClass}`}>Comissão padrão (%)</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={form.comissaoPadrao}
                    onChange={(e) => setForm(prev => ({ ...prev, comissaoPadrao: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${inputClass}`}
                    placeholder="20"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${subTextClass}`}>IBAN (para pagamentos)</label>
                  <input
                    type="text"
                    value={form.iban}
                    onChange={(e) => setForm(prev => ({ ...prev, iban: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${inputClass}`}
                    placeholder="PT50..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Permissões collapsible */}
          <div>
            <button
              type="button"
              onClick={() => setShowPermissoes(p => !p)}
              className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${
                isDarkMode ? 'border-white/10 hover:bg-white/5 text-white' : 'border-gray-200 hover:bg-gray-50 text-gray-900'
              }`}
            >
              <span className="font-medium">Permissões {permissoesCustom && <span className="text-xs text-amber-500 ml-2">(personalizadas)</span>}</span>
              {showPermissoes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showPermissoes && (
              <div className={`mt-2 p-4 rounded-xl ${isDarkMode ? 'bg-slate-900/50' : 'bg-gray-50'} space-y-4`}>
                <div className="flex items-center justify-between">
                  <p className={`text-xs ${subTextClass}`}>
                    Por defeito usamos as permissões da função. Personaliza só se necessário.
                  </p>
                  {permissoesCustom && (
                    <button
                      type="button"
                      onClick={resetParaDefaults}
                      className="text-xs text-indigo-500 hover:text-indigo-600 font-medium whitespace-nowrap ml-2"
                    >
                      Repor defaults
                    </button>
                  )}
                </div>

                {PERMISSOES_GROUPS.map(group => (
                  <div key={group.area}>
                    <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${subTextClass}`}>{group.area}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {group.items.map(item => (
                        <label
                          key={item.key}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${
                            isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!permissoes[item.key]}
                            onChange={() => togglePermissao(item.key)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className={`text-sm ${textClass}`}>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-white/10' : 'border-gray-200'} flex gap-2`}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium ${
              isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
            } transition-colors disabled:opacity-50`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 text-white text-sm font-medium transition-all disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? 'Guardar' : 'Convidar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ColaboradorModal;
