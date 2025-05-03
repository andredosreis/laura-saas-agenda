import { useState, useEffect } from 'react';
import api from '../services/api';

function CriarCliente() {
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    dataNascimento: '',
    pacote: '',
    sessoesRestantes: ''
  });

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
<div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">

      <h1 className="text-2xl font-bold mb-4">Cadastrar Novo Cliente</h1>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post('/clientes', formData);
            alert('Cliente criado com sucesso!');
            setFormData({
              nome: '',
              telefone: '',
              dataNascimento: '',
              pacote: '',
              sessoesRestantes: ''
            });
          } catch (err) {
            console.error('Erro ao criar cliente:', err);
            alert('Erro ao cadastrar cliente.');
          }
        }}
        className="space-y-4"
      >
        {/* Campo Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            name="nome"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            required
          />
        </div>
        
     
        {/* Campo Telefone */}
        <div>
  <label className="block text-sm font-medium text-gray-700">
    Telefone
  </label>
  <input
    type="tel"
    name="telefone"
    value={formData.telefone}
    onChange={(e) =>
      setFormData({ ...formData, telefone: e.target.value })
    }
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  />
</div>
        {/* Campo Data de Nascimento */}
        <div>
  <label className="block text-sm font-medium text-gray-700">
    Data de Nascimento
  </label>
  <input
    type="date"
    name="dataNascimento"
    value={formData.dataNascimento}
    onChange={(e) =>
      setFormData({ ...formData, dataNascimento: e.target.value })
    }
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  />
</div>
<div>
  <label className="block text-sm font-medium text-gray-700">
    Pacote
  </label>
  <select
    name="pacote"
    value={formData.pacote}
    onChange={(e) =>
      setFormData({ ...formData, pacote: e.target.value })
    }
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
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
<div>
  <label className="block text-sm font-medium text-gray-700">
    Sessões Restantes
  </label>
  <input
    type="number"
    name="sessoesRestantes"
    value={formData.sessoesRestantes}
    onChange={(e) =>
      setFormData({ ...formData, sessoesRestantes: e.target.value })
    }
    min="1"
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  />
</div>

<button
    type="submit"
    className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
  >
    Cadastrar Cliente
  </button>

      </form>
    </div>
  );
}

export default CriarCliente;
