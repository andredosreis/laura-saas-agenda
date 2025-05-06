import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";

function Clientes() {
  const [clientes, setClientes] = useState([]);
  const navigate = useNavigate();

  // Buscar todos os clientes
  useEffect(() => {
    async function fetchClientes() {
      try {
        const response = await api.get("/clientes");
        setClientes(response.data);
      } catch (error) {
        console.error("Erro ao buscar clientes:", error);
      }
    }

    fetchClientes();
  }, []);

  // Deletar cliente
  const handleDelete = async (id) => {
    if (!confirm("Tem certeza que deseja deletar este cliente?")) return;

    try {
      await api.delete(`/clientes/${id}`);
      setClientes((clientesAtuais) =>
        clientesAtuais.filter((cliente) => cliente._id !== id)
      );
      alert("Cliente deletado com sucesso!");
    } catch (error) {
      console.error("Erro ao deletar cliente:", error);
      alert("Erro ao deletar cliente.");
    }
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Lista de Clientes</h1>

      {clientes.length === 0 ? (
        <p className="text-gray-600">Nenhum cliente encontrado.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clientes.map((cliente) => (
            <div
              key={cliente._id}
              className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition duration-300"
            >
              <h2 className="text-lg font-semibold text-gray-800">
                {cliente.nome}
              </h2>
              <p className="text-gray-600">📞 {cliente.telefone}</p>
              <p className="text-gray-600">
                💆 Pacote:{" "}
                {cliente.pacote ? cliente.pacote.nome : "Nenhum pacote"}
              </p>
              <p className="text-gray-600">
                📅 Sessões restantes: {cliente.sessoesRestantes ?? "N/A"}
              </p>

              {/* Ações */}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => navigate(`/editar-cliente/${cliente._id}`)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                >
                  Editar
                </button>

                <button
                  onClick={() => handleDelete(cliente._id)}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                >
                  Deletar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Clientes;
