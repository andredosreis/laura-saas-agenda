import React, { useState, useEffect } from 'react';
import api from '../services/api';

function Agendamentos() {
    const [agendamentos, setAgendamentos] = useState([]);
  
    useEffect(() => {
        console.log('Buscando agendamentos...');
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
    <div>
      <h1>Agendamentos</h1>
      <ul>
        {agendamentos.map(agendamento => (
          <li key={agendamento._id}>
            Cliente: {agendamento.cliente?.nome || 'Sem cliente'} - 
            Pacote: {agendamento.pacote?.nome || 'Sem pacote'} -
            Status: {agendamento.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
export default Agendamentos;