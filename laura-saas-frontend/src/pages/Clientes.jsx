import { useEffect, useState } from "react";
import { toast } from 'react-toastify';
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import ErrorBoundary from "../components/ErrorBoundary";
// Remover import não utilizado
// import { response } from "express";

// Componente ClienteCard com verificações de segurança
const ClienteCard = ({ cliente, pacotes = [], onEdit, onDelete }) => {
  if (!cliente) return null;
  
  const totalSessoes = pacotes.reduce((sum, cp) => sum + cp.sessoesRestantes, 0);
  const primeiroPacote = pacotes[0];

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition duration-300">
      <h2 className="text-lg font-semibold text-gray-800">
        {cliente.nome || 'Nome não informado'}
      </h2>
      <p className="text-gray-600">📞 {cliente.telefone || 'Não informado'}</p>
      <p className="text-gray-600">
        💆 Serviço: {primeiroPacote?.pacote?.nome || "Nenhum serviço"}
        {pacotes.length > 1 && <span className="text-xs text-blue-600 ml-1">(+{pacotes.length - 1})</span>}
      </p>
      <p className="text-gray-600">
        📅 Sessões restantes: {totalSessoes > 0 ? totalSessoes : "0"}
      </p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onEdit(cliente._id)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(cliente._id)}
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
        >
          Deletar
        </button>
      </div>
    </div>
  );
};

function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [pacotesClientes, setPacotesClientes] = useState({}); // { clienteId: [pacotes] }
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Função para buscar clientes otimizada
  const fetchClientes = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/clientes");

      console.log("DADOS RECEBIDOS PELA API:", response.data);

      const clientesData = Array.isArray(response.data?.data) ? response.data.data : [];
      setClientes(clientesData);
      
      // Buscar pacotes de cada cliente
      if (clientesData.length > 0) {
        const pacotesPromises = clientesData.map(async (cliente) => {
          try {
            const pacotesRes = await api.get(`/compras-pacotes/cliente/${cliente._id}`);
            const pacotesAtivos = (pacotesRes.data || []).filter(
              (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
            );
            return { clienteId: cliente._id, pacotes: pacotesAtivos };
          } catch (error) {
            console.error(`Erro ao buscar pacotes do cliente ${cliente._id}:`, error);
            return { clienteId: cliente._id, pacotes: [] };
          }
        });
        
        const pacotesResults = await Promise.all(pacotesPromises);
        const pacotesMap = {};
        pacotesResults.forEach(({ clienteId, pacotes }) => {
          pacotesMap[clienteId] = pacotes;
        });
        setPacotesClientes(pacotesMap);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  // Deletar cliente simplificado (sem try/catch, pois o erro já é tratado no api.js)
  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja deletar este cliente?")) return;
    
    setIsLoading(true);
    await api.delete(`/clientes/${id}`);
    setClientes(clientesAtuais => clientesAtuais.filter(cliente => cliente._id !== id));
    toast.success("Cliente deletado com sucesso!");
    setIsLoading(false);
  };

  // Navegar para edição
  const handleEdit = (id) => navigate(`/clientes/editar/${id}`);

  // Componente de Loading
  if (isLoading) {
    return (
      <div className="pt-24 px-4 pb-4 max-w-7xl mx-auto min-h-screen bg-slate-900">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="pt-24 px-4 pb-4 max-w-7xl mx-auto min-h-screen bg-slate-900">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Lista de Clientes</h1>
          <button
            onClick={() => navigate('/criar-cliente')}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
          >
            Novo Cliente
          </button>
        </div>

        {clientes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Nenhum cliente encontrado.</p>
            <p className="text-gray-500 mt-2">Comece adicionando um novo cliente!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientes.map((cliente) => (
              <ClienteCard
                key={cliente._id}
                cliente={cliente}
                pacotes={pacotesClientes[cliente._id] || []}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default Clientes;