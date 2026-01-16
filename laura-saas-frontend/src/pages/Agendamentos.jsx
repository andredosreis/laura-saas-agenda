import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { subscribeToPush, getPushStatus, unsubscribeFromPush } from '../services/notificationService';
import FinalizarAtendimentoModal from '../components/FinalizarAtendimentoModal';

function Agendamentos() {
  const navigate = useNavigate();
  const [agendamentos, setAgendamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [confirmando, setConfirmando] = useState(null);
  const [enviandoLembrete, setEnviandoLembrete] = useState(null);
  const [modalFinalizarAberto, setModalFinalizarAberto] = useState(false);
  const [agendamentoParaFinalizar, setAgendamentoParaFinalizar] = useState(null);
  
  const [pushStatus, setPushStatus] = useState({
    supported: false,
    permission: 'default',
    subscribed: false,
    disabledReason: undefined,
  });
  const [subscribingToPush, setSubscribingToPush] = useState(false);

  const carregarAgendamentos = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/agendamentos');
      setAgendamentos(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      toast.error('Erro ao carregar agendamentos. Tente novamente mais tarde.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarAgendamentos();

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
  }, []);

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

  const formatarData = (dataIsoString) => {
    if (!dataIsoString) return 'Data não definida';
    try {
      const data = new Date(dataIsoString);
      return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return 'Data inválida';
    }
  };

  // ✨ NEW: Renderizar status de confirmação
  const renderStatusConfirmacao = (agendamento) => {
    const confirmacao = agendamento.confirmacao;
    
    if (!confirmacao || confirmacao.tipo === 'pendente') {
      return (
        <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
          ⏳ Pendente
        </span>
      );
    }
    
    if (confirmacao.tipo === 'confirmado') {
      return (
        <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
          ✅ Confirmado
        </span>
      );
    }
    
    if (confirmacao.tipo === 'rejeitado') {
      return (
        <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
          ❌ Rejeitado
        </span>
      );
    }
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

  const agendamentosFiltrados = agendamentos.filter(agendamento => {
    if (filtroStatus === 'todos') return true;
    return agendamento.status === filtroStatus;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen pt-24">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        <p className="mt-3 text-gray-700 text-lg">Carregando agendamentos...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
      {/* Push Notification Status Banner */}
      {pushStatus.supported && !pushStatus.subscribed && pushStatus.permission !== 'denied' && (
        <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded flex items-start justify-between">
          <div>
            <p className="text-blue-700 font-semibold">🔔 Notificações Disponíveis</p>
            <p className="text-blue-600 text-sm">Ative notificações para receber lembretes de agendamentos.</p>
          </div>
          <button
            onClick={handleManualSubscribe}
            disabled={subscribingToPush}
            className="ml-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition-colors text-sm whitespace-nowrap"
          >
            {subscribingToPush ? '⏳ Ativando...' : '✅ Ativar'}
          </button>
        </div>
      )}

      {pushStatus.subscribed && (
        <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded flex items-start justify-between">
          <div>
            <p className="text-green-700 font-semibold">✅ Notificações Ativas</p>
            <p className="text-green-600 text-sm">Receberá lembretes de agendamentos via notificações.</p>
          </div>
          <button
            onClick={handleUnsubscribe}
            disabled={subscribingToPush}
            className="ml-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition-colors text-sm whitespace-nowrap"
          >
            {subscribingToPush ? '⏳ Desativando...' : '🔕 Desativar'}
          </button>
        </div>
      )}

      {pushStatus.permission === 'denied' && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <p className="text-red-700 font-semibold">❌ Notificações Bloqueadas</p>
          <p className="text-red-600 text-sm">Altere as permissões do navegador para ativar notificações.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Agendamentos</h1>
        <button
          onClick={() => navigate('/criar-agendamento')}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-all duration-150 ease-in-out"
        >
          Novo Agendamento
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <label htmlFor="filtroStatus" className="mr-2 font-medium text-gray-700">Filtrar por status:</label>
        <select
          id="filtroStatus"
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="border border-gray-300 rounded-md p-2 focus:ring-amber-500 focus:border-amber-500"
        >
          <option value="todos">Todos</option>
          <option value="Agendado">Agendado</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Realizado">Realizado</option>
          <option value="Cancelado Pelo Cliente">Cancelado Pelo Cliente</option>
          <option value="Cancelado Pelo Salão">Cancelado Pelo Salão</option>
          <option value="Não Compareceu">Não Compareceu</option>
        </select>
      </div>

      {/* Lista de Agendamentos */}
      <div className="bg-white shadow-xl rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Serviço/Pacote</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data/Hora</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Confirmação</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Respondido</th>
              <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agendamentosFiltrados.map((agendamento) => (
              <tr key={agendamento._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {agendamento.cliente?.nome || 'N/D'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {agendamento.pacote?.nome || agendamento.servicoAvulsoNome || 'N/D'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {formatarData(agendamento.dataHora)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${agendamento.status === 'Agendado' ? 'bg-blue-100 text-blue-800' : ''}
                    ${agendamento.status === 'Confirmado' ? 'bg-teal-100 text-teal-800' : ''}
                    ${agendamento.status === 'Realizado' ? 'bg-green-100 text-green-800' : ''}
                    ${agendamento.status === 'Cancelado Pelo Cliente' || agendamento.status === 'Cancelado Pelo Salão' ? 'bg-red-100 text-red-800' : ''}
                    ${agendamento.status === 'Não Compareceu' ? 'bg-yellow-100 text-yellow-800' : ''}
                  `}>
                    {agendamento.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {renderStatusConfirmacao(agendamento)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {renderRespondidoPor(agendamento)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex flex-col gap-2">
                    {/* Linha 1: Botões de confirmação (apenas se pendente) */}
                    {(!agendamento.confirmacao || agendamento.confirmacao.tipo === 'pendente') && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => confirmarAgendamento(agendamento._id, 'confirmado')}
                          disabled={confirmando === agendamento._id}
                          className="inline-flex items-center px-2.5 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white text-xs font-semibold rounded transition-colors"
                        >
                          {confirmando === agendamento._id ? '⏳' : '✅'} Confirmar
                        </button>
                        <button
                          onClick={() => confirmarAgendamento(agendamento._id, 'rejeitado')}
                          disabled={confirmando === agendamento._id}
                          className="inline-flex items-center px-2.5 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white text-xs font-semibold rounded transition-colors"
                        >
                          {confirmando === agendamento._id ? '⏳' : '❌'} Rejeitar
                        </button>
                      </div>
                    )}

                    {/* Linha 2: Botão Finalizar Atendimento (apenas para Confirmado/Realizado) */}
                    {(agendamento.status === 'Confirmado' || agendamento.status === 'Realizado') && (
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setAgendamentoParaFinalizar(agendamento);
                            setModalFinalizarAberto(true);
                          }}
                          className="inline-flex items-center px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded transition-colors"
                          title="Finalizar atendimento e registrar histórico"
                        >
                          ✓ Finalizar Atendimento
                        </button>
                      </div>
                    )}

                    {/* Linha 3: Botão de lembrete + editar/deletar */}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => enviarLembrete(agendamento._id, agendamento.cliente?.nome)}
                        disabled={enviandoLembrete === agendamento._id}
                        className="inline-flex items-center px-2.5 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-xs font-semibold rounded transition-colors"
                        title="Enviar lembrete via notificação"
                      >
                        {enviandoLembrete === agendamento._id ? '⏳' : '📱'} Lembrete
                      </button>
                      <button
                        onClick={() => handleEditarAgendamento(agendamento._id)}
                        className="text-indigo-600 hover:text-indigo-900 text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deletarAgendamento(agendamento._id)}
                        className="text-red-600 hover:text-red-900 text-xs font-medium"
                      >
                        Deletar
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  );
}

export default Agendamentos;