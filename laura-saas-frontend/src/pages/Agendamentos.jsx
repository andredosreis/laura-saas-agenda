import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';

function Agendamentos() {
  const navigate = useNavigate();
  const [agendamentos, setAgendamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('todos');

  // Carregar agendamentos
  const carregarAgendamentos = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/agendamentos');
      setAgendamentos(response.data);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarAgendamentos();
  }, []);

  // Atualizar status do agendamento
  const atualizarStatus = async (id, novoStatus) => {
    try {
      await api.put(`/agendamentos/${id}/status`, { status: novoStatus });
      toast.success('Status atualizado com sucesso!');
      carregarAgendamentos();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  // Deletar agendamento
  const deletarAgendamento = async (id) => {
    if (!window.confirm('Tem certeza que deseja excluir este agendamento?')) {
      return;
    }

    try {
      await api.delete(`/agendamentos/${id}`);
      toast.success('Agendamento excluído com sucesso!');
      carregarAgendamentos();
    } catch (error) {
      console.error('Erro ao deletar agendamento:', error);
      toast.error('Erro ao deletar agendamento');
    }
  };

  // Formatar data
  const formatarData = (data) => {
    try {
      return new Date(data).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
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
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Agendamentos</h1>
        <button
          onClick={() => navigate('/criar-agendamento')}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
        >
          Novo Agendamento
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-6">
        <label className="mr-2">Filtrar por status:</label>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="border rounded p-2"
        >
          <option value="todos">Todos</option>
          <option value="AGENDADO">Agendados</option>
          <option value="CONCLUIDO">Concluídos</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
      </div>

      {/* Lista de Agendamentos */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pacote
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data/Hora
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agendamentosFiltrados.map((agendamento) => (
              <tr key={agendamento._id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {agendamento.cliente?.nome || 'Cliente não encontrado'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {agendamento.pacote?.nome || 'Pacote não encontrado'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {formatarData(agendamento.dataHora)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${agendamento.status === 'AGENDADO' ? 'bg-yellow-100 text-yellow-800' : ''}
                    ${agendamento.status === 'CONCLUIDO' ? 'bg-green-100 text-green-800' : ''}
                    ${agendamento.status === 'CANCELADO' ? 'bg-red-100 text-red-800' : ''}
                  `}>
                    {agendamento.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {agendamento.status === 'AGENDADO' && (
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => atualizarStatus(agendamento._id, 'CONCLUIDO')}
                        className="text-green-600 hover:text-green-900"
                      >
                        Concluir
                      </button>
                      <button
                        onClick={() => atualizarStatus(agendamento._id, 'CANCELADO')}
                        className="text-red-600 hover:text-red-900"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => deletarAgendamento(agendamento._id)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Excluir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {agendamentosFiltrados.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            Nenhum agendamento encontrado
          </div>
        )}
      </div>
    </div>
  );
}

export default Agendamentos;