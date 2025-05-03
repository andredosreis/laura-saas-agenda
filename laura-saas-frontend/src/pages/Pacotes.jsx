import{ useEffect,useState  } from "react";
import api from "../services/api";

function Pacotes() {
  const [pacotes, setPacotes] = useState([]);
  useEffect(() => {
    async function fetchPacotes() {
      try {
        const response = await api.get('/pacotes');
        setPacotes(response.data);
      } catch (error) {
        console.error('Erro ao buscar pacotes:', error);
      }
    }

    fetchPacotes();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Lista de Pacotes</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {pacotes.map((pacote) => (
          <div key={pacote._id} className="border rounded-lg p-4 shadow hover:shadow-md transition">
            <h2 className="text-lg font-semibold">{pacote.nome}</h2>
            <p className="text-gray-600">Categoria: {pacote.categoria}</p>
            <p className="text-gray-600">Sessões: {pacote.sessoes}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Pacotes;
