import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { DateTime } from 'luxon';
import {
  Calendar, Clock, User, CheckCircle2, XCircle, MessageSquare, Edit, Trash2,
  Loader2, Plus, Bell, BellOff, ChevronRight, AlertCircle, Sparkles, UserCheck, UserX
} from 'lucide-react';
import api from '../services/api';
import { useTheme } from '../contexts/ThemeContext';
import { subscribeToPush, getPushStatus, unsubscribeFromPush } from '../services/notificationService';
import FinalizarAtendimentoModal from '../components/FinalizarAtendimentoModal';
import FunilAvaliacaoModal from '../components/FunilAvaliacaoModal';

const ZONA = 'Europe/Lisbon';

// Calcula intervalo de datas (ISO) a partir do preset escolhido
function getDateRange(preset) {
  const agora = DateTime.now().setZone(ZONA);
  switch (preset) {
    case 'hoje':
      return { dataInicio: agora.startOf('day').toISO(), dataFim: agora.endOf('day').toISO() };
    case 'amanha':
      return {
        dataInicio: agora.plus({ days: 1 }).startOf('day').toISO(),
        dataFim: agora.plus({ days: 1 }).endOf('day').toISO()
      };
    case 'semana':
      return { dataInicio: agora.startOf('day').toISO(), dataFim: agora.plus({ days: 7 }).endOf('day').toISO() };
    case 'mes':
      return { dataInicio: agora.startOf('day').toISO(), dataFim: agora.plus({ days: 30 }).endOf('day').toISO() };
    case 'todos':
    default:
      return { dataInicio: null, dataFim: null };
  }
}

