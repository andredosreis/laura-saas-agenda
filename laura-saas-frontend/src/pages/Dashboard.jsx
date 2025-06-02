import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

function Dashboard() {
  const navigate = useNavigate();

  const [agendamentosHoje, setAgendamentosHoje] = useState([]);
  const [totais, setTotais] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [contagemAmanha, setContagemAmanha] = useState(0);
  const [concluidosSemana, setConcluidosSemana] = useState(0);
  const [agendamentosAmanha, setAgendamentosAmanha] = useState([]);

  const [sessoesBaixas, setSessoesBaixas] = useState([]);

  

 useEffect(() => {
  async function fetchDadosDashboard() {
    setIsLoading(true);
    try {
      const [
        resAgendamentosHoje,
        resTotais,
      
        resAmanha,

        resSemana,
        resSessoes
      ] = await Promise.all([
        api.get('/dashboard/agendamentosHoje'),
        api.get('/dashboard/totais'),
        api.get('/dashboard/contagemAgendamentosAmanha'),
        api.get('/dashboard/clientesAtendidosSemana'),
        api.get('/dashboard/sessoes-baixas?limite=2')
      ]);
      setAgendamentosHoje(resAgendamentosHoje.data || []);
      setTotais(resTotais.data || {});
      setContagemAmanha(resAmanha.data.contagem ?? 0);
      setConcluidosSemana(resSemana.data.contagem ?? 0);
      setSessoesBaixas(resSessoes.data.clientes || []);
    } catch (error) {
      // toast.error("Erro ao carregar o dashboard");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }
  fetchDadosDashboard();
}, []);


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

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
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
                {/* Cabeçalho do card com horário e status */}
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
                {/* Corpo do card */}
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
                {/* Rodapé com botão */}
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

        {/* CARD: sessões de agendementos de amanhã */}
    


      {/* Adicione aqui os próximos cards/widgets (sessões baixas, próximos agendamentos etc.) */}
    </div>
  );
}

export default Dashboard;
