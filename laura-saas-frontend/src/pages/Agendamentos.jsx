import { useEffect, useState } from "react";
import api from "../services/api";

function Agendamentos() {
  const [agendamentos, setAgendamentos] = useState([]);

  useEffect(() => {
    async function fetchAgendamentos() {
      try {
        const response = await api.get("/agendamentos");
        setAgendamentos(response.data);
      } catch (error) {
        console.error("Erro ao buscar agendamentos:", error);
      }
    }

    fetchAgendamentos();
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Lista de Agendamentos</h1>

      {agendamentos.length === 0 ? (
        <p>Nenhum agendamento encontrado.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agendamentos.map((ag) => (
            <li
              key={ag._id}
              className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
            >
              <h2 className="text-lg font-semibold text-blue-600">
                Cliente: {ag.cliente?.nome || "Não identificado"}
              </h2>
              <p className="text-gray-700">
                Pacote: {ag.pacote?.nome || "Não definido"}
              </p>
              <p className="text-gray-700">
                Data:{" "}
                {new Date(ag.dataHora).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}{" "}
                às{" "}
                {new Date(ag.dataHora).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="text-gray-700">Status: {ag.status}</p>
              <p className="text-gray-600 italic">{ag.observacoes}</p>

              <div className="mt-4 flex gap-2">
                <button className="px-3 py-1 rounded bg-yellow-400 hover:bg-yellow-500 text-white text-sm">
                  Editar
                </button>
                <button className="px-3 py-1 rounded bg-red-500 hover:bg-red-600 text-white text-sm">
                  Deletar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Agendamentos;
