import { useState, useEffect } from 'react';
import api from '../services/api';
import { toast } from 'react-toastify';

function CriarCliente() {
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    dataNascimento: '',
    pacote: '',
    sessoesRestantes: '',
    observacoes: ''
  });

  const [errors, setErrors] = useState({});
  const [pacotes, setPacotes] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPacotes();
  }, []);

  async function fetchPacotes() {
    try {
      const response = await api.get('/pacotes');
      setPacotes(response.data);
    } catch (error) {
      toast.error('Erro ao carregar pacotes');
      console.error('Erro ao buscar pacotes:', error);
    }
  }

  // Formatação do telefone enquanto digita
  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    }
    return value;
  };

  const validateForm = () => {
    const newErrors = {};

    // Nome
    if (!formData.nome.trim()) {
      newErrors.nome = 'Nome é obrigatório';
    } else if (formData.nome.trim().length < 3) {
      newErrors.nome = 'Nome deve ter no mínimo 3 caracteres';
    }

    // Telefone
    const phoneNumbers = formData.telefone.replace(/\D/g, '');
    if (!phoneNumbers) {
      newErrors.telefone = 'Telefone é obrigatório';
    } else if (phoneNumbers.length < 9 || phoneNumbers.length > 15) {
      newErrors.telefone = 'Telefone deve ter entre 9 e 15 dígitos';
    }

    // Data de Nascimento
    if (!formData.dataNascimento) {
      newErrors.dataNascimento = 'Data de nascimento é obrigatória';
    } else {
      const hoje = new Date();
      const nascimento = new Date(formData.dataNascimento);
      let idade = hoje.getFullYear() - nascimento.getFullYear();
      const mesAtual = hoje.getMonth() - nascimento.getMonth();
      
      if (mesAtual < 0 || (mesAtual === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
      }

      if (idade < 16) {
        newErrors.dataNascimento = 'Cliente deve ter no mínimo 16 anos';
      }
    }

    // Pacote
    if (!formData.pacote) {
      newErrors.pacote = 'Selecione um pacote';
    }

    // Sessões Restantes
    const sessoes = parseInt(formData.sessoesRestantes);
    if (isNaN(sessoes) || sessoes < 0) {
      newErrors.sessoesRestantes = 'Número de sessões deve ser maior ou igual a 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Por favor, corrija os erros no formulário');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepara os dados no formato correto para o backend
      const dadosParaEnviar = {
        nome: formData.nome.trim(),
        telefone: formData.telefone.replace(/[^\d]/g, ''),
        dataNascimento: formData.dataNascimento,
        pacote: formData.pacote,
        sessoesRestantes: parseInt(formData.sessoesRestantes),
        observacoes: formData.observacoes?.trim() || ''
      };

      // Para debug - remova depois
      console.log('Dados enviados:', dadosParaEnviar);

      const response = await api.post('/clientes', dadosParaEnviar);
      
      toast.success('Cliente cadastrado com sucesso!');
      setFormData({
        nome: '',
        telefone: '',
        dataNascimento: '',
        pacote: '',
        sessoesRestantes: '',
        observacoes: ''
      });
      setErrors({});
    } catch (error) {
      console.error('Erro completo:', error);
      const mensagemErro = error.response?.data?.message || 'Erro ao cadastrar cliente';
      toast.error(mensagemErro);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-300 shadow-lg rounded-lg">
      <h1 className="text-2xl font-bold mb-4">Cadastrar Novo Cliente</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Campo Nome */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            value={formData.nome}
            onChange={(e) => {
              setFormData({ ...formData, nome: e.target.value });
              if (errors.nome) setErrors({ ...errors, nome: '' });
            }}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200
              ${errors.nome ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.nome && <p className="mt-1 text-sm text-red-500">{errors.nome}</p>}
        </div>

        {/* Campo Telefone */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Telefone</label>
          <input
            type="text"
            value={formData.telefone}
            onChange={(e) => {
              setFormData({ ...formData, telefone: formatPhone(e.target.value) });
              if (errors.telefone) setErrors({ ...errors, telefone: '' });
            }}
            placeholder="(99) 99999-9999"
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200
              ${errors.telefone ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.telefone && <p className="mt-1 text-sm text-red-500">{errors.telefone}</p>}
        </div>

        {/* Campo Data de Nascimento */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Data de Nascimento
          </label>
          <input
            type="date"
            value={formData.dataNascimento}
            onChange={(e) => {
              setFormData({ ...formData, dataNascimento: e.target.value });
              if (errors.dataNascimento) setErrors({ ...errors, dataNascimento: '' });
            }}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200
              ${errors.dataNascimento ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.dataNascimento && (
            <p className="mt-1 text-sm text-red-500">{errors.dataNascimento}</p>
          )}
        </div>

        {/* Campo Pacote */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Pacote</label>
          <select
            value={formData.pacote}
            onChange={(e) => {
              setFormData({ ...formData, pacote: e.target.value });
              if (errors.pacote) setErrors({ ...errors, pacote: '' });
            }}
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200
              ${errors.pacote ? 'border-red-500' : 'border-gray-300'}`}
          >
            <option value="">Selecione um pacote</option>
            {pacotes.map((pacote) => (
              <option key={pacote._id} value={pacote._id}>
                {pacote.nome}
              </option>
            ))}
          </select>
          {errors.pacote && <p className="mt-1 text-sm text-red-500">{errors.pacote}</p>}
        </div>

        {/* Campo Sessões Restantes */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Sessões Restantes
          </label>
          <input
            type="number"
            value={formData.sessoesRestantes}
            onChange={(e) => {
              setFormData({ ...formData, sessoesRestantes: e.target.value });
              if (errors.sessoesRestantes) setErrors({ ...errors, sessoesRestantes: '' });
            }}
            min="0"
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200
              ${errors.sessoesRestantes ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.sessoesRestantes && (
            <p className="mt-1 text-sm text-red-500">{errors.sessoesRestantes}</p>
          )}
        </div>

        {/* Campo Observações */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Observações
          </label>
          <textarea
            value={formData.observacoes}
            onChange={(e) => {
              setFormData({ ...formData, observacoes: e.target.value });
              if (errors.observacoes) setErrors({ ...errors, observacoes: '' });
            }}
            rows="3"
            className={`mt-1 block w-full rounded border p-2 shadow-sm focus:ring focus:ring-blue-200
              ${errors.observacoes ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.observacoes && (
            <p className="mt-1 text-sm text-red-500">{errors.observacoes}</p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {formData.observacoes?.length || 0}/500 caracteres
          </p>
        </div>

        {/* Botão Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-2 px-4 rounded text-white transition-colors
            ${isSubmitting 
              ? 'bg-blue-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {isSubmitting ? 'Cadastrando...' : 'Cadastrar Cliente'}
        </button>
      </form>
    </div>
  );
}

export default CriarCliente;