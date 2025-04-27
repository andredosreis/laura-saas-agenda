import { useEffect, useState } from 'react';
import api from '../services/api';

function Agendamentos() {
  const [agendamentos, setAgendamentos] = useState([]);

  useEffect(() => {
    async function fetchAgendamentos() {
      try {
        const response = await api.get('/agendamentos');
        setAgendamentos(response.data);
      } catch (error) {
        console.error('Erro ao buscar agendamentos:', error);
      }
    }

    fetchAgendamentos();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Lista de Agendamentos</h1>

      {agendamentos.length === 0 ? (
        <p>Nenhum agendamento encontrado.</p>
      ) : (
        <ul className="space-y-4">
          {agendamentos.map((agendamento) => (
            <li key={agendamento._id} className="bg-white p-4 rounded shadow">
              <p><strong>Cliente:</strong> {agendamento.cliente?.nome || 'Nome não encontrado'}</p>
              <p><strong>Pacote:</strong> {agendamento.pacote?.nome || 'Pacote não encontrado'}</p>
              <p><strong>Data:</strong> {new Date(agendamento.dataHora).toLocaleString()}</p>
              <p><strong>Status:</strong> {agendamento.status}</p>
              <p><strong>Observações:</strong> {agendamento.observacoes || 'Sem observações'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Agendamentos;
