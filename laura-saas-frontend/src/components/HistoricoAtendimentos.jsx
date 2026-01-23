import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  Calendar,
  Clock,
  User,
  Star,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingUp,
  Activity,
  Plus,
  Edit2,
  Trash2
} from 'lucide-react';
import { DateTime } from 'luxon';
import FinalizarAtendimentoModal from './FinalizarAtendimentoModal';

/**
 * Componente: HistoricoAtendimentos
 *
 * Exibe o histórico completo de atendimentos de um cliente
 * em formato de timeline com cards expansíveis
 */
const HistoricoAtendimentos = ({ clienteId }) => {
  const { isDarkMode } = useTheme();
  const [historicos, setHistoricos] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteNome, setClienteNome] = useState('');
  const [historicoParaEditar, setHistoricoParaEditar] = useState(null);
  const [deletando, setDeletando] = useState(null);

  // Classes de estilo
  const textClass = isDarkMode ? 'text-gray-100' : 'text-gray-800';
  const subTextClass = isDarkMode ? 'text-gray-400' : 'text-gray-600';
  const cardClass = isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const hoverClass = isDarkMode ? 'hover:bg-gray-750' : 'hover:bg-gray-50';

  useEffect(() => {
    if (clienteId) {
      carregarDados();
    }
  }, [clienteId]);

  const carregarDados = async () => {
    try {
      setLoading(true);

      // Buscar histórico e dados do cliente em paralelo
      const [historicoResponse, clienteResponse] = await Promise.all([
        api.get(`/historico-atendimentos/cliente/${clienteId}`),
        api.get(`/clientes/${clienteId}`)
      ]);

      if (historicoResponse.data.success) {
        setHistoricos(historicoResponse.data.data.historicos || []);
        setStats(historicoResponse.data.data.stats || {});
      }

      if (clienteResponse.data) {
        setClienteNome(clienteResponse.data.nome || '');
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar histórico de atendimentos');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpandir = (id) => {
    setExpandido(expandido === id ? null : id);
  };

  const renderEstrelas = (nota) => {
    if (!nota) return null;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i <= nota ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className={`ml-2 text-sm ${subTextClass}`}>({nota}/5)</span>
      </div>
    );
  };

  const formatarData = (data) => {
    return DateTime.fromISO(data).setLocale('pt').toFormat("dd 'de' MMMM 'de' yyyy");
  };

  const formatarHora = (data) => {
    return DateTime.fromISO(data).toFormat('HH:mm');
  };

  const handleEditar = (e, historico) => {
    e.stopPropagation(); // Evita expandir o card
    setHistoricoParaEditar(historico);
    setModalAberto(true);
  };

  const handleDeletar = async (e, historicoId) => {
    e.stopPropagation(); // Evita expandir o card

    if (!window.confirm('Tem certeza que deseja deletar este histórico? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      setDeletando(historicoId);
      await api.delete(`/historico-atendimentos/${historicoId}`);
      toast.success('Histórico deletado com sucesso!');
      carregarDados();
    } catch (error) {
      console.error('Erro ao deletar histórico:', error);
      toast.error('Erro ao deletar histórico de atendimento');
    } finally {
      setDeletando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className={`w-8 h-8 animate-spin ${subTextClass}`} />
      </div>
    );
  }

  if (historicos.length === 0) {
    return (
      <>
        <div className={`${cardClass} rounded-xl border p-12 text-center`}>
          <Activity className={`w-12 h-12 mx-auto mb-4 ${subTextClass}`} />
          <p className={`text-lg font-medium ${textClass} mb-2`}>Nenhum atendimento registrado ainda</p>
          <p className={`text-sm ${subTextClass} mb-6`}>
            Registre o primeiro atendimento para começar o histórico
          </p>
          <button
            onClick={() => setModalAberto(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Atendimento
          </button>
        </div>

        {/* Modal de Novo/Editar Atendimento */}
        <FinalizarAtendimentoModal
          isOpen={modalAberto}
          onClose={() => {
            setModalAberto(false);
            setHistoricoParaEditar(null);
          }}
          agendamento={{
            cliente: {
              _id: clienteId,
              nome: clienteNome
            }
          }}
          historicoExistente={historicoParaEditar}
          onSuccess={() => {
            setModalAberto(false);
            setHistoricoParaEditar(null);
            carregarDados();
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com botão Novo Atendimento */}
      <div className="flex justify-between items-center">
        <h2 className={`text-xl font-semibold ${textClass}`}>Histórico de Atendimentos</h2>
        <button
          onClick={() => setModalAberto(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Atendimento
        </button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${cardClass} rounded-xl border p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className={`w-4 h-4 ${subTextClass}`} />
            <span className={`text-sm ${subTextClass}`}>Total de Atendimentos</span>
          </div>
          <p className={`text-2xl font-bold ${textClass}`}>{stats.totalAtendimentos || 0}</p>
        </div>

        {stats.mediaSatisfacao && (
          <div className={`${cardClass} rounded-xl border p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-amber-400" />
              <span className={`text-sm ${subTextClass}`}>Média de Satisfação</span>
            </div>
            <p className={`text-2xl font-bold ${textClass}`}>{stats.mediaSatisfacao}/5</p>
          </div>
        )}

        {stats.ultimoAtendimento && (
          <div className={`${cardClass} rounded-xl border p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <Clock className={`w-4 h-4 ${subTextClass}`} />
              <span className={`text-sm ${subTextClass}`}>Último Atendimento</span>
            </div>
            <p className={`text-sm font-medium ${textClass}`}>
              {formatarData(stats.ultimoAtendimento)}
            </p>
          </div>
        )}
      </div>

      {/* Timeline de Atendimentos */}
      <div className="relative">
        {/* Linha vertical da timeline */}
        <div className={`absolute left-8 top-0 bottom-0 w-0.5 ${
          isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
        }`} />

        {/* Cards de atendimentos */}
        <div className="space-y-6">
          {historicos.map((historico, index) => {
            const isExpanded = expandido === historico._id;

            return (
              <div key={historico._id} className="relative pl-16">
                {/* Círculo na timeline */}
                <div className={`absolute left-6 top-4 w-4 h-4 rounded-full border-4 ${
                  isDarkMode ? 'bg-gray-800 border-indigo-500' : 'bg-white border-indigo-600'
                }`} />

                {/* Card do atendimento */}
                <div
                  className={`${cardClass} ${hoverClass} rounded-xl border transition-all cursor-pointer`}
                  onClick={() => toggleExpandir(historico._id)}
                >
                  {/* Header do card */}
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className={`text-lg font-semibold ${textClass} mb-1`}>
                          {historico.servico}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className={`w-4 h-4 ${subTextClass}`} />
                            <span className={subTextClass}>
                              {formatarData(historico.dataAtendimento)}
                            </span>
                          </div>
                          {historico.duracaoReal && (
                            <div className="flex items-center gap-1">
                              <Clock className={`w-4 h-4 ${subTextClass}`} />
                              <span className={subTextClass}>
                                {historico.duracaoReal} min
                              </span>
                            </div>
                          )}
                          {historico.profissional && (
                            <div className="flex items-center gap-1">
                              <User className={`w-4 h-4 ${subTextClass}`} />
                              <span className={subTextClass}>
                                {historico.profissional.nome}
                              </span>
                            </div>
                          )}
                        </div>

                        {historico.satisfacaoCliente && (
                          <div className="mt-2">
                            {renderEstrelas(historico.satisfacaoCliente)}
                          </div>
                        )}
                      </div>

                      {/* Botões de ação */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => handleEditar(e, historico)}
                          className={`p-2 rounded-lg transition-colors ${
                            isDarkMode
                              ? 'hover:bg-gray-700 text-blue-400 hover:text-blue-300'
                              : 'hover:bg-blue-50 text-blue-600 hover:text-blue-700'
                          }`}
                          title="Editar atendimento"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDeletar(e, historico._id)}
                          disabled={deletando === historico._id}
                          className={`p-2 rounded-lg transition-colors ${
                            deletando === historico._id
                              ? 'opacity-50 cursor-not-allowed'
                              : isDarkMode
                              ? 'hover:bg-gray-700 text-red-400 hover:text-red-300'
                              : 'hover:bg-red-50 text-red-600 hover:text-red-700'
                          }`}
                          title="Deletar atendimento"
                        >
                          {deletando === historico._id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          className={`ml-2 ${subTextClass}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpandir(historico._id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Preview de técnicas (sempre visível) */}
                    {historico.tecnicasUtilizadas && historico.tecnicasUtilizadas.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {historico.tecnicasUtilizadas.slice(0, 3).map((tecnica, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded-lg text-xs ${
                              isDarkMode ? 'bg-indigo-900/30 text-indigo-300' : 'bg-indigo-100 text-indigo-700'
                            }`}
                          >
                            {tecnica}
                          </span>
                        ))}
                        {historico.tecnicasUtilizadas.length > 3 && (
                          <span className={`px-2 py-1 text-xs ${subTextClass}`}>
                            +{historico.tecnicasUtilizadas.length - 3} mais
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Conteúdo expandido */}
                  {isExpanded && (
                    <div className={`border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} p-4 space-y-4`}>
                      {/* Queixa Principal */}
                      {historico.queixaPrincipal && (
                        <div>
                          <h4 className={`text-sm font-medium ${textClass} mb-1`}>Queixa Principal</h4>
                          <p className={`text-sm ${subTextClass}`}>{historico.queixaPrincipal}</p>
                        </div>
                      )}

                      {/* Técnicas Utilizadas (todas) */}
                      {historico.tecnicasUtilizadas && historico.tecnicasUtilizadas.length > 0 && (
                        <div>
                          <h4 className={`text-sm font-medium ${textClass} mb-2`}>Técnicas Utilizadas</h4>
                          <div className="flex flex-wrap gap-2">
                            {historico.tecnicasUtilizadas.map((tecnica, idx) => (
                              <span
                                key={idx}
                                className={`px-3 py-1 rounded-lg text-sm ${
                                  isDarkMode ? 'bg-indigo-900/30 text-indigo-300' : 'bg-indigo-100 text-indigo-700'
                                }`}
                              >
                                {tecnica}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Produtos Aplicados */}
                      {historico.produtosAplicados && historico.produtosAplicados.length > 0 && (
                        <div>
                          <h4 className={`text-sm font-medium ${textClass} mb-2`}>Produtos Aplicados</h4>
                          <ul className={`list-disc list-inside text-sm ${subTextClass} space-y-1`}>
                            {historico.produtosAplicados.map((produto, idx) => (
                              <li key={idx}>{produto}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Áreas Trabalhadas */}
                      {historico.areasTrabalhas && historico.areasTrabalhas.length > 0 && (
                        <div>
                          <h4 className={`text-sm font-medium ${textClass} mb-1`}>Áreas Trabalhadas</h4>
                          <p className={`text-sm ${subTextClass}`}>
                            {historico.areasTrabalhas.join(', ')}
                          </p>
                        </div>
                      )}

                      {/* Resultados */}
                      {historico.resultadosImediatos && (
                        <div>
                          <h4 className={`text-sm font-medium ${textClass} mb-1`}>Resultados Observados</h4>
                          <p className={`text-sm ${subTextClass}`}>{historico.resultadosImediatos}</p>
                        </div>
                      )}

                      {/* Orientações */}
                      {historico.orientacoesPassadas && (
                        <div>
                          <h4 className={`text-sm font-medium ${textClass} mb-1`}>Orientações Passadas</h4>
                          <p className={`text-sm ${subTextClass}`}>{historico.orientacoesPassadas}</p>
                        </div>
                      )}

                      {/* Próximos Passos */}
                      {historico.proximosPassos && (
                        <div className={`p-3 rounded-lg ${
                          isDarkMode ? 'bg-emerald-900/20 border border-emerald-800' : 'bg-emerald-50 border border-emerald-200'
                        }`}>
                          <div className="flex items-start gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-500 mt-0.5" />
                            <div>
                              <h4 className={`text-sm font-medium ${textClass} mb-1`}>Próximos Passos</h4>
                              <p className={`text-sm ${subTextClass}`}>{historico.proximosPassos}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Novo/Editar Atendimento */}
      <FinalizarAtendimentoModal
        isOpen={modalAberto}
        onClose={() => {
          setModalAberto(false);
          setHistoricoParaEditar(null);
        }}
        agendamento={{
          cliente: {
            _id: clienteId,
            nome: clienteNome
          }
        }}
        historicoExistente={historicoParaEditar}
        onSuccess={() => {
          setModalAberto(false);
          setHistoricoParaEditar(null);
          carregarDados();
        }}
      />
    </div>
  );
};

export default HistoricoAtendimentos;
