import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

function EditarCliente() {
  const { id } = useParams(); // pegamos o id da URL
  const navigate = useNavigate(); // para redirecionar depois da edição

  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    dataNascimento: '',
    pacote: '',
    sessoesRestantes: ''
  });

  const [pacotes, setPacotes] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        // Buscar dados do cliente
        const clienteRes = await api.get(`/clientes/${id}`);
        setFormData({
          nome: clienteRes.data.nome,
          telefone: clienteRes.data.telefone,
          dataNascimento: clienteRes.data.dataNascimento.substring(0, 10), // formato yyyy-mm-dd
          pacote: clienteRes.data.pacote?._id || '',
          sessoesRestantes: clienteRes.data.sessoesRestantes
        });
  
        // Buscar pacotes disponíveis
        const pacotesRes = await api.get('/pacotes');
        setPacotes(pacotesRes.data);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
        alert('Erro ao buscar dados do cliente.');
      }
    }
  
    fetchData();
  }, [id]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/clientes/${id}`, formData);
      alert('Cliente atualizado com sucesso!');
      navigate('/clientes'); // Redireciona para a lista de clientes após sucesso
    } catch (err) {
      console.error('Erro ao atualizar cliente:', err);
      alert('Erro ao atualizar cliente.');
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white shadow-md rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Editar Cliente</h1>
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            className="w-full border p-2 rounded shadow-sm"
            required
          />
        </div>
  
        {/* Telefone */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Telefone</label>
          <input
            type="tel"
            value={formData.telefone}
            onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
            className="w-full border p-2 rounded shadow-sm"
            required
          />
        </div>
  
        {/* Data de nascimento */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Data de Nascimento</label>
          <input
            type="date"
            value={formData.dataNascimento}
            onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
            className="w-full border p-2 rounded shadow-sm"
            required
          />
        </div>
  
        {/* Pacote */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Pacote</label>
          <select
            value={formData.pacote}
            onChange={(e) => setFormData({ ...formData, pacote: e.target.value })}
            className="w-full border p-2 rounded shadow-sm"
            required
          >
            <option value="">Selecione um pacote</option>
            {pacotes.map((pacote) => (
              <option key={pacote._id} value={pacote._id}>
                {pacote.nome}
              </option>
            ))}
          </select>
        </div>
  
        {/* Sessões restantes */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Sessões Restantes</label>
          <input
            type="number"
            min={0}
            value={formData.sessoesRestantes}
            onChange={(e) => setFormData({ ...formData, sessoesRestantes: e.target.value })}
            className="w-full border p-2 rounded shadow-sm"
            required
          />
        </div>
  
        {/* Botão */}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
        >
          Salvar Alterações
        </button>
      </form>
    </div>
  );
  
}

export default EditarCliente;
