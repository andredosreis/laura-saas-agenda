import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // Para navegação
import api from "../services/api";
import { toast } from "react-toastify"; // Para feedback

// Subcomponente para o Card de cada Pacote
const PacoteCard = ({ pacote, onEdit, onDelete }) => {
  // Função para formatar o valor como moeda
  // Ajusta a localidade e moeda conforme a tua necessidade (ex: 'pt-PT', 'EUR' ou 'pt-BR', 'BRL')
  const formatCurrency = (value) => {
    if (typeof value !== 'number') {
      // Tenta converter para número se for string e parecer um número
      const numValue = parseFloat(value);
      if (isNaN(numValue)) {
        return 'N/A';
      }
      return numValue.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
    }
    return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300 ease-in-out flex flex-col justify-between">
      <div>
        <h2 className="text-xl font-semibold text-amber-600 mb-2 truncate" title={pacote.nome}>{pacote.nome}</h2> {/* Dourado mais escuro para o título do card */}
        <p className="text-gray-600 text-sm mb-1">
          <span className="font-medium">Categoria:</span> {pacote.categoria || "Não informada"}
        </p>
        <p className="text-gray-600 text-sm mb-1">
          <span className="font-medium">Sessões:</span> {pacote.sessoes !== undefined ? pacote.sessoes : "N/A"}
        </p>
        <p className="text-gray-800 text-lg font-bold mb-3">
          {formatCurrency(pacote.valor)} {/* Assumindo que tens um campo 'valor' */}
        </p>
        {pacote.descricao && (
          <p className="text-gray-500 text-xs mb-3 italic max-h-20 overflow-y-auto"> {/* Limita altura da descrição */}
            {pacote.descricao}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-3"> {/* Ajuste para responsividade dos botões */}
        <button
          onClick={() => onEdit(pacote._id)}
          className="flex-1 bg-gray-700 hover:bg-black text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors duration-150 ease-in-out text-sm"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(pacote._id)}
          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg shadow-md transition-colors duration-150 ease-in-out text-sm"
        >
          Deletar
        </button>
      </div>
    </div>
  );
};

function Pacotes() {
  const [pacotes, setPacotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchPacotes() {
      setIsLoading(true);
      try {
        const response = await api.get("/pacotes");
        setPacotes(response.data || []); // Garante que pacotes seja sempre um array
      } catch (error) {
        console.error("Erro ao buscar pacotes:", error);
        toast.error("Não foi possível carregar os pacotes. Tente novamente mais tarde.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchPacotes();
  }, []);

  const handleNavigateToCriarPacote = () => {
    navigate("/criar-pacote"); // Certifica-te que esta rota existe no teu App.jsx
  };

  const handleEditPacote = (id) => {
    // Navega para a página de edição do pacote
    // Certifica-te que esta rota existe no teu App.jsx
    navigate(`/pacotes/editar/${id}`);
  };

  const handleDeletePacote = (id) => {
    // Adicionar confirmação antes de deletar
    if (window.confirm("Tem a certeza que deseja deletar este pacote? Esta ação não pode ser desfeita.")) {
      // Lógica de deleção da API (vamos implementar depois)
      // Exemplo:
      // api.delete(`/pacotes/${id}`)
      //   .then(() => {
      //     toast.success("Pacote deletado com sucesso!");
      //     setPacotes(prevPacotes => prevPacotes.filter(p => p._id !== id));
      //   })
      //   .catch(err => {
      //     console.error("Erro ao deletar pacote:", err);
      //     toast.error(err.response?.data?.message || "Erro ao deletar pacote.");
      //   });
      toast.warn(`Deleção do pacote com ID: ${id} (lógica da API a implementar).`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div> {/* Cor do spinner dourada */}
        <p className="ml-3 mt-3 text-gray-700 text-lg">A carregar pacotes...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-gray-800">Gestão de Pacotes</h1>
        <button
          onClick={handleNavigateToCriarPacote}
          className="bg-amber-500 hover:bg-amber-600 text-black font-semibold py-2 px-6 rounded-lg shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-opacity-75 transition-all duration-150 ease-in-out"
        >
          Novo Pacote
        </button>
      </div>

      {pacotes.length === 0 && !isLoading ? ( // Só mostra se não estiver a carregar e a lista estiver vazia
        <div className="text-center py-10 bg-white rounded-lg shadow-md">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-2 text-xl font-medium text-gray-700">Nenhum pacote encontrado</h3>
          <p className="mt-1 text-sm text-gray-500">Clica em "Novo Pacote" para começar a adicionar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {pacotes.map((pacote) => (
            <PacoteCard
              key={pacote._id}
              pacote={pacote}
              onEdit={handleEditPacote}
              onDelete={handleDeletePacote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default Pacotes;