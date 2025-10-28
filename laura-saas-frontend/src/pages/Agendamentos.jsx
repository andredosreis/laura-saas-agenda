import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { subscribeToPush, getPushStatus } from '../services/notificationService';

function Agendamentos() {
  const navigate = useNavigate();
  const [agendamentos, setAgendamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  
  // ✨ NEW: Push Notification State
  const [pushStatus, setPushStatus] = useState({
    supported: false,
    permission: 'default',
    subscribed: false,
    disabledReason: undefined,
  });
  const [subscribingToPush, setSubscribingToPush] = useState(false);

  // Carregar agendamentos
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

  // ✨ NEW: Initialize Push Notifications
  useEffect(() => {
    carregarAgendamentos();

    // 1️⃣ Check current push status
    const checkPushStatus = async () => {
      try {
        const status = await getPushStatus();
        console.log('[Agendamentos] 🔔 Push status:', status);
        setPushStatus(status);

        // 2️⃣ Se não está subscrito e tem suporte, tentar subscrever
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

  // ✨ NEW: Manual Subscribe Handler
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

  // Atualizar status do agendamento
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

  // Deletar agendamento
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

  // Formatar data
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

  // Filtrar agendamentos por status
  const agendamentosFiltrados = agendamentos.filter(agendamento => {
    if (filtroStatus === 'todos') return true;
    return agendamento.status === filtroStatus;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
        <p className="mt-3 text-gray-700 text-lg">Carregando agendamentos...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ✨ NEW: Push Notification Status Banner */}
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
        <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded">
          <p className="text-green-700 font-semibold">✅ Notificações Ativas</p>
          <p className="text-green-600 text-sm">Receberá lembretes de agendamentos via notificações.</p>
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
                    ${agendamento.status === 'Não Compareceu' ? 'bg-gray-100 text-gray-800' : ''}
                  `}>
                    {agendamento.status || 'N/D'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end items-center space-x-2">
                    {!(agendamento.status === 'Realizado' || agendamento.status === 'Cancelado Pelo Cliente' || agendamento.status === 'Cancelado Pelo Salão' || agendamento.status === 'Não Compareceu') && (
                      <button
                        onClick={() => handleEditarAgendamento(agendamento._id)}
                        className="text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-md hover:bg-indigo-50 transition-colors text-xs"
                        title="Editar Agendamento"
                      >
                        Editar
                      </button>
                    )}

                    {(agendamento.status === 'Agendado' || agendamento.status === 'Confirmado') && (
                      <>
                        <button
                          onClick={() => atualizarStatus(agendamento._id, 'Realizado')}
                          className="text-green-600 hover:text-green-800 px-3 py-1 rounded-md hover:bg-green-50 transition-colors text-xs"
                          title="Marcar como Realizado"
                        >
                          Realizar
                        </button>
                        <button
                          onClick={() => atualizarStatus(agendamento._id, 'Cancelado Pelo Salão')}
                          className="text-orange-500 hover:text-orange-700 px-3 py-1 rounded-md hover:bg-orange-50 transition-colors text-xs"
                          title="Cancelar Agendamento (Pelo Salão)"
                        >
                          Cancelar
                        </button>
                      </>
                    )}

                    {(agendamento.status === 'Cancelado Pelo Cliente' || agendamento.status === 'Cancelado Pelo Salão' || agendamento.status === 'Não Compareceu') && (
                      <button
                        onClick={() => deletarAgendamento(agendamento._id)}
                        className="text-red-600 hover:text-red-800 px-3 py-1 rounded-md hover:bg-red-50 transition-colors text-xs"
                        title="Excluir Agendamento Permanentemente"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {agendamentosFiltrados.length === 0 && !isLoading && (
          <div className="text-center py-10 text-gray-500">
            Nenhum agendamento encontrado com os filtros aplicados.
          </div>
        )}
      </div>
    </div>
  );
}

export default Agendamentos;