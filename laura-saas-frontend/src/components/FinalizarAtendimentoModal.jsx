import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { toast } from 'react-toastify';
import {
  X,
  Save,
  Star,
  MessageSquare,
  Activity,
  Target
} from 'lucide-react';

/**
 * Componente: FinalizarAtendimentoModal
 *
 * Modal para registrar detalhes completos de um atendimento finalizado
 * Pode funcionar em modo criação ou edição
 */
const FinalizarAtendimentoModal = ({ isOpen, onClose, agendamento, historicoExistente, onSuccess }) => {
  const { isDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    servico: '',
    duracaoReal: '',
    queixaPrincipal: '',
    expectativas: '',
    sintomasRelatados: '',
    restricoes: '',
    tecnicasUtilizadas: '',
    produtosAplicados: '',
    equipamentosUsados: '',
    areasTrabalhas: '',
    intensidade: '',
    resultadosImediatos: '',
    reacoesCliente: '',
    orientacoesPassadas: '',
    proximosPassos: '',
    satisfacaoCliente: 0,
    observacoesProfissional: ''
  });

  // Preencher formulário ao abrir modal (modo criação ou edição)
  useEffect(() => {
    if (isOpen) {
      if (historicoExistente) {
        // Modo edição: preencher com dados existentes
        setFormData({
          servico: historicoExistente.servico || '',
          duracaoReal: historicoExistente.duracaoReal || '',
          queixaPrincipal: historicoExistente.queixaPrincipal || '',
          expectativas: historicoExistente.expectativas || '',
          sintomasRelatados: historicoExistente.sintomasRelatados?.join(', ') || '',
          restricoes: historicoExistente.restricoes || '',
          tecnicasUtilizadas: historicoExistente.tecnicasUtilizadas?.join(', ') || '',
          produtosAplicados: historicoExistente.produtosAplicados?.join(', ') || '',
          equipamentosUsados: historicoExistente.equipamentosUsados?.join(', ') || '',
          areasTrabalhas: historicoExistente.areasTrabalhas?.join(', ') || '',
          intensidade: historicoExistente.intensidade || '',
          resultadosImediatos: historicoExistente.resultadosImediatos || '',
          reacoesCliente: historicoExistente.reacoesCliente || '',
          orientacoesPassadas: historicoExistente.orientacoesPassadas || '',
          proximosPassos: historicoExistente.proximosPassos || '',
          satisfacaoCliente: historicoExistente.satisfacaoCliente || 0,
          observacoesProfissional: historicoExistente.observacoesProfissional || ''
        });
      } else {
        // Modo criação: dados do agendamento ou vazio
        setFormData({
          servico: agendamento?.servicoAvulsoNome || agendamento?.pacote?.nome || '',
          duracaoReal: '',
          queixaPrincipal: '',
          expectativas: '',
          sintomasRelatados: '',
          restricoes: '',
          tecnicasUtilizadas: '',
          produtosAplicados: '',
          equipamentosUsados: '',
          areasTrabalhas: '',
          intensidade: '',
          resultadosImediatos: '',
          reacoesCliente: '',
          orientacoesPassadas: '',
          proximosPassos: '',
          satisfacaoCliente: 0,
          observacoesProfissional: ''
        });
      }
    }
  }, [isOpen, agendamento, historicoExistente]);

  // Classes de estilo
  const textClass = isDarkMode ? 'text-gray-100' : 'text-gray-800';
  const subTextClass = isDarkMode ? 'text-gray-400' : 'text-gray-600';
  const bgClass = isDarkMode ? 'bg-gray-900' : 'bg-white';
  const inputClass = `w-full px-4 py-2.5 rounded-lg border ${
    isDarkMode
      ? 'bg-gray-800 border-gray-700 text-gray-100 focus:border-indigo-500'
      : 'bg-white border-gray-300 text-gray-900 focus:border-indigo-600'
  } focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all`;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validações básicas
    if (!formData.servico) {
      toast.error('Nome do serviço é obrigatório');
      return;
    }

    try {
      setLoading(true);

      // Preparar dados
      const payload = {
        cliente: agendamento.cliente._id || agendamento.cliente,
        agendamento: agendamento._id,
        servico: formData.servico,
        duracaoReal: formData.duracaoReal ? parseInt(formData.duracaoReal) : null,
        queixaPrincipal: formData.queixaPrincipal,
        expectativas: formData.expectativas,
        sintomasRelatados: formData.sintomasRelatados
          ? formData.sintomasRelatados.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        restricoes: formData.restricoes,
        tecnicasUtilizadas: formData.tecnicasUtilizadas
          ? formData.tecnicasUtilizadas.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        produtosAplicados: formData.produtosAplicados
          ? formData.produtosAplicados.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        equipamentosUsados: formData.equipamentosUsados
          ? formData.equipamentosUsados.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        areasTrabalhas: formData.areasTrabalhas
          ? formData.areasTrabalhas.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        intensidade: formData.intensidade,
        resultadosImediatos: formData.resultadosImediatos,
        reacoesCliente: formData.reacoesCliente,
        orientacoesPassadas: formData.orientacoesPassadas,
        proximosPassos: formData.proximosPassos,
        satisfacaoCliente: formData.satisfacaoCliente > 0 ? formData.satisfacaoCliente : null,
        observacoesProfissional: formData.observacoesProfissional,
        status: 'Finalizado'
      };

      let response;

      if (historicoExistente) {
        // Modo edição: atualizar histórico existente
        response = await api.put(`/historico-atendimentos/${historicoExistente._id}`, payload);

        if (response.data.success) {
          toast.success('Atendimento atualizado com sucesso!');
          onSuccess?.();
          onClose();
        }
      } else {
        // Modo criação: criar novo histórico
        response = await api.post('/historico-atendimentos', payload);

        if (response.data.success) {
          toast.success('Atendimento registrado com sucesso!');
          onSuccess?.();
          onClose();
        }
      }
    } catch (error) {
      console.error('Erro ao salvar atendimento:', error);
      toast.error(error.response?.data?.message || 'Erro ao salvar atendimento');
    } finally {
      setLoading(false);
    }
  };

  const renderEstrelas = () => {
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((nota) => (
          <button
            key={nota}
            type="button"
            onClick={() => handleChange('satisfacaoCliente', nota)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`w-8 h-8 ${
                nota <= formData.satisfacaoCliente
                  ? 'fill-amber-400 text-amber-400'
                  : isDarkMode
                  ? 'text-gray-600'
                  : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        {formData.satisfacaoCliente > 0 && (
          <span className={`ml-2 text-sm ${subTextClass}`}>
            ({formData.satisfacaoCliente}/5)
          </span>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${bgClass} rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden`}>
        {/* Header */}
        <div className={`sticky top-0 z-10 flex items-center justify-between p-6 border-b ${
          isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
        }`}>
          <div>
            <h2 className={`text-2xl font-bold ${textClass}`}>
              {historicoExistente ? '✏️ Editar Atendimento' : '📋 Novo Atendimento'}
            </h2>
            <p className={`text-sm ${subTextClass} mt-1`}>
              {historicoExistente
                ? 'Atualize os detalhes do atendimento'
                : 'Registre os detalhes do atendimento realizado'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
            }`}
          >
            <X className={`w-6 h-6 ${textClass}`} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Dados Básicos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium ${textClass} mb-2`}>
                  Serviço Realizado <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.servico}
                  onChange={(e) => handleChange('servico', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: Massagem Relaxante"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${textClass} mb-2`}>
                  Duração Real (minutos)
                </label>
                <input
                  type="number"
                  value={formData.duracaoReal}
                  onChange={(e) => handleChange('duracaoReal', e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 60"
                  min="0"
                />
              </div>
            </div>

            {/* Anamnese Pré-Atendimento */}
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className={`w-5 h-5 ${subTextClass}`} />
                <h3 className={`font-semibold ${textClass}`}>Anamnese Pré-Atendimento</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Queixa Principal
                  </label>
                  <textarea
                    value={formData.queixaPrincipal}
                    onChange={(e) => handleChange('queixaPrincipal', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="O que o cliente relatou como principal motivo?"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Expectativas
                  </label>
                  <textarea
                    value={formData.expectativas}
                    onChange={(e) => handleChange('expectativas', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="O que o cliente espera alcançar?"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Sintomas Relatados
                  </label>
                  <input
                    type="text"
                    value={formData.sintomasRelatados}
                    onChange={(e) => handleChange('sintomasRelatados', e.target.value)}
                    className={inputClass}
                    placeholder="Separe por vírgulas: Dor nas costas, Tensão muscular"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Restrições/Observações
                  </label>
                  <textarea
                    value={formData.restricoes}
                    onChange={(e) => handleChange('restricoes', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="Alergias, medicamentos, condições especiais..."
                  />
                </div>
              </div>
            </div>

            {/* Procedimento Realizado */}
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Activity className={`w-5 h-5 ${subTextClass}`} />
                <h3 className={`font-semibold ${textClass}`}>Procedimento Realizado</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Técnicas Utilizadas
                  </label>
                  <input
                    type="text"
                    value={formData.tecnicasUtilizadas}
                    onChange={(e) => handleChange('tecnicasUtilizadas', e.target.value)}
                    className={inputClass}
                    placeholder="Separe por vírgulas: Massagem sueca, Drenagem linfática"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Produtos Aplicados
                  </label>
                  <input
                    type="text"
                    value={formData.produtosAplicados}
                    onChange={(e) => handleChange('produtosAplicados', e.target.value)}
                    className={inputClass}
                    placeholder="Separe por vírgulas: Óleo de amêndoas, Creme hidratante"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Equipamentos Usados
                  </label>
                  <input
                    type="text"
                    value={formData.equipamentosUsados}
                    onChange={(e) => handleChange('equipamentosUsados', e.target.value)}
                    className={inputClass}
                    placeholder="Separe por vírgulas: Maca aquecida, Pedras quentes"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Áreas Trabalhadas
                    </label>
                    <input
                      type="text"
                      value={formData.areasTrabalhas}
                      onChange={(e) => handleChange('areasTrabalhas', e.target.value)}
                      className={inputClass}
                      placeholder="Costas, Pernas, Braços"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${textClass} mb-2`}>
                      Intensidade
                    </label>
                    <select
                      value={formData.intensidade}
                      onChange={(e) => handleChange('intensidade', e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Selecione...</option>
                      <option value="Leve">Leve</option>
                      <option value="Moderada">Moderada</option>
                      <option value="Intensa">Intensa</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Resultados */}
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Target className={`w-5 h-5 ${subTextClass}`} />
                <h3 className={`font-semibold ${textClass}`}>Resultados e Orientações</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Resultados Imediatos
                  </label>
                  <textarea
                    value={formData.resultadosImediatos}
                    onChange={(e) => handleChange('resultadosImediatos', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="O que foi observado após o atendimento?"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Reações do Cliente
                  </label>
                  <textarea
                    value={formData.reacoesCliente}
                    onChange={(e) => handleChange('reacoesCliente', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="Feedback do cliente durante/após o atendimento"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Orientações Passadas
                  </label>
                  <textarea
                    value={formData.orientacoesPassadas}
                    onChange={(e) => handleChange('orientacoesPassadas', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="Cuidados pós-atendimento recomendados"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Próximos Passos
                  </label>
                  <textarea
                    value={formData.proximosPassos}
                    onChange={(e) => handleChange('proximosPassos', e.target.value)}
                    className={inputClass}
                    rows="2"
                    placeholder="Recomendações para próximas sessões"
                  />
                </div>
              </div>
            </div>

            {/* Avaliação */}
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-4">
                <Star className={`w-5 h-5 ${subTextClass}`} />
                <h3 className={`font-semibold ${textClass}`}>Avaliação</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-3`}>
                    Satisfação do Cliente
                  </label>
                  {renderEstrelas()}
                </div>

                <div>
                  <label className={`block text-sm font-medium ${textClass} mb-2`}>
                    Observações do Profissional (Privado)
                  </label>
                  <textarea
                    value={formData.observacoesProfissional}
                    onChange={(e) => handleChange('observacoesProfissional', e.target.value)}
                    className={inputClass}
                    rows="3"
                    placeholder="Notas privadas sobre o atendimento..."
                  />
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className={`sticky bottom-0 flex items-center justify-end gap-3 p-6 border-t ${
          isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
        }`}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={`px-6 py-2.5 rounded-lg font-medium transition-colors ${
              isDarkMode
                ? 'bg-gray-800 text-gray-100 hover:bg-gray-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg font-medium bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar Atendimento
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinalizarAtendimentoModal;
