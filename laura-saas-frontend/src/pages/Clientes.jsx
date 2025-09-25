import { useEffect, useState } from "react";
import { toast } from 'react-toastify';
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import ErrorBoundary from "../components/ErrorBoundary";
// Remover import não utilizado
// import { response } from "express";

// Componente ClienteCard com verificações de segurança
const ClienteCard = ({ cliente, onEdit, onDelete }) => {
  if (!cliente) return null;

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition duration-300">
      <h2 className="text-lg font-semibold text-gray-800">
        {cliente.nome || 'Nome não informado'}
      </h2>
      <p className="text-gray-600">📞 {cliente.telefone || 'Não informado'}</p>
      <p className="text-gray-600">
        💆 Pacote: {cliente.pacote?.nome || "Nenhum pacote"}
      </p>
      <p className="text-gray-600">
        📅 Sessões restantes: {cliente.sessoesRestantes ?? "N/A"}
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
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Função para buscar clientes otimizada
  const fetchClientes = async () => {
    try {
      setIsLoading(true);
      const response = await api.get("/clientes");

      console.log("DADOS RECEBIDOS PELA API:", response.data);

      //const dados = response.data;
       setClientes(Array.isArray(response.data) ? response.data : []);
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
      <div className="p-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="p-4 max-w-7xl mx-auto">
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