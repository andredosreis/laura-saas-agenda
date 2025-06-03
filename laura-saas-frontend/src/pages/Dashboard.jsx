import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api'; // Certifica-te que este caminho está correto

function Dashboard() {
  const navigate = useNavigate();

  const [agendamentosHoje, setAgendamentosHoje] = useState([]);
  const [agendamentosAmanha, setAgendamentosAmanha] = useState([]);
  const [totais, setTotais] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [contagemAmanha, setContagemAmanha] = useState(0);
  const [concluidosSemana, setConcluidosSemana] = useState(0);
  const [sessoesBaixas, setSessoesBaixas] = useState([]);
  const [proximosAgendamentosLista, setProximosAgendamentosLista] = useState([]);

  const limiteSessoesBaixasParaFetch = 2; // Definindo o limite aqui para reutilizar

  useEffect(() => {
    async function fetchDadosDashboard() {
      setIsLoading(true);
      try {
        const [
          resAgendamentosHoje,
          resTotais,
          resListaAmanha,
          resContagemAmanha,
          resSemana,
          resSessoes,
          resProximosAgendamentos
        ] = await Promise.all([
          api.get('/dashboard/agendamentosHoje'),
          api.get('/dashboard/totais'),
          api.get('/dashboard/agendamentosAmanha'),
          api.get('/dashboard/contagemAgendamentosAmanha'),
          api.get('/dashboard/clientesAtendidosSemana'),
          api.get(`/dashboard/sessoes-baixas?limite=${limiteSessoesBaixasParaFetch}`),
          api.get('/dashboard/proximos-agendamentos?limit=5')
        ]);

        setAgendamentosHoje(resAgendamentosHoje.data || []);
        setTotais(resTotais.data || {});
        setAgendamentosAmanha(resListaAmanha.data || []);
        setContagemAmanha(resContagemAmanha.data.contagem ?? 0);
        setConcluidosSemana(resSemana.data.contagem ?? 0);
        setSessoesBaixas(resSessoes.data.clientes || []);
        setProximosAgendamentosLista(resProximosAgendamentos.data.agendamentos || []);
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
        // toast.error("Falha ao carregar dados do dashboard.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchDadosDashboard();
  }, []); // Adicione limiteSessoesBaixasParaFetch ao array de dependências se ele puder mudar dinamicamente no futuro. Por agora, está ok.

  const formatarDataHora = (dataIso) => {
    if (!dataIso) return '';
    const data = new Date(dataIso);
    return data.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500'></div>
        <p className='mt-3 text-gray-700 text-lg'>Carregando o Dashboard</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl text-blue-600 font-bold mb-4">
          Bem-vindo ao La Estetica Avançada
        </h1>
        <p className="text-lg text-gray-600">Aonde o Cliente vem para ter uma experiência</p>
      </div>

      {/* Mini-Cards no Topo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center border border-blue-100">
          <span className="text-2xl font-bold text-blue-600">{totais.totalClientes ?? 0}</span>
          <span className="text-xs text-gray-500 mt-1">Clientes</span>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center border border-amber-100">
          <span className="text-2xl font-bold text-amber-600">{agendamentosHoje.length ?? 0}</span>
          <span className="text-xs text-gray-500 mt-1">Agend. Hoje</span>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center border border-green-100">
          <span className="text-2xl font-bold text-green-600">{contagemAmanha ?? 0}</span>
          <span className="text-xs text-gray-500 mt-1">Agend. Amanhã</span>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center border border-rose-100">
          <span className="text-2xl font-bold text-rose-600">{concluidosSemana ?? 0}</span>
          <span className="text-xs text-gray-500 mt-1">Atendidos Semana</span>
        </div>
        <div className="bg-white rounded-lg shadow p-4 flex flex-col items-center border border-red-100">
          <span className="text-2xl font-bold text-red-600">{sessoesBaixas.length ?? 0}</span>
          <span className="text-xs text-gray-500 mt-1">Sessões Baixas</span>
        </div>
      </div>

      {/* CARD: Agendamentos de Hoje */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">🗓️ Agendamentos de Hoje</h2>
        {agendamentosHoje.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {agendamentosHoje.map(ag => (
              <div key={ag._id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
                <div className="flex justify-between items-center p-2 bg-gray-50 border-b border-gray-100">
                  <span className="font-medium text-gray-700">{formatarDataHora(ag.dataHora)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    ag.status === 'Realizado' ? 'bg-green-100 text-green-700' :
                    ag.status === 'Cancelado Pelo Cliente' || ag.status === 'Cancelado Pelo Salão' ? 'bg-red-100 text-red-700' :
                    ag.status === 'Confirmado' ? 'bg-teal-100 text-teal-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {ag.status}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-medium text-gray-800 truncate" title={ag.cliente?.nome || 'Cliente não especificado'}>
                    {ag.cliente?.nome || 'Cliente não especificado'}
                  </p>
                  <p className="text-xs text-gray-600 truncate" title={ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço não especificado'}>
                    {ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço não especificado'}
                  </p>
                  {ag.observacoes && (
                    <div className="mt-1 flex items-center">
                      <span className="text-xs text-amber-600 mr-1">📝</span>
                      <p className="text-xs text-gray-500 truncate" title={ag.observacoes}>
                        {ag.observacoes}
                      </p>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 p-2 text-center border-t border-gray-100">
                  <button
                    onClick={() => navigate(`/agendamentos/editar/${ag._id}`)}
                    className="w-full text-xs bg-amber-500 hover:bg-amber-600 text-white py-1 px-3 rounded transition-colors"
                  >
                    Ver Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Nenhum agendamento para hoje.</p>
        )}
      </div>

      {/* CARD: Agendamentos de Amanhã (Lista Detalhada) */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">🗓️ Agendamentos de Amanhã</h2>
        {agendamentosAmanha.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {agendamentosAmanha.map(ag => (
              <div key={ag._id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
                <div className="flex justify-between items-center p-2 bg-gray-50 border-b border-gray-100">
                  <span className="font-medium text-gray-700">{formatarDataHora(ag.dataHora)}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    ag.status === 'Realizado' ? 'bg-green-100 text-green-700' :
                    ag.status === 'Cancelado Pelo Cliente' || ag.status === 'Cancelado Pelo Salão' ? 'bg-red-100 text-red-700' :
                    ag.status === 'Confirmado' ? 'bg-teal-100 text-teal-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {ag.status}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-medium text-gray-800 truncate" title={ag.cliente?.nome || 'Cliente não especificado'}>
                    {ag.cliente?.nome || 'Cliente não especificado'}
                  </p>
                  <p className="text-xs text-gray-600 truncate" title={ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço não especificado'}>
                    {ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço não especificado'}
                  </p>
                  {ag.observacoes && (
                    <div className="mt-1 flex items-center">
                      <span className="text-xs text-amber-600 mr-1">📝</span>
                      <p className="text-xs text-gray-500 truncate" title={ag.observacoes}>
                        {ag.observacoes}
                      </p>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 p-2 text-center border-t border-gray-100">
                  <button
                    onClick={() => navigate(`/agendamentos/editar/${ag._id}`)}
                    className="w-full text-xs bg-green-500 hover:bg-green-600 text-white py-1 px-3 rounded transition-colors"
                  >
                    Ver Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Nenhum agendamento para amanhã.</p>
        )}
      </div>

      {/* CARD: Próximos Agendamentos */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-2xl font-semibold text-gray-700 mb-4">
          <span role="img" aria-label="calendário com seta">📅➡️</span> Próximos Agendamentos (Limite: 5)
        </h2>
        {proximosAgendamentosLista.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {proximosAgendamentosLista.map(ag => (
              <div key={ag._id} className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow overflow-hidden">
                <div className="flex justify-between items-center p-2 bg-gray-50 border-b border-gray-100">
                  <span className="font-medium text-gray-700">
                    {new Date(ag.dataHora).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} às {formatarDataHora(ag.dataHora)}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    ag.status === 'Realizado' ? 'bg-green-100 text-green-700' :
                    ag.status === 'Cancelado Pelo Cliente' || ag.status === 'Cancelado Pelo Salão' ? 'bg-red-100 text-red-700' :
                    ag.status === 'Confirmado' ? 'bg-teal-100 text-teal-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {ag.status}
                  </span>
                </div>
                <div className="p-3">
                  <p className="font-medium text-gray-800 truncate" title={ag.cliente?.nome || 'Cliente não especificado'}>
                    {ag.cliente?.nome || 'Cliente não especificado'}
                  </p>
                  <p className="text-xs text-gray-600 truncate" title={ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço não especificado'}>
                    {ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço não especificado'}
                  </p>
                  {ag.observacoes && (
                    <div className="mt-1 flex items-center">
                      <span className="text-xs text-amber-600 mr-1">📝</span>
                      <p className="text-xs text-gray-500 truncate" title={ag.observacoes}>
                        {ag.observacoes}
                      </p>
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 p-2 text-center border-t border-gray-100">
                  <button
                    onClick={() => navigate(`/agendamentos/editar/${ag._id}`)}
                    className="w-full text-xs bg-sky-500 hover:bg-sky-600 text-white py-1 px-3 rounded transition-colors"
                  >
                    Ver Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Nenhum próximo agendamento encontrado.</p>
        )}
      </div>

      {/* CARD: Clientes com Sessões Baixas */}
      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h2 className="text-2xl font-semibold text-red-600 mb-4">
          <span role="img" aria-label="alerta">⚠️</span> Clientes com Sessões Baixas ({limiteSessoesBaixasParaFetch} ou menos)
        </h2>
        {sessoesBaixas.length > 0 ? (
          <div className="space-y-3">
            {sessoesBaixas.map(cliente => (
              <div key={cliente._id} className="bg-red-50 p-3 rounded-lg border border-red-200 flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-800">{cliente.nome}</p>
                  {cliente.telefone && (
                    <p className="text-xs text-gray-600">Tel: {cliente.telefone}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="block text-lg font-bold text-red-500">
                    {cliente.sessoesRestantes}
                  </span>
                  <span className="text-xs text-gray-500">Sessão(ões)</span>
                </div>
                {/* Opcional: Botão para ver detalhes do cliente */}
                <button
                  onClick={() => navigate(`/clientes/editar/${cliente._id}`)}
                  title={`Ver detalhes de ${cliente.nome}`}
                  className="ml-4 text-xs bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded transition-colors"
                >
                  Ver Cliente
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Nenhum cliente com sessões baixas no momento.</p>
        )}
      </div>

      {/* Espaço para futuros cards/widgets */}
    </div>
  );
}

export default Dashboard;