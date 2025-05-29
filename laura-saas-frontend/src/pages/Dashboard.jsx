import React from 'react';
import { useState, useEffect } from 'react';
import api from '../services/api';
import {toast} from 'react-toastify';
// Importando o CSS do Tailwind
// (Podemos criar subcomponentes para cada card/widget depois para organizar melhor)
function Dashboard() {
  return (
    <div className="text-center">
      <h1 className="text-5xl text-blue-600 font-bold mb-4">
        Bem-vindo ao Dashboard
      </h1>
      <p className="text-lg text-gray-600">Vamos começar a construir o sistema da Laura!</p>
    </div>
  );

  // Aqui podemos adicionar os cards/widgets do dashboard
  const navative = useNavigate();
  //Estado para armazenar os dados do dashboard
  cosnt [agendamento, setAgendamentos] = useState([]);
  cosnt [contagemAmanha, setContagemAmanha] = useState(0);
  const [concluidosSemana, setConcluidosSemana] = useState(0);
  const [alertaSessoes, setAlertaSessoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  //vamos fazer o fetch dos dados do dashboard

}

export default Dashboard;
