import { useEffect, useState, useMemo } from "react";
import { toast } from 'react-toastify';
import { useNavigate } from "react-router-dom";
import {
  Users, Plus, Search, Phone, Package, Calendar, Edit, Trash2, Loader2
} from 'lucide-react';
import api from "../services/api";
import { useTheme } from '../contexts/ThemeContext';
import ErrorBoundary from "../components/ErrorBoundary";

function Clientes() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [pacotesClientes, setPacotesClientes] = useState({}); // { clienteId: [pacotes] }
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [totalServidor, setTotalServidor] = useState(0); // total no DB (pode ser > clientes.length se houver mais que limit)

  // Estilos condicionais (alinhado com PacotesAtivos / Agendamentos)
  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-white/10'
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const inputClass = isDarkMode
    ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';

  // Lista filtrada e ordenada alfabeticamente (locale-aware, case-insensitive)
  const clientesFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return [...clientes]
      .filter(c =>
        !termo ||
        c.nome?.toLowerCase().includes(termo) ||
        c.telefone?.includes(termo)
      )
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-PT', { sensitivity: 'base' }));
  }, [clientes, busca]);

  const fetchClientes = async () => {
    try {
      setIsLoading(true);
      // limit máximo permitido pelo backend (100). Para volumes maiores precisamos de paginação real.
      const response = await api.get("/clientes?limit=100");
      const clientesData = Array.isArray(response.data?.data) ? response.data.data : [];
      setClientes(clientesData);
      setTotalServidor(response.data?.pagination?.total || clientesData.length);

      if (clientesData.length > 0) {
        const pacotesPromises = clientesData.map(async (cliente) => {
          try {
            const pacotesRes = await api.get(`/compras-pacotes/cliente/${cliente._id}`);
            const pacotesAtivos = (pacotesRes.data || []).filter(
              (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
            );
            return { clienteId: cliente._id, pacotes: pacotesAtivos };
          } catch (error) {
            console.error(`Erro ao buscar pacotes do cliente ${cliente._id}:`, error);
            return { clienteId: cliente._id, pacotes: [] };
          }
        });

        const pacotesResults = await Promise.all(pacotesPromises);
        const pacotesMap = {};
        pacotesResults.forEach(({ clienteId, pacotes }) => {
          pacotesMap[clienteId] = pacotes;
        });
        setPacotesClientes(pacotesMap);
      }
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast.error('Erro ao carregar lista de clientes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja eliminar este cliente?")) return;
    setIsLoading(true);
    await api.delete(`/clientes/${id}`);
    setClientes(clientesAtuais => clientesAtuais.filter(cliente => cliente._id !== id));
    toast.success("Cliente eliminado com sucesso!");
    setIsLoading(false);
  };

  const handleEdit = (id) => navigate(`/clientes/editar/${id}`);

  if (isLoading) {
    return (
      <div className={`min-h-screen pt-24 flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className={`mt-3 text-base ${subTextClass}`}>A carregar clientes...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pt-24 pb-8 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <div>
              <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${textClass}`}>
                <Users className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500" />
                Clientes
              </h1>
              <p className={`text-sm mt-1 ${subTextClass}`}>
                {clientesFiltrados.length} {clientesFiltrados.length === 1 ? 'cliente' : 'clientes'}
                {busca && ` para "${busca}"`}
              </p>
            </div>
            <button
              onClick={() => navigate('/criar-cliente')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium shadow-lg shadow-indigo-500/25"
            >
              <Plus className="w-4 h-4" />
              Novo Cliente
            </button>
          </div>

          {/* Aviso: existem mais clientes no servidor do que estão a ser exibidos */}
          {totalServidor > clientes.length && (
            <div className={`mb-4 flex items-center gap-2 p-3 rounded-xl border text-sm ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <span>⚠️ A mostrar {clientes.length} de {totalServidor} clientes. Para encontrar um cliente específico, usa a pesquisa abaixo.</span>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-6">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subTextClass} pointer-events-none`} />
            <input
              type="text"
              placeholder="Pesquisar por nome ou telefone..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all ${inputClass}`}
            />
          </div>

          {/* Lista */}
          {clientes.length === 0 ? (
            <div className={`${cardClass} rounded-2xl p-12 text-center`}>
              <Users className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
              <p className={`text-base ${textClass}`}>Ainda sem clientes registados.</p>
              <p className={`text-sm mt-1 ${subTextClass}`}>Adiciona o primeiro para começar.</p>
              <button
                onClick={() => navigate('/criar-cliente')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white font-medium"
              >
                <Plus className="w-4 h-4" />
                Adicionar Cliente
              </button>
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className={`${cardClass} rounded-2xl p-12 text-center`}>
              <Search className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
              <p className={`text-base ${textClass}`}>Nenhum cliente encontrado para "{busca}".</p>
              <button
                onClick={() => setBusca('')}
                className="mt-3 text-sm text-indigo-500 hover:text-indigo-600 font-medium"
              >
                Limpar pesquisa
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clientesFiltrados.map((cliente) => (
                <ClienteCard
                  key={cliente._id}
                  cliente={cliente}
                  pacotes={pacotesClientes[cliente._id] || []}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  cardClass={cardClass}
                  textClass={textClass}
                  subTextClass={subTextClass}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

const ClienteCard = ({ cliente, pacotes = [], onEdit, onDelete, cardClass, textClass, subTextClass, isDarkMode }) => {
  if (!cliente) return null;

  const totalSessoes = pacotes.reduce((sum, cp) => sum + (cp.sessoesRestantes || 0), 0);
  const primeiroPacote = pacotes[0];
  const inicial = (cliente.nome || '?').charAt(0).toUpperCase();

  return (
    <div className={`${cardClass} rounded-2xl p-5 hover:shadow-lg transition-all`}>
      {/* Header com avatar inicial + nome */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center font-bold text-lg ${
          isDarkMode
            ? 'bg-linear-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300'
            : 'bg-linear-to-br from-indigo-50 to-purple-50 border border-indigo-200 text-indigo-600'
        }`}>
          {inicial}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className={`font-semibold truncate ${textClass}`} title={cliente.nome}>
            {cliente.nome || 'Nome não informado'}
          </h2>
          <p className={`text-xs flex items-center gap-1 mt-0.5 ${subTextClass}`}>
            <Phone className="w-3 h-3" />
            {cliente.telefone || 'Sem telefone'}
          </p>
        </div>
      </div>

      {/* Info de pacotes/sessões */}
      <div className="space-y-2 mb-4">
        <div className={`flex items-center gap-2 text-sm ${subTextClass}`}>
          <Package className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {primeiroPacote?.pacote?.nome || 'Sem pacote ativo'}
            {pacotes.length > 1 && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 font-medium">
                +{pacotes.length - 1}
              </span>
            )}
          </span>
        </div>
        <div className={`flex items-center gap-2 text-sm ${subTextClass}`}>
          <Calendar className="w-4 h-4 shrink-0" />
          <span>
            {totalSessoes > 0
              ? <><strong className={textClass}>{totalSessoes}</strong> {totalSessoes === 1 ? 'sessão restante' : 'sessões restantes'}</>
              : 'Sem sessões disponíveis'}
          </span>
        </div>
      </div>

      {/* Acções */}
      <div className="flex gap-2">
        <button
          onClick={() => onEdit(cliente._id)}
          aria-label={`Editar cliente ${cliente.nome || ''}`}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl ${
            isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'
          } transition-colors text-sm font-medium`}
        >
          <Edit className="w-4 h-4 text-indigo-500" />
          <span className={textClass}>Editar</span>
        </button>
        <button
          onClick={() => onDelete(cliente._id)}
          aria-label={`Eliminar cliente ${cliente.nome || ''}`}
          className={`p-2 rounded-xl ${
            isDarkMode ? 'hover:bg-red-500/10' : 'hover:bg-red-50'
          } transition-colors`}
          title="Eliminar"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>
    </div>
  );
};

export default Clientes;
