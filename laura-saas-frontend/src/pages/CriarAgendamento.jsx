import { useState, useEffect } from 'react';
import api from '../services/api';

function CriarAgendamento() {
  const [formData, setFormData] = useState({
    cliente: '',
    pacote: '',
    dataHora: '',
    observacoes: ''
  });

  const [clientes, setClientes] = useState([]);
  const [pacotes, setPacotes] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [clientesRes, pacotesRes] = await Promise.all([
          api.get('/clientes'),
          api.get('/pacotes')
        ]);
        setClientes(clientesRes.data);
        setPacotes(pacotesRes.data);
      } catch (err) {
        console.error('Erro ao carregar dados:', err);
      }
    }

    fetchData();
  }, []);

  // Formulário virá aqui
  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Novo Agendamento</h1>
      {/* Formulário será renderizado aqui */}
        <form
            onSubmit={async (e) => {
            e.preventDefault();
            try {
                await api.post('/agendamentos', formData);
                alert('Agendamento criado com sucesso!');
                setFormData({
                cliente: '',
                pacote: '',
                dataHora: '',
                observacoes: ''
                });
            } catch (err) {
                console.error('Erro ao criar agendamento:', err);
                alert('Erro ao cadastrar agendamento.');
            }
            }}
            className="space-y-4"
        >
            {/* Campo Cliente */}
            <div>
  <label className="block text-sm font-medium text-gray-700">
    Cliente
  </label>
  <select
    name="cliente"
    value={formData.cliente}
    onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  >
    <option value="">Selecione um cliente</option>
    {clientes.map((cliente) => (
      <option key={cliente._id} value={cliente._id}>
        {cliente.nome}
      </option>
    ))}
  </select>
</div>
            {/* Campo Pacote */}
            <div>
  <label className="block text-sm font-medium text-gray-700">
    Cliente
  </label>
  <select
    name="cliente"
    value={formData.cliente}
    onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  >
    <option value="">Selecione um cliente</option>
    {clientes.map((cliente) => (
      <option key={cliente._id} value={cliente._id}>
        {cliente.nome}
      </option>
    ))}
  </select>
</div>
            {/* Campo Pacote */}
            <div>
  <label className="block text-sm font-medium text-gray-700">
    Pacote
  </label>
  <select
    name="pacote"
    value={formData.pacote}
    onChange={(e) => setFormData({ ...formData, pacote: e.target.value })}
    className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  >
    <option value="">Selecione um pacote</option>
    {pacotes.map((pacote) => (
      <option key={pacote._id} value={pacote._id}>
        {pacote.nome} - {pacote.categoria} 
        </option>
    ))}
  </select>
</div>
            {/* Campo Data e Hora */}
            <div>
    <label className="block text-sm font-medium text-gray-700">
        Data e Hora
    </label>
    <input
        type="datetime-local"
        name="dataHora"
        value={formData.dataHora}
        onChange={(e) => setFormData({ ...formData, dataHora: e.target.value })}
        className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
    required
  />
</div>
            {/* Campo Observações */}
            <div>
  <label className="block text-sm font-medium text-gray-700">
    Observações
  </label>
    <textarea
        name="observacoes"
        value={formData.observacoes}
        onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
        className="mt-1 block w-full rounded border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-200"
        rows={3}
        placeholder="Ex: Cliente quer massagem com pressão leve."
      ></textarea>
    </div>
    <button
        type="submit"
         className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded hover:bg-blue-700 transition-colors"
    >
        Criar Agendamento
    </button>


        </form>
    </div>
  );
}

export default CriarAgendamento;
