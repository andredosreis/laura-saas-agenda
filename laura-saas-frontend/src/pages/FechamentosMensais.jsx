import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { DateTime } from 'luxon';
import {
  CalendarCheck,
  Loader2,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  History,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const NOMES_MES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const formatEUR = (n) => `€${(n ?? 0).toFixed(2)}`;

function FechamentosMensais() {
  const { isDarkMode } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [loading, setLoading] = useState(true);
  const [fechando, setFechando] = useState(false);
  const [fechamentos, setFechamentos] = useState([]);
  const [expandidoId, setExpandidoId] = useState(null);

  // Mês alvo do botão "Fechar" = mês anterior ao corrente em Lisboa.
  // Ex: hoje 03-Maio-2026 → propõe fechar Abril 2026.
  const mesAlvo = DateTime.now().setZone('Europe/Lisbon').minus({ months: 1 });

  const fetchFechamentos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/fechamentos-mensais?limit=24');
      setFechamentos(data?.data || []);
    } catch (err) {
      console.error('[Fechamentos] erro ao carregar:', err);
      toast.error('Erro ao carregar fechamentos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFechamentos();
  }, [fetchFechamentos]);

  const fecharMes = async (ano, mes) => {
    if (!isAdmin) return;
    const confirmar = window.confirm(
      `Fechar ${NOMES_MES[mes]}/${ano}?\n\nIsto cria/actualiza um snapshot dos totais do mês. Não bloqueia novos lançamentos — podes re-fechar a qualquer momento.`
    );
    if (!confirmar) return;

    setFechando(true);
    try {
      const { data } = await api.post('/fechamentos-mensais', { ano, mes });
      const versao = data?.data?.versao || 1;
      toast.success(versao > 1
        ? `${NOMES_MES[mes]}/${ano} re-fechado (versão ${versao})`
        : `${NOMES_MES[mes]}/${ano} fechado com sucesso`);
      await fetchFechamentos();
    } catch (err) {
      console.error('[Fechamentos] erro ao fechar:', err);
      toast.error(err.response?.data?.error || 'Erro ao fechar mês');
    } finally {
      setFechando(false);
    }
  };

  const cardClass = isDarkMode
    ? 'bg-slate-800/50 border border-white/10'
    : 'bg-white border border-gray-200 shadow-xs';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';

  if (loading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-20 flex items-center justify-center`}>
        <Loader2 className={`w-8 h-8 animate-spin ${subTextClass}`} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'} pt-20 pb-8 px-4`}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarCheck className={`w-7 h-7 ${subTextClass}`} />
            <div>
              <h1 className={`text-2xl font-bold ${textClass}`}>Fechamentos Mensais</h1>
              <p className={subTextClass}>
                Snapshot do mês para histórico — não bloqueia mutações posteriores
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => fecharMes(mesAlvo.year, mesAlvo.month)}
              disabled={fechando}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {fechando ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Fechar {NOMES_MES[mesAlvo.month]}/{mesAlvo.year}
            </button>
          )}
        </div>

        {/* Empty state */}
        {fechamentos.length === 0 && (
          <div className={`${cardClass} rounded-2xl p-8 text-center`}>
            <CalendarCheck className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
            <p className={`${textClass} font-medium`}>Ainda não há fechamentos</p>
            <p className={`${subTextClass} text-sm mt-1`}>
              {isAdmin
                ? `Clica em "Fechar ${NOMES_MES[mesAlvo.month]}/${mesAlvo.year}" para criar o primeiro snapshot.`
                : 'Pede a um admin para criar o primeiro snapshot mensal.'}
            </p>
          </div>
        )}

        {/* Lista */}
        <div className="space-y-3">
          {fechamentos.map((f) => {
            const expandido = expandidoId === f._id;
            const saldoPositivo = (f.totais?.saldo || 0) >= 0;
            const isStale = !!f.stale?.desde;
            return (
              <div key={f._id} className={`${cardClass} rounded-2xl overflow-hidden`}>
                {/* Linha resumo (clickable) */}
                <button
                  onClick={() => setExpandidoId(expandido ? null : f._id)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl ${isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-50'} shrink-0`}>
                      <span className={`text-xs font-bold ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>{f.ano}</span>
                      <span className={`text-lg font-bold ${textClass}`}>{f.mes.toString().padStart(2, '0')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium ${textClass}`}>{NOMES_MES[f.mes]} {f.ano}</h3>
                      <div className="flex items-center gap-3 text-xs mt-1 flex-wrap">
                        <span className={subTextClass}>
                          Receitas <strong className="text-emerald-500">{formatEUR(f.totais?.receitas)}</strong>
                        </span>
                        <span className={subTextClass}>
                          Despesas <strong className="text-red-500">{formatEUR(f.totais?.despesas)}</strong>
                        </span>
                        <span className={subTextClass}>
                          Saldo <strong className={saldoPositivo ? 'text-emerald-500' : 'text-red-500'}>{formatEUR(f.totais?.saldo)}</strong>
                        </span>
                        {f.versao > 1 && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isDarkMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700'}`}>
                            v{f.versao}
                          </span>
                        )}
                        {isStale && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                            <AlertTriangle className="w-3 h-3" />
                            Re-fechar
                          </span>
                        )}
                        {(f.retroactivos?.quantidade || 0) > 0 && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                            <History className="w-3 h-3" />
                            {f.retroactivos.quantidade} retroactivo{f.retroactivos.quantidade > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 ${subTextClass} transition-transform shrink-0 ${expandido ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Detalhe expandido */}
                {expandido && (
                  <div className={`px-5 pb-5 pt-0 border-t ${isDarkMode ? 'border-white/5' : 'border-gray-200'} space-y-4`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {/* Receitas por categoria */}
                      <div>
                        <h4 className={`text-sm font-medium ${textClass} mb-2 flex items-center gap-2`}>
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                          Receitas por categoria
                        </h4>
                        {(f.totais?.receitasPorCategoria || []).length > 0 ? (
                          <ul className="space-y-1">
                            {f.totais.receitasPorCategoria.map((c) => (
                              <li key={c.categoria} className={`flex justify-between text-sm ${subTextClass}`}>
                                <span>{c.categoria}</span>
                                <span className="text-emerald-500 font-medium">{formatEUR(c.valor)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`text-xs ${subTextClass} italic`}>Sem receitas neste mês.</p>
                        )}
                      </div>

                      {/* Receitas por forma de pagamento */}
                      <div>
                        <h4 className={`text-sm font-medium ${textClass} mb-2`}>Por forma de pagamento</h4>
                        {(f.totais?.receitasPorFormaPagamento || []).length > 0 ? (
                          <ul className="space-y-1">
                            {f.totais.receitasPorFormaPagamento.map((c) => (
                              <li key={c.forma} className={`flex justify-between text-sm ${subTextClass}`}>
                                <span>{c.forma}</span>
                                <span className={textClass}>{formatEUR(c.valor)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`text-xs ${subTextClass} italic`}>—</p>
                        )}
                      </div>

                      {/* Despesas por categoria */}
                      <div>
                        <h4 className={`text-sm font-medium ${textClass} mb-2 flex items-center gap-2`}>
                          <TrendingDown className="w-4 h-4 text-red-500" />
                          Despesas por categoria
                        </h4>
                        {(f.totais?.despesasPorCategoria || []).length > 0 ? (
                          <ul className="space-y-1">
                            {f.totais.despesasPorCategoria.map((c) => (
                              <li key={c.categoria} className={`flex justify-between text-sm ${subTextClass}`}>
                                <span>{c.categoria}</span>
                                <span className="text-red-500 font-medium">{formatEUR(c.valor)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className={`text-xs ${subTextClass} italic`}>Sem despesas neste mês.</p>
                        )}
                      </div>

                      {/* Pendente + contagens */}
                      <div>
                        <h4 className={`text-sm font-medium ${textClass} mb-2`}>Outros</h4>
                        <ul className="space-y-1">
                          <li className={`flex justify-between text-sm ${subTextClass}`}>
                            <span>Pendente (em aberto)</span>
                            <span className="text-amber-500 font-medium">{formatEUR(f.totais?.pendente)}</span>
                          </li>
                          <li className={`flex justify-between text-sm ${subTextClass}`}>
                            <span>Vendas de pacotes</span>
                            <span className={textClass}>{f.contagens?.comprasPacote ?? 0}</span>
                          </li>
                          {(f.retroactivos?.quantidade || 0) > 0 && (
                            <li className={`flex justify-between text-sm ${subTextClass}`}>
                              <span>Retroactivos</span>
                              <span className="text-amber-500">
                                {f.retroactivos.quantidade} ({formatEUR(f.retroactivos.valorTotal)})
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className={`text-xs ${subTextClass} pt-2 border-t ${isDarkMode ? 'border-white/5' : 'border-gray-200'} flex items-center justify-between flex-wrap gap-2`}>
                      <span>
                        Fechado em {DateTime.fromISO(f.fechadoEm).setZone('Europe/Lisbon').toFormat('dd/MM/yyyy HH:mm')}
                        {f.versao > 1 && ` · versão ${f.versao}`}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => fecharMes(f.ano, f.mes)}
                          disabled={fechando}
                          className={`text-xs px-3 py-1 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${textClass} font-medium transition-colors disabled:opacity-50`}
                        >
                          🔄 Re-fechar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default FechamentosMensais;
