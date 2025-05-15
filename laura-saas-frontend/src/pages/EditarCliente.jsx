import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';

function EditarCliente() {
  const { id } = useParams(); // Pegamos o id da URL
  const navigate = useNavigate(); // Para redirecionar depois da edição

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    dataNascimento: '', // Input type="date" espera 'YYYY-MM-DD'
    pacote: '', // Deve ser o _id do pacote
    sessoesRestantes: 0 // Começar com 0 ou o valor atual
  });

  const [pacotes, setPacotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true); // Estado para o loading inicial dos dados
  const [isSubmitting, setIsSubmitting] = useState(false); // Estado para o submit do formulário
  const [fieldErrors, setFieldErrors] = useState({}); // Estado para erros específicos dos campos

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true); // Inicia o loading
      setFieldErrors({}); // Limpa erros de tentativas anteriores
      try {
        // Buscar dados do cliente
        const clienteRes = await api.get(`/clientes/${id}`);
        const clienteData = clienteRes.data;

        setFormData({
          nome: clienteData.nome || '',
          telefone: clienteData.telefone || '',
          // Garante que dataNascimento é formatado corretamente se existir
          dataNascimento: clienteData.dataNascimento ? clienteData.dataNascimento.substring(0, 10) : '',
          pacote: clienteData.pacote?._id || '', // Pega o _id do pacote, se existir
          sessoesRestantes: clienteData.sessoesRestantes !== undefined ? clienteData.sessoesRestantes : 0
        });

        // Buscar pacotes disponíveis
        const pacotesRes = await api.get('/pacotes');
        setPacotes(pacotesRes.data);

      } catch (err) {
        console.error('Erro ao carregar dados do cliente:', err);
        toast.error('Erro ao carregar dados do cliente.');
        // Se o cliente não for encontrado, pode ser útil redirecionar ou mostrar mensagem específica
        if (err.response && err.response.status === 404) {
            toast.error('Cliente não encontrado.');
            navigate('/clientes'); // Exemplo: Volta para a lista
        }
      } finally {
        setIsLoading(false); // Termina o loading
      }
    }

    if (id) { // Só busca se tiver um ID
      fetchData();
    }
  }, [id, navigate]);

  // Handler genérico para a maioria dos inputs
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevFormData => ({
      ...prevFormData,
      [name]: value
    }));
    // Limpa o erro do campo específico ao ser alterado
    if (fieldErrors[name]) {
      setFieldErrors(prevErrors => ({
        ...prevErrors,
        [name]: null
      }));
    }
  };
  
  // Handler para a submissão do formulário de edição
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validações no frontend (podes adicionar as mesmas do CriarCliente aqui)
    // Ex: if (!formData.nome) { setFieldErrors(prev => ({...prev, nome: "Nome é obrigatório"})); return; }

    setIsSubmitting(true);
    setFieldErrors({}); // Limpa erros anteriores

    try {
      // Usar o 'id' da URL para a rota PUT
      await api.put(`/clientes/${id}`, formData);
      toast.success('Cliente atualizado com sucesso!');
      navigate('/clientes'); // Redireciona para a lista de clientes após sucesso

    } catch (error) {
      console.error('Erro ao atualizar cliente:', error.response);

      if (error.response && error.response.data) {
        const errorData = error.response.data;
        if (errorData.details && Array.isArray(errorData.details)) {
          const newFieldErrors = {};
          errorData.details.forEach(detail => {
            newFieldErrors[detail.field] = detail.message;
          });
          setFieldErrors(newFieldErrors);
          toast.error(errorData.message || 'Alguns campos contêm erros.');
        } else if (errorData.message) {
          toast.error(errorData.message);
        } else {
          toast.error('Erro ao atualizar cliente. Dados inválidos.');
        }
      } else {
        toast.error('Não foi possível conectar ao servidor. Verifique sua conexão.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>A carregar dados do cliente...</p> {/* Ou um spinner */}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold mb-6 text-center">Editar Cliente</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Nome */}
        <div>
          <label htmlFor="nome" className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            name="nome"
            id="nome"
            value={formData.nome}
            onChange={handleChange}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 ${fieldErrors.nome ? 'border-red-500' : 'border-gray-300'}`}
            // required // A validação JS é mais flexível
          />
          {fieldErrors.nome && <p className="mt-1 text-sm text-red-500">{fieldErrors.nome}</p>}
        </div>

        {/* Telefone */}
        <div>
          <label htmlFor="telefone" className="block text-sm font-medium text-gray-700">Telefone</label>
          <input
            type="tel" // type="tel" é mais semântico para telefone
            name="telefone"
            id="telefone"
            value={formData.telefone}
            onChange={handleChange} // Usando o handleChange genérico
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 ${fieldErrors.telefone ? 'border-red-500' : 'border-gray-300'}`}
          />
          {fieldErrors.telefone && <p className="mt-1 text-sm text-red-500">{fieldErrors.telefone}</p>}
        </div>

        {/* Data de nascimento */}
        <div>
          <label htmlFor="dataNascimento" className="block text-sm font-medium text-gray-700">Data de Nascimento</label>
          <input
            type="date"
            name="dataNascimento"
            id="dataNascimento"
            value={formData.dataNascimento}
            onChange={handleChange}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 ${fieldErrors.dataNascimento ? 'border-red-500' : 'border-gray-300'}`}
          />
          {fieldErrors.dataNascimento && <p className="mt-1 text-sm text-red-500">{fieldErrors.dataNascimento}</p>}
        </div>

        {/* Pacote */}
        <div>
          <label htmlFor="pacote" className="block text-sm font-medium text-gray-700">Pacote</label>
          <select
            name="pacote"
            id="pacote"
            value={formData.pacote} // Deve ser o _id do pacote
            onChange={handleChange}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 ${fieldErrors.pacote ? 'border-red-500' : 'border-gray-300'}`}
          >
            <option value="">Selecione um pacote (ou Nenhum)</option>
            {pacotes.map((pacote) => (
              <option key={pacote._id} value={pacote._id}>
                {pacote.nome}
              </option>
            ))}
          </select>
          {fieldErrors.pacote && <p className="mt-1 text-sm text-red-500">{fieldErrors.pacote}</p>}
        </div>

        {/* Sessões restantes */}
        <div>
          <label htmlFor="sessoesRestantes" className="block text-sm font-medium text-gray-700">Sessões Restantes</label>
          <input
            type="number"
            name="sessoesRestantes"
            id="sessoesRestantes"
            min="0"
            value={formData.sessoesRestantes}
            onChange={handleChange}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200 ${fieldErrors.sessoesRestantes ? 'border-red-500' : 'border-gray-300'}`}
          />
          {fieldErrors.sessoesRestantes && <p className="mt-1 text-sm text-red-500">{fieldErrors.sessoesRestantes}</p>}
        </div>

        {/* Botão */}
        <button
          type="submit"
          disabled={isSubmitting || isLoading} // Desabilita também durante o loading inicial
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition disabled:bg-gray-400"
        >
          {isSubmitting ? 'A guardar...' : 'Salvar Alterações'}
        </button>
      </form>
    </div>
  );
}

export default EditarCliente;