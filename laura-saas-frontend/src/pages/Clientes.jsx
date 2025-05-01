import { useEffect, useState } from "react";
import api from '../services/api';
function Clientes() {
  const [clientes, setClientes] = useState([]);
  
  useEffect(() => {
    async function fetchClientes() {
      try {
        const response = await api.get('/clientes');
        setClientes(response.data);
      } catch (error) {
        console.error('Erro ao buscar clientes:', error);
      }
    }

    fetchClientes();
    },[]);
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Lista de Clientes</h1>

      {clientes.length === 0 ? (
        <p>Nenhum cliente encontrado.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {clientes.map((cliente) => (
            <li key={cliente._id} className="p-4 bg-gray-100 border border-gray-300 rounded-lg shadow-sm">
              <h2 className="text-lg font-semibold text-gray-800 ">{cliente.nome}</h2>
              <p className="text-gray-600">📞 {cliente.telefone}</p>
              <p className="text-gray-600">
              💆 Pacote: {cliente.pacote ? cliente.pacote.nome : 'Nenhum pacote contratado'} 
              </p>
              <p className="text-gray-600">
              📅 Sessões restantes: {cliente.sessoesRestantes ?? 'N/A'}
            </p>
                    

            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Clientes;
