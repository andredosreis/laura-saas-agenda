import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Importar useNavigate
import api from '../services/api';
import {toast} from 'react-toastify';
// import { set } from 'mongoose'; // Removido pois não está sendo usado

// Importando o CSS do Tailwind
// (Podemos criar subcomponentes para cada card/widget depois para organizar melhor)
function Dashboard() {
  // Aqui podemos adicionar os cards/widgets do dashboard
  const navigate = useNavigate(); // Corrigido e inicializado corretamente

  //Estado para armazenar os dados do dashboard
  const [agendamentosHoje, setAgendamentosHoje] = useState([]); // Estado para agendamentos de hoje
  const [agendamento, setAgendamentos] = useState([]); // Removido ou renomear se for para outro propósito
  const [contagemAmanha, setContagemAmanha] = useState(0); // Removido - não utilizado no trecho
  const [concluidosSemana, setConcluidosSemana] = useState(0); // Removido - não utilizado no trecho
  const [alertaSessoes, setAlertaSessoes] = useState([]); // Removido - não utilizado no trecho
  const [isLoading, setIsLoading] = useState(true);
  const [totais, setTotais] = useState({});


  //vamos fazer o fetch dos dados do dashboard
  useEffect (() => {
    const fetchAgendamentosHoje = async () => {
      setIsLoading(true);
      try {
        const response = await api.get('/dashboard/agendamentosHoje');
        setAgendamentosHoje(response.data || []);
      } catch (error) {
        console.error('Erro ao buscar agendamentos de hoje:', error);
        // O interceptor do api.js já deve mostrar um toast, mas podemos adicionar um específico se quisermos.
        // toast.error("Não foi possível carregar os agendamentos de hoje.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAgendamentosHoje();
  }, []); // Array de dependências vazio para executar apenas uma vez na montagem

  const formatarDataHora = (dataIso) => {
    if (!dataIso) return '';
    const data = new Date(dataIso);
    // Formatar para HH:mm
    return data.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen"> {/* Corrigido flex-col */}
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500'> </div> {/* Corrigido border-amber-500 */}
        <p className='mt-3 text-gray-700 text-lg'> Carregando o Dashboard</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8"> {/* Adicionado padding para melhor visualização */}
      <div className="text-center mb-8"> {/* Movido o título para dentro do retorno principal */}
        <h1 className="text-4xl md:text-5xl text-blue-600 font-bold mb-4">
          Bem-vindo ao Dashboard
        </h1>
        <p className="text-lg text-gray-600">Vamos começar a construir o sistema da Laura!</p>
      </div>
      {/* Seção: Agendamentos de Hoje */}
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
                  
                  {/* Tooltip para observações */}
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

      {/* Aqui adicionaremos os outros cards/widgets depois */}
      
      
    </div>
    
  );
}

// Função e useEffect para buscar totais do dashboard
useEffect(() => {
  const fetchTotais = async () => {
    try {
      const response = await api.get('/dashboard/totais');
      setTotais(response.data || {});
    } catch (error) {
      // toast.error("Erro ao buscar totais");
    }
  };
  fetchTotais();

}, []);
<div className="bg-white p-6 rounded-xl shadow-lg mb-8">
  <h2 className="text-2xl font-semibold text-gray-700 mb-4">📊 Totais do Sistema</h2>
  <p>Clientes: {totais.totalClientes ?? 0}</p>
  <p>Pacotes: {totais.totalPacotes ?? 0}</p>
  <p>Agendamentos: {totais.totalAgendamentos ?? 0}</p>
</div>



export default Dashboard;
