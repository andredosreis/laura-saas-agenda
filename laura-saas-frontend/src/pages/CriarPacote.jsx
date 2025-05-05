import { useState } from 'react';
import api from '../services/api';

function CriarPacote() {
  const [formData, setFormData] = useState({
    nome: '',
    categoria: '',
    sessoes: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post('/pacotes', formData);
      alert('Pacote criado com sucesso!');
      setFormData({
        nome: '',
        categoria: '',
        sessoes: ''
      });
    } catch (error) {
      console.error('Erro ao criar pacote:', error);
      alert('Erro ao criar pacote');
    }
  };

  return (
<div className="max-w-xl mx-auto mt-10 p-6 bg-white text-black border border-gray-300 shadow-lg rounded-lg">

    
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Campo Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome do Pacote</label>
          <input
            type="text"
            name="nome"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            required
          />
        </div>

        {/* Campo Categoria */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Categoria</label>
          <input
            type="text"
            name="categoria"
            value={formData.categoria}
            onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
            className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            required
          />
        </div>

        {/* Campo Sessões */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Número de Sessões</label>
          <input
            type="number"
            name="sessoes"
            min="1"
            value={formData.sessoes}
            onChange={(e) => setFormData({ ...formData, sessoes: e.target.value })}
            className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
            required
          />
        </div>

        {/* Botão */}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
        >
          Cadastrar Pacote
        </button>
      </form>
    </div>
  );
}

export default CriarPacote;
