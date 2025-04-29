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

    
    },[]);
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Lista de Clientes</h1>
    </div>
  );
}

export default Clientes;
