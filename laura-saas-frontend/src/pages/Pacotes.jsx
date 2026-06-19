import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Loader2,
  AlertTriangle,
  X,
  Power,
} from "lucide-react";
import api from "../services/api";
import { toast } from "react-toastify";
import { useTheme } from "../contexts/ThemeContext";

const formatCurrency = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return "N/A";
  return num.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
};

const normalizar = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

// Subcomponente: card de cada serviço
const ServicoCard = ({ pacote, onEdit, onToggle, onDelete, isDarkMode, isToggling }) => {
  const cardClass = isDarkMode ? "bg-slate-800/50 border-white/10" : "bg-white border-slate-200";
  const textClass = isDarkMode ? "text-white" : "text-slate-900";
  const subtextClass = isDarkMode ? "text-slate-400" : "text-slate-600";

  return (
    <div className={`rounded-2xl border ${cardClass} p-5 shadow-lg hover:shadow-xl transition-shadow flex flex-col justify-between ${!pacote.ativo ? "opacity-70" : ""}`}>
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h2 className={`text-lg font-semibold ${textClass} truncate`} title={pacote.nome}>
            {pacote.nome}
          </h2>
          <span
            className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
              pacote.ativo
                ? isDarkMode
                  ? "bg-emerald-400/15 text-emerald-300"
                  : "bg-emerald-50 text-emerald-700"
                : isDarkMode
                ? "bg-white/10 text-slate-400"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {pacote.ativo ? "Ativo" : "Inativo"}
          </span>
        </div>

        <p className={`text-sm mb-1 ${subtextClass}`}>
          <span className="font-medium">Categoria:</span> {pacote.categoria || "Não informada"}
        </p>
        <p className={`text-sm mb-1 ${subtextClass}`}>
          <span className="font-medium">Sessões:</span> {pacote.sessoes ?? "N/A"}
        </p>
        <p className={`text-xl font-bold mb-3 ${textClass}`}>{formatCurrency(pacote.valor)}</p>

        {pacote.descricao && (
          <p className={`text-xs mb-1 italic max-h-20 overflow-y-auto ${subtextClass}`}>
            {pacote.descricao}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => onEdit(pacote._id)}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium border ${
            isDarkMode
              ? "border-white/10 text-slate-200 hover:bg-white/10"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          } transition-colors`}
        >
          <Pencil className="w-4 h-4" />
          Editar
        </button>
        <button
          onClick={() => onToggle(pacote)}
          disabled={isToggling}
          title={pacote.ativo ? "Desativar serviço" : "Ativar serviço"}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium border ${
            isDarkMode
              ? "border-white/10 text-slate-200 hover:bg-white/10"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          } transition-colors disabled:opacity-50`}
        >
          {isToggling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
          {pacote.ativo ? "Desativar" : "Ativar"}
        </button>
        <button
          onClick={() => onDelete(pacote)}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Eliminar
        </button>
      </div>
    </div>
  );
};

function Pacotes() {
  const [pacotes, setPacotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | ativos | inativos
  const [togglingId, setTogglingId] = useState(null);
  const [confirmar, setConfirmar] = useState(null); // pacote a eliminar
  const [eliminando, setEliminando] = useState(false);
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  useEffect(() => {
    async function fetchPacotes() {
      setIsLoading(true);
      try {
        // Paginação completa — segue pagination.pages para trazer todos os serviços.
        const primeira = await api.get("/pacotes", { params: { limit: 100, page: 1 } });
        const lista = primeira.data?.data || [];
        const totalPaginas = primeira.data?.pagination?.pages || 1;

        let todos = lista;
        if (totalPaginas > 1) {
          const outras = await Promise.all(
            Array.from({ length: totalPaginas - 1 }, (_, i) =>
              api.get("/pacotes", { params: { limit: 100, page: i + 2 } })
            )
          );
          todos = [...lista, ...outras.flatMap((res) => res.data?.data || [])];
        }

        setPacotes(
          todos.slice().sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-PT", { sensitivity: "base" }))
        );
      } catch (error) {
        console.error("Erro ao buscar serviços:", error);
        toast.error(error.response?.data?.error || "Não foi possível carregar os serviços.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchPacotes();
  }, []);

  const pacotesFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    return pacotes.filter((p) => {
      if (filtro === "ativos" && !p.ativo) return false;
      if (filtro === "inativos" && p.ativo) return false;
      if (!termo) return true;
      return normalizar(p.nome).includes(termo) || normalizar(p.categoria).includes(termo);
    });
  }, [pacotes, busca, filtro]);

  const handleToggle = async (pacote) => {
    setTogglingId(pacote._id);
    try {
      const res = await api.put(`/pacotes/${pacote._id}`, { ativo: !pacote.ativo });
      const atualizado = res.data?.data ?? { ...pacote, ativo: !pacote.ativo };
      setPacotes((prev) => prev.map((p) => (p._id === pacote._id ? { ...p, ...atualizado } : p)));
      toast.success(atualizado.ativo ? "Serviço ativado." : "Serviço desativado.");
    } catch (err) {
      console.error("Erro ao alterar estado do serviço:", err);
      toast.error(err.response?.data?.error || "Erro ao alterar o estado do serviço.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmarEliminar = async () => {
    if (!confirmar) return;
    setEliminando(true);
    try {
      await api.delete(`/pacotes/${confirmar._id}`);
      setPacotes((prev) => prev.filter((p) => p._id !== confirmar._id));
      toast.success("Serviço eliminado com sucesso.");
      setConfirmar(null);
    } catch (err) {
      console.error("Erro ao eliminar serviço:", err);
      toast.error(err.response?.data?.error || "Erro ao eliminar o serviço.");
    } finally {
      setEliminando(false);
    }
  };

  const pageBg = isDarkMode ? "bg-slate-900" : "bg-slate-50";
  const textClass = isDarkMode ? "text-white" : "text-slate-900";
  const subtextClass = isDarkMode ? "text-slate-400" : "text-slate-600";
  const inputBg = isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-slate-200";

  const filtros = [
    { key: "todos", label: "Todos" },
    { key: "ativos", label: "Ativos" },
    { key: "inativos", label: "Inativos" },
  ];

  return (
    <div className={`min-h-screen pt-20 pb-8 px-4 ${pageBg}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className={`text-2xl sm:text-3xl font-bold ${textClass}`}>Serviços</h1>
            <p className={`text-sm ${subtextClass}`}>Faz a gestão dos serviços e pacotes do teu salão.</p>
          </div>
          <button
            onClick={() => navigate("/criar-pacote")}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all"
          >
            <Plus className="w-5 h-5" />
            Novo Serviço
          </button>
        </div>

        {/* Toolbar: busca + filtro */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subtextClass}`} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por nome ou categoria"
              className={`w-full pl-9 pr-3 py-2.5 rounded-xl border ${inputBg} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
            />
          </div>
          <div className={`grid grid-cols-3 gap-1 p-1 rounded-xl ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`}>
            {filtros.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFiltro(key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filtro === key
                    ? "bg-linear-to-r from-indigo-500 to-purple-600 text-white shadow"
                    : subtextClass
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className={`mt-3 ${subtextClass}`}>A carregar serviços...</p>
          </div>
        ) : pacotes.length === 0 ? (
          <div className={`text-center py-16 rounded-2xl border ${isDarkMode ? "border-white/10 bg-slate-800/50" : "border-slate-200 bg-white"}`}>
            <Package className={`mx-auto h-12 w-12 ${subtextClass}`} />
            <h3 className={`mt-3 text-lg font-medium ${textClass}`}>Nenhum serviço criado</h3>
            <p className={`mt-1 text-sm ${subtextClass}`}>Clica em "Novo Serviço" para começar.</p>
          </div>
        ) : pacotesFiltrados.length === 0 ? (
          <div className={`text-center py-16 rounded-2xl border ${isDarkMode ? "border-white/10 bg-slate-800/50" : "border-slate-200 bg-white"}`}>
            <Search className={`mx-auto h-10 w-10 ${subtextClass}`} />
            <p className={`mt-3 text-sm ${subtextClass}`}>Nenhum serviço corresponde à procura.</p>
          </div>
        ) : (
          <>
            <p className={`text-sm mb-3 ${subtextClass}`}>
              {pacotesFiltrados.length} {pacotesFiltrados.length === 1 ? "serviço" : "serviços"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {pacotesFiltrados.map((pacote) => (
                <ServicoCard
                  key={pacote._id}
                  pacote={pacote}
                  onEdit={(id) => navigate(`/pacotes/editar/${id}`)}
                  onToggle={handleToggle}
                  onDelete={(p) => setConfirmar(p)}
                  isDarkMode={isDarkMode}
                  isToggling={togglingId === pacote._id}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal de confirmação de eliminação */}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !eliminando && setConfirmar(null)} />
          <div className={`relative w-full max-w-sm rounded-2xl border shadow-2xl ${isDarkMode ? "bg-slate-800 border-white/10" : "bg-white border-slate-200"}`}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/15 text-red-500 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div className="flex-1">
                  <h3 className={`text-base font-semibold ${textClass}`}>Eliminar serviço</h3>
                  <p className={`mt-1 text-sm ${subtextClass}`}>
                    Tens a certeza que queres eliminar <span className={`font-medium ${textClass}`}>{confirmar.nome}</span>? Esta ação não pode ser desfeita.
                  </p>
                </div>
                <button
                  onClick={() => !eliminando && setConfirmar(null)}
                  className={`p-1.5 rounded-lg ${isDarkMode ? "hover:bg-white/10" : "hover:bg-slate-100"} ${subtextClass}`}
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setConfirmar(null)}
                  disabled={eliminando}
                  className={`flex-1 py-2.5 rounded-xl border font-medium ${isDarkMode ? "border-white/10 text-slate-200 hover:bg-white/10" : "border-slate-200 text-slate-700 hover:bg-slate-50"} transition-colors disabled:opacity-50`}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarEliminar}
                  disabled={eliminando}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50"
                >
                  {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Pacotes;