function Agendamentos() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [agendamentos, setAgendamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroData, setFiltroData] = useState('hoje');
  const [confirmando, setConfirmando] = useState(null);
  const [enviandoLembrete, setEnviandoLembrete] = useState(null);
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false);
  const [agendamentoParaFinalizar, setAgendamentoParaFinalizar] = useState(null);
  const [modalFunilAberto, setModalFunilAberto] = useState(false);
  const [agendamentoFunil, setAgendamentoFunil] = useState(null);
  const [marcandoPresenca, setMarcandoPresenca] = useState(null);
  
  const [pushStatus, setPushStatus] = useState({
    supported: false,
    permission: 'default',
    subscribed: false,
    disabledReason: undefined,
  });
  const [subscribingToPush, setSubscribingToPush] = useState(false);

  const carregarAgendamentos = useCallback(async (silencioso = false) => {
    if (!silencioso) setIsLoading(true);
    try {
      const { dataInicio, dataFim } = getDateRange(filtroData);
      const params = new URLSearchParams();
      if (dataInicio) params.append('dataInicio', dataInicio);
      if (dataFim) params.append('dataFim', dataFim);
      params.append('limit', '100');

      const url = params.toString() ? `/agendamentos?${params.toString()}` : '/agendamentos';
      const response = await api.get(url);
      setAgendamentos(response.data?.data || []);
    } catch (error) {
      if (!silencioso) {
        console.error('Erro ao carregar agendamentos:', error);
        toast.error('Erro ao carregar agendamentos. Tente novamente mais tarde.');
      }
    } finally {
      if (!silencioso) setIsLoading(false);
    }
  }, [filtroData]);

  useEffect(() => {
    carregarAgendamentos();

    const intervaloPolling = setInterval(() => carregarAgendamentos(true), 30000);

    const checkPushStatus = async () => {
      try {
        const status = await getPushStatus();
        console.log('[Agendamentos] 🔔 Push status:', status);
        setPushStatus(status);

        if (status.supported && !status.subscribed && status.permission !== 'denied') {
          console.log('[Agendamentos] 📢 Tentando auto-subscrever a push...');
          setSubscribingToPush(true);
          
          const subscription = await subscribeToPush();
          
          if (subscription) {
            console.log('[Agendamentos] ✅ Auto-subscrição bem-sucedida');
            toast.success('🔔 Notificações ativadas! Receberá lembretes de agendamentos.');
            setPushStatus(prev => ({ ...prev, subscribed: true }));
          } else {
            console.log('[Agendamentos] ⚠️ Não foi possível subscrever automaticamente');
          }
          
          setSubscribingToPush(false);
        }
      } catch (error) {
        console.error('[Agendamentos] ❌ Erro ao verificar push status:', error);
      }
    };

    checkPushStatus();

    return () => clearInterval(intervaloPolling);
  }, [carregarAgendamentos]);

  const handleManualSubscribe = async () => {
    try {
      setSubscribingToPush(true);
      console.log('[Agendamentos] 📢 Subscrevendo manualmente a push...');

      const subscription = await subscribeToPush();

      if (subscription) {
        console.log('[Agendamentos] ✅ Subscrição manual bem-sucedida');
        toast.success('✅ Notificações ativadas com sucesso!');
        setPushStatus(prev => ({ ...prev, subscribed: true }));
      } else {
        console.warn('[Agendamentos] ⚠️ Não foi possível subscrever');
        toast.error('❌ Não foi possível ativar notificações. Verifique as permissões do navegador.');
      }
    } catch (error) {
      console.error('[Agendamentos] ❌ Erro ao subscrever:', error);
      toast.error('Erro ao ativar notificações.');
    } finally {
      setSubscribingToPush(false);
    }
  };

  const handleUnsubscribe = async () => {
    try {
      setSubscribingToPush(true);
      console.log('[Agendamentos] 🔕 Desinscrever de notificações...');

      const unsubscribed = await unsubscribeFromPush();

      if (unsubscribed) {
        console.log('[Agendamentos] ✅ Desinscrição bem-sucedida');
        toast.success('🔕 Notificações desativadas com sucesso');
        setPushStatus(prev => ({ ...prev, subscribed: false }));
      } else {
        console.warn('[Agendamentos] ⚠️ Não foi possível desinscrever');
        toast.error('❌ Não foi possível desativar notificações.');
      }
    } catch (error) {
      console.error('[Agendamentos] ❌ Erro ao desinscrever:', error);
      toast.error('Erro ao desativar notificações.');
    } finally {
      setSubscribingToPush(false);
    }
  };

  const atualizarStatus = async (id, novoStatus) => {
    try {
      await api.put(`/agendamentos/${id}/status`, { status: novoStatus });
      toast.success('Status do agendamento atualizado com sucesso!');
      carregarAgendamentos();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error(error.response?.data?.message || 'Erro ao atualizar status do agendamento.');
    }
  };

  const marcarPresencaCliente = async (id, compareceu) => {
    try {
      setMarcandoPresenca(id);
      await api.put(`/agendamentos/${id}/status`, { status: compareceu ? 'Compareceu' : 'Não Compareceu' });
      toast.success(compareceu ? 'Presença marcada!' : 'Ausência registada.');
      carregarAgendamentos();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao atualizar status.');
    } finally {
      setMarcandoPresenca(null);
    }
  };

  // ✨ NEW: Confirmar agendamento
  const confirmarAgendamento = async (id, confirmacao) => {
    try {
      setConfirmando(id);
      const response = await api.patch(`/agendamentos/${id}/confirmar`, {
        confirmacao: confirmacao,
        respondidoPor: 'laura'
      });

      toast.success(`✅ Agendamento ${confirmacao === 'confirmado' ? 'confirmado' : 'rejeitado'} com sucesso!`);
      carregarAgendamentos();
    } catch (error) {
      console.error('Erro ao confirmar agendamento:', error);
      toast.error(error.response?.data?.message || 'Erro ao confirmar agendamento.');
    } finally {
      setConfirmando(null);
    }
  };

  // ✨ NEW: Enviar lembrete manual
  const enviarLembrete = async (id, clienteNome) => {
    try {
      setEnviandoLembrete(id);
      const response = await api.post(`/agendamentos/${id}/enviar-lembrete`);

      if (response.data.success) {
        toast.success(`📱 Lembrete enviado para ${clienteNome}!`);
      } else {
        toast.warning(response.data.message || 'Não foi possível enviar o lembrete.');
      }
    } catch (error) {
      console.error('Erro ao enviar lembrete:', error);
      if (error.response?.status === 404) {
        toast.error(`Cliente ${clienteNome} não possui notificações ativadas.`);
      } else {
        toast.error(error.response?.data?.message || 'Erro ao enviar lembrete.');
      }
    } finally {
      setEnviandoLembrete(null);
    }
  };

  const deletarAgendamento = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.')) {
      return;
    }
    try {
      await api.delete(`/agendamentos/${id}`);
      toast.success('Agendamento excluído com sucesso!');
      carregarAgendamentos();
    } catch (error) {
      console.error('Erro ao deletar agendamento:', error);
      toast.error(error.response?.data?.message || 'Erro ao deletar agendamento.');
    }
  };

  const handleEditarAgendamento = (idDoAgendamento) => {
    navigate(`/agendamentos/editar/${idDoAgendamento}`);
  };


  // ✨ NEW: Mostrar quem respondeu e quando
  const renderRespondidoPor = (agendamento) => {
    const confirmacao = agendamento.confirmacao;
    
    if (!confirmacao || confirmacao.tipo === 'pendente') {
      return '-';
    }

    const respondidoPor = confirmacao.respondidoPor === 'laura' ? 'Laura' : 'Cliente';
    const data = new Date(confirmacao.respondidoEm);
    const dataFormatada = data.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${respondidoPor} - ${dataFormatada}`;
  };

  const agendamentosFiltrados = useMemo(() => {
    return agendamentos
      .filter(ag => filtroStatus === 'todos' || ag.status === filtroStatus)
      .sort((a, b) => new Date(a.dataHora) - new Date(b.dataHora));
  }, [agendamentos, filtroStatus]);

  // Estilos condicionais (tema) — alinhados com PacotesAtivos
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-white/10'
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white'
    : 'bg-gray-50 border-gray-300 text-gray-900';

  // Cor do status (badge)
  const statusBadgeClass = (status) => {
    const map = {
      'Agendado':                'bg-blue-500/10 text-blue-500 border-blue-500/20',
      'Confirmado':              'bg-teal-500/10 text-teal-500 border-teal-500/20',
      'Compareceu':              'bg-purple-500/10 text-purple-500 border-purple-500/20',
      'Realizado':               'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      'Fechado':                 'bg-green-600/10 text-green-600 border-green-600/20',
      'Cancelado Pelo Cliente':  'bg-red-500/10 text-red-500 border-red-500/20',
      'Cancelado Pelo Salão':    'bg-red-500/10 text-red-500 border-red-500/20',
      'Não Compareceu':          'bg-amber-500/10 text-amber-500 border-amber-500/20',
    };
    return map[status] || 'bg-gray-500/10 text-gray-500 border-gray-500/20';
  };

  // Presets de filtro de data (pills no topo)
  const presets = [
    { value: 'hoje',    label: 'Hoje' },
    { value: 'amanha',  label: 'Amanhã' },
    { value: 'semana',  label: 'Esta semana' },
    { value: 'mes',     label: 'Este mês' },
    { value: 'todos',   label: 'Todos' },
  ];

  if (isLoading) {
    return (
      <div className={`flex flex-col justify-center items-center min-h-screen pt-24 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className={`mt-3 text-base ${subTextClass}`}>A carregar agendamentos...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pt-24 pb-8 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
      {/* Push Notification Status Banner — compacto */}
      {pushStatus.supported && !pushStatus.subscribed && pushStatus.permission !== 'denied' && (
        <div className={`mb-4 flex items-center justify-between gap-3 p-3 rounded-xl border ${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-2 text-sm">
            <Bell className="w-4 h-4 text-blue-500 shrink-0" />
            <span className={isDarkMode ? 'text-blue-300' : 'text-blue-700'}>Ativa notificações para receberes lembretes.</span>
          </div>
          <button
            onClick={handleManualSubscribe}
            disabled={subscribingToPush}
            className="px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium whitespace-nowrap transition-colors"
          >
            {subscribingToPush ? 'A ativar…' : 'Ativar'}
          </button>
        </div>
      )}
      {pushStatus.subscribed && (
        <div className={`mb-4 flex items-center justify-between gap-3 p-3 rounded-xl border ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex items-center gap-2 text-sm">
            <Bell className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className={isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}>Notificações ativas.</span>
          </div>
          <button
            onClick={handleUnsubscribe}
            disabled={subscribingToPush}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'}`}
          >
            <BellOff className="w-3.5 h-3.5 inline mr-1" />
            Desativar
          </button>
        </div>
      )}
      {pushStatus.permission === 'denied' && (
        <div className={`mb-4 flex items-center gap-2 p-3 rounded-xl border text-sm ${isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Notificações bloqueadas. Altere as permissões do navegador.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${textClass}`}>
            <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500" />
            Agendamentos
          </h1>
          <p className={`text-sm mt-1 ${subTextClass}`}>
            {agendamentosFiltrados.length} {agendamentosFiltrados.length === 1 ? 'agendamento' : 'agendamentos'} {presets.find(p => p.value === filtroData)?.label.toLowerCase()}
          </p>
        </div>
        <button
          onClick={() => navigate('/criar-agendamento')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium shadow-lg shadow-indigo-500/25"
        >
          <Plus className="w-4 h-4" />
          Novo Agendamento
        </button>
      </div>

      {/* Filtro de data — pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {presets.map(p => (
          <button
            key={p.value}
            onClick={() => setFiltroData(p.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filtroData === p.value
                ? 'bg-linear-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                : isDarkMode
                  ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filtro de status — dropdown compacto */}
      <div className="mb-6 flex items-center gap-2">
        <span className={`text-sm ${subTextClass}`}>Status:</span>
        <select
          id="filtroStatus"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className={`px-3 py-1.5 rounded-lg border text-sm ${inputClass}`}
        >
          <option value="todos">Todos</option>
          <option value="Agendado">Agendado</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Compareceu">Compareceu</option>
          <option value="Realizado">Realizado</option>
          <option value="Fechado">Fechado</option>
          <option value="Cancelado Pelo Cliente">Cancelado pelo Cliente</option>
          <option value="Cancelado Pelo Salão">Cancelado pelo Salão</option>
          <option value="Não Compareceu">Não Compareceu</option>
        </select>
      </div>

      {/* Lista de Agendamentos — cards */}
      {agendamentosFiltrados.length === 0 ? (
        <div className={`${cardClass} rounded-2xl p-12 text-center`}>
          <Calendar className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
          <p className={`text-base ${textClass}`}>Sem agendamentos {presets.find(p => p.value === filtroData)?.label.toLowerCase()}.</p>
          <p className={`text-sm mt-1 ${subTextClass}`}>Cria um novo ou alarga o filtro de data.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agendamentosFiltrados.map((ag) => {
            const dt = DateTime.fromISO(ag.dataHora).setZone(ZONA);
            const hora = dt.toFormat('HH:mm');
            const dataStr = dt.toFormat('dd/MM');
            const isHoje = dt.hasSame(DateTime.now().setZone(ZONA), 'day');
            const nomeCliente = ag.cliente?.nome || ag.lead?.nome || 'Sem nome';
            const servico = ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço';
            const isLead = ag.tipo === 'Avaliacao' && !ag.clienteConvertido;
            const conf = ag.confirmacao?.tipo || 'pendente';

            return (
              <div key={ag._id} className={`${cardClass} rounded-2xl p-4 hover:shadow-lg transition-all`}>
                {/* Topo: hora destacada + nome */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl shrink-0 ${
                    isDarkMode ? 'bg-linear-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30' : 'bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200'
                  }`}>
                    <span className={`text-lg font-bold ${isDarkMode ? 'text-indigo-300' : 'text-indigo-600'}`}>{hora}</span>
                    {!isHoje && (
                      <span className={`text-[10px] ${subTextClass}`}>{dataStr}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className={`font-semibold truncate ${textClass}`}>{nomeCliente}</h3>
                      {isLead && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">lead</span>
                      )}
                      {ag.clienteConvertido && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">cliente</span>
                      )}
                    </div>
                    <p className={`text-sm truncate mt-0.5 ${subTextClass}`}>{servico}</p>
                  </div>
                </div>

                {/* Badges: status + confirmação WhatsApp */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadgeClass(ag.status)}`}>
                    {ag.status}
                  </span>
                  {conf === 'pendente' && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                      ⏳ WhatsApp pendente
                    </span>
                  )}
                  {conf === 'confirmado' && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
                      ✓ Confirmado
                    </span>
                  )}
                  {conf === 'rejeitado' && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/10 text-red-500 border-red-500/20 font-medium">
                      ✗ Rejeitado
                    </span>
                  )}
                </div>

                {/* Acção primária contextual (1 botão maior) */}
                <div className="space-y-2">
                  {conf === 'pendente' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => confirmarAgendamento(ag._id, 'confirmado')}
                        disabled={confirmando === ag._id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        {confirmando === ag._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Confirmar
                      </button>
                      <button
                        onClick={() => confirmarAgendamento(ag._id, 'rejeitado')}
                        disabled={confirmando === ag._id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeitar
                      </button>
                    </div>
                  )}

                  {(ag.status === 'Agendado' || ag.status === 'Confirmado') && (
                    isLead ? (
                      <button
                        onClick={() => { setAgendamentoFunil(ag); setModalFunilAberto(true); }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white text-sm font-medium shadow-lg shadow-indigo-500/25"
                      >
                        <User className="w-4 h-4" />
                        Marcar Presença
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => marcarPresencaCliente(ag._id, true)}
                          disabled={marcandoPresenca === ag._id}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all text-sm font-medium disabled:opacity-50"
                        >
                          {marcandoPresenca === ag._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                          Compareceu
                        </button>
                        <button
                          onClick={() => marcarPresencaCliente(ag._id, false)}
                          disabled={marcandoPresenca === ag._id}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50"
                        >
                          <UserX className="w-4 h-4" />
                          Faltou
                        </button>
                      </div>
                    )
                  )}

                  {ag.status === 'Compareceu' && isLead && (
                    <button
                      onClick={() => { setAgendamentoFunil(ag); setModalFunilAberto(true); }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-linear-to-r from-emerald-500 to-emerald-600 hover:opacity-90 transition-all text-white text-sm font-medium shadow-lg shadow-emerald-500/25"
                    >
                      <Sparkles className="w-4 h-4" />
                      Fechar Avaliação
                    </button>
                  )}

                  {ag.status === 'Realizado' && (
                    <button
                      onClick={() => { setAgendamentoParaFinalizar(ag); setModalFinalizarAberto(true); }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-linear-to-r from-green-600 to-emerald-700 hover:opacity-90 transition-all text-white text-sm font-medium shadow-lg shadow-green-500/25"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Finalizar Atendimento
                    </button>
                  )}

                  {/* Acções secundárias — ícones compactos */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => enviarLembrete(ag._id, ag.cliente?.nome)}
                      disabled={enviandoLembrete === ag._id}
                      className={`flex-1 p-2 rounded-lg ${isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5`}
                      title="Enviar lembrete WhatsApp"
                    >
                      {enviandoLembrete === ag._id
                        ? <Loader2 className={`w-4 h-4 animate-spin ${subTextClass}`} />
                        : <MessageSquare className={`w-4 h-4 ${subTextClass}`} />}
                      <span className={`text-xs ${subTextClass}`}>Lembrete</span>
                    </button>
                    <button
                      onClick={() => handleEditarAgendamento(ag._id)}
                      className={`p-2 rounded-lg ${isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                      title="Editar"
                    >
                      <Edit className="w-4 h-4 text-indigo-500" />
                    </button>
                    <button
                      onClick={() => deletarAgendamento(ag._id)}
                      className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'} transition-colors`}
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>

                  {/* Quem confirmou (rodapé sutil) */}
                  {ag.confirmacao && ag.confirmacao.tipo !== 'pendente' && (
                    <div className={`text-[11px] pt-2 border-t ${isDarkMode ? 'border-white/10 text-slate-500' : 'border-gray-200 text-gray-500'}`}>
                      {renderRespondidoPor(ag)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal do Funil de Avaliação */}
      <FunilAvaliacaoModal
        isOpen={modalFunilAberto}
        agendamento={agendamentoFunil}
        onClose={() => { carregarAgendamentos(); setModalFunilAberto(false); setAgendamentoFunil(null); }}
        onSuccess={() => { carregarAgendamentos(); setModalFunilAberto(false); setAgendamentoFunil(null); }}
      />

      {/* Modal de Finalizar Atendimento */}
      <FinalizarAtendimentoModal
        isOpen={modalFinalizarAberto}
        onClose={() => {
          setModalFinalizarAberto(false);
          setAgendamentoParaFinalizar(null);
        }}
        agendamento={agendamentoParaFinalizar}
        onSuccess={() => {
          carregarAgendamentos();
          setModalFinalizarAberto(false);
          setAgendamentoParaFinalizar(null);
        }}
      />
    </div>
    </div>
  );
}

export default Agendamentos;