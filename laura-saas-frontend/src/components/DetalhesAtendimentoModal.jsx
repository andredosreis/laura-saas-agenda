import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import {
  X, Loader2, Star, Clock, ClipboardList, Sparkles, Package,
  Activity, MessageSquare, Image as ImageIcon, FileText, AlertCircle, Edit
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';

/**
 * Modal de detalhes clínicos de um atendimento.
 * Faz GET /historico-atendimentos?agendamento=:id&limit=1 e mostra o registo
 * (técnicas, produtos, satisfação em estrelas, fotos antes/depois, etc.).
 *
 * Se não houver registo (atendimento ainda sem ficha clínica) → empty state
 * com CTA para finalizar o atendimento na página de Agendamentos.
 */
function DetalhesAtendimentoModal({ isOpen, agendamentoId, onClose, onEditarFinalizacao }) {
  const { isDarkMode } = useTheme();
  const [historico, setHistorico] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState(null);

  // Estilos condicionais (alinhado com o resto do design system)
  const cardClass = isDarkMode
    ? 'bg-slate-800 border border-white/10'
    : 'bg-white border border-gray-200';
  const textClass = isDarkMode ? 'text-white' : 'text-gray-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-gray-600';
  const sectionBgClass = isDarkMode ? 'bg-slate-900/40' : 'bg-gray-50';
  const chipClass = isDarkMode
    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
    : 'bg-indigo-50 text-indigo-700 border border-indigo-200';

  useEffect(() => {
    if (!isOpen || !agendamentoId) {
      setHistorico(null);
      setErro(null);
      return;
    }
    let cancelled = false;
    const fetchHistorico = async () => {
      setIsLoading(true);
      setErro(null);
      try {
        const res = await api.get(`/historico-atendimentos?agendamento=${agendamentoId}&limit=1`);
        if (cancelled) return;
        const lista = res.data?.data || [];
        setHistorico(lista[0] || null);
      } catch (err) {
        if (cancelled) return;
        console.error('Erro ao carregar histórico clínico:', err);
        setErro(err.response?.data?.message || 'Erro ao carregar detalhes');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchHistorico();
    return () => { cancelled = true; };
  }, [isOpen, agendamentoId]);

  if (!isOpen) return null;

  const renderEstrelas = (n) => {
    if (n == null) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= n ? 'fill-amber-400 text-amber-400' : isDarkMode ? 'text-slate-600' : 'text-gray-300'}`}
          />
        ))}
        <span className={`ml-2 text-sm font-medium ${textClass}`}>{n}/5</span>
      </div>
    );
  };

  const renderChips = (items, fallback = '—') => {
    if (!items || items.length === 0) return <span className={`text-sm ${subTextClass}`}>{fallback}</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className={`text-xs px-2 py-1 rounded-lg font-medium ${chipClass}`}>
            {item}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`${cardClass} rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-indigo-500/20' : 'bg-indigo-50'}`}>
              <ClipboardList className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${textClass}`}>Detalhes do Atendimento</h2>
              <p className={`text-xs ${subTextClass}`}>Informação clínica e resultados</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
          >
            <X className={`w-5 h-5 ${subTextClass}`} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className={`mt-3 text-sm ${subTextClass}`}>A carregar detalhes...</p>
            </div>
          ) : erro ? (
            <div className={`p-6 rounded-xl ${isDarkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'} flex items-start gap-3`}>
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className={`font-medium ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>Erro ao carregar</p>
                <p className={`text-sm mt-0.5 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{erro}</p>
              </div>
            </div>
          ) : !historico ? (
            <div className="py-10 text-center">
              <FileText className={`w-12 h-12 mx-auto mb-3 ${subTextClass}`} />
              <p className={`text-base ${textClass}`}>Atendimento ainda sem ficha clínica.</p>
              <p className={`text-sm mt-1 ${subTextClass}`}>
                Vai a <span className="font-medium">Agendamentos</span> e usa o botão <span className="font-medium">Finalizar Atendimento</span> para registar técnicas, observações e satisfação do cliente.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Resumo: serviço + duração + data + status */}
              <div className={`p-4 rounded-xl ${sectionBgClass}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold ${textClass} truncate`}>{historico.servico || 'Sem serviço'}</h3>
                    <p className={`text-xs mt-0.5 ${subTextClass}`}>
                      {historico.cliente?.nome || 'Cliente'}
                      {' · '}
                      {DateTime.fromISO(historico.dataAtendimento).setZone('Europe/Lisbon').toFormat('dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                  {historico.status === 'Finalizado' ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium whitespace-nowrap">
                      Finalizado
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium whitespace-nowrap">
                      Rascunho
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  {historico.duracaoReal != null && (
                    <div className={`flex items-center gap-1.5 ${subTextClass}`}>
                      <Clock className="w-4 h-4" />
                      <span>{historico.duracaoReal} min</span>
                    </div>
                  )}
                  {historico.intensidade && (
                    <div className={`flex items-center gap-1.5 ${subTextClass}`}>
                      <Activity className="w-4 h-4" />
                      <span>Intensidade: <span className={`font-medium ${textClass}`}>{historico.intensidade}</span></span>
                    </div>
                  )}
                  {historico.satisfacaoCliente != null && (
                    <div className="flex items-center gap-1.5">
                      {renderEstrelas(historico.satisfacaoCliente)}
                    </div>
                  )}
                </div>
              </div>

              {/* Anamnese */}
              {(historico.queixaPrincipal || historico.expectativas || (historico.sintomasRelatados?.length > 0) || historico.restricoes) && (
                <Section title="Anamnese pré-atendimento" icon={ClipboardList} subTextClass={subTextClass}>
                  {historico.queixaPrincipal && (
                    <Field label="Queixa principal" value={historico.queixaPrincipal} subTextClass={subTextClass} textClass={textClass} />
                  )}
                  {historico.expectativas && (
                    <Field label="Expectativas" value={historico.expectativas} subTextClass={subTextClass} textClass={textClass} />
                  )}
                  {historico.sintomasRelatados?.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-1.5 ${subTextClass}`}>Sintomas</p>
                      {renderChips(historico.sintomasRelatados)}
                    </div>
                  )}
                  {historico.restricoes && (
                    <Field label="Restrições" value={historico.restricoes} subTextClass={subTextClass} textClass={textClass} />
                  )}
                </Section>
              )}

              {/* Procedimento */}
              {(historico.tecnicasUtilizadas?.length > 0 || historico.produtosAplicados?.length > 0 || historico.equipamentosUsados?.length > 0 || historico.areasTrabalhas?.length > 0) && (
                <Section title="Procedimento realizado" icon={Sparkles} subTextClass={subTextClass}>
                  {historico.tecnicasUtilizadas?.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-1.5 ${subTextClass}`}>Técnicas utilizadas</p>
                      {renderChips(historico.tecnicasUtilizadas)}
                    </div>
                  )}
                  {historico.produtosAplicados?.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-1.5 ${subTextClass}`}>Produtos aplicados</p>
                      {renderChips(historico.produtosAplicados)}
                    </div>
                  )}
                  {historico.equipamentosUsados?.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-1.5 ${subTextClass}`}>Equipamentos</p>
                      {renderChips(historico.equipamentosUsados)}
                    </div>
                  )}
                  {historico.areasTrabalhas?.length > 0 && (
                    <div>
                      <p className={`text-xs font-medium mb-1.5 ${subTextClass}`}>Áreas trabalhadas</p>
                      {renderChips(historico.areasTrabalhas)}
                    </div>
                  )}
                </Section>
              )}

              {/* Pós-atendimento */}
              {(historico.resultadosImediatos || historico.reacoesCliente || historico.orientacoesPassadas || historico.proximosPassos) && (
                <Section title="Resultados e orientações" icon={MessageSquare} subTextClass={subTextClass}>
                  {historico.resultadosImediatos && (
                    <Field label="Resultados imediatos" value={historico.resultadosImediatos} subTextClass={subTextClass} textClass={textClass} />
                  )}
                  {historico.reacoesCliente && (
                    <Field label="Reacções do cliente" value={historico.reacoesCliente} subTextClass={subTextClass} textClass={textClass} />
                  )}
                  {historico.orientacoesPassadas && (
                    <Field label="Orientações passadas" value={historico.orientacoesPassadas} subTextClass={subTextClass} textClass={textClass} />
                  )}
                  {historico.proximosPassos && (
                    <Field label="Próximos passos" value={historico.proximosPassos} subTextClass={subTextClass} textClass={textClass} />
                  )}
                </Section>
              )}

              {/* Fotos antes/depois */}
              {((historico.fotosAntes?.length > 0) || (historico.fotosDepois?.length > 0)) && (
                <Section title="Fotos comparativas" icon={ImageIcon} subTextClass={subTextClass}>
                  <div className="grid grid-cols-2 gap-3">
                    {historico.fotosAntes?.length > 0 && (
                      <div>
                        <p className={`text-xs font-medium mb-2 ${subTextClass}`}>Antes ({historico.fotosAntes.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {historico.fotosAntes.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={url} alt={`Antes ${i + 1}`} className="w-full h-24 object-cover rounded-lg border border-white/10" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {historico.fotosDepois?.length > 0 && (
                      <div>
                        <p className={`text-xs font-medium mb-2 ${subTextClass}`}>Depois ({historico.fotosDepois.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {historico.fotosDepois.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={url} alt={`Depois ${i + 1}`} className="w-full h-24 object-cover rounded-lg border border-white/10" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Observações do profissional */}
              {historico.observacoesProfissional && (
                <Section title="Observações do profissional" icon={Package} subTextClass={subTextClass}>
                  <p className={`text-sm ${textClass} whitespace-pre-wrap`}>{historico.observacoesProfissional}</p>
                </Section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-white/10' : 'border-gray-200'} flex gap-2`}>
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-2.5 rounded-xl ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} transition-colors text-sm font-medium`}
          >
            Fechar
          </button>
          {historico && onEditarFinalizacao && (
            <button
              onClick={() => onEditarFinalizacao(historico)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 hover:opacity-90 transition-all text-white text-sm font-medium"
            >
              <Edit className="w-4 h-4" />
              Editar Ficha
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children, subTextClass }) {
  const IconCmp = icon;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <IconCmp className={`w-4 h-4 ${subTextClass}`} />
        <h4 className={`text-sm font-semibold uppercase tracking-wide ${subTextClass}`}>{title}</h4>
      </div>
      <div className="space-y-3 pl-6">{children}</div>
    </div>
  );
}

function Field({ label, value, subTextClass, textClass }) {
  return (
    <div>
      <p className={`text-xs font-medium mb-1 ${subTextClass}`}>{label}</p>
      <p className={`text-sm ${textClass} whitespace-pre-wrap`}>{value}</p>
    </div>
  );
}

export default DetalhesAtendimentoModal;
