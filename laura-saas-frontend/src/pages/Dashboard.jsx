import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { motion } from 'framer-motion';
import {
  Calendar as CalendarIcon,
  Users,
  TrendingUp,
  Clock,
  AlertTriangle,
  ChevronRight,
  Euro,
  CheckCircle,
  MessageSquare,
  Bell,
  Sparkles,
  MoreHorizontal,
  ArrowUpRight,
  Zap
} from 'lucide-react';
import {
  SkeletonKPIGrid,
  SkeletonAgendamentoGrid
} from '../components/SkeletonCard';
import DashboardChart from '../components/DashboardChart';
import ThemeToggle from '../components/ThemeToggle';
import toastService from '../services/toastService.jsx';

/**
 * Dashboard Premium - Laura SAAS
 * Design "WOW" focado em conversão e utilidade.
 */
function Dashboard() {
  const navigate = useNavigate();
  const { user, tenant } = useAuth();
  const { isDark } = useTheme();

  const [agendamentosHoje, setAgendamentosHoje] = useState([]);
  const [agendamentosAmanha, setAgendamentosAmanha] = useState([]);
  const [totais, setTotais] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [contagemAmanha, setContagemAmanha] = useState(0);
  const [concluidosSemana, setConcluidosSemana] = useState(0);
  const [sessoesBaixas, setSessoesBaixas] = useState([]);
  const [enviandoLembrete, setEnviandoLembrete] = useState(null);
  const [financeiro, setFinanceiro] = useState({ faturamentoMes: 0, taxaComparecimento: 0 });

  const limiteSessoesBaixasParaFetch = 2;

  // Animações
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        duration: 0.5
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  // Saudação personalizada
  const getSaudacao = () => {
    const hora = new Date().getHours();
    if (hora >= 6 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getPrimeiroNome = () => user?.nome?.split(' ')[0] || 'Usuário';

  const getDataFormatada = () => {
    return new Date().toLocaleDateString('pt-PT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  useEffect(() => {
    async function fetchDadosDashboard() {
      setIsLoading(true);
      try {
        const [
          resAgendamentosHoje,
          resTotais,
          resListaAmanha,
          resContagemAmanha,
          resSemana,
          resSessoes
        ] = await Promise.all([
          api.get('/dashboard/agendamentosHoje'),
          api.get('/dashboard/totais'),
          api.get('/dashboard/agendamentosAmanha'),
          api.get('/dashboard/contagemAgendamentosAmanha'),
          api.get('/dashboard/clientesAtendidosSemana'),
          api.get(`/dashboard/sessoes-baixas?limite=${limiteSessoesBaixasParaFetch}`)
        ]);

        setAgendamentosHoje(Array.isArray(resAgendamentosHoje.data) ? resAgendamentosHoje.data : []);
        setTotais(resTotais.data || {});
        setAgendamentosAmanha(Array.isArray(resListaAmanha.data) ? resListaAmanha.data : []);
        setContagemAmanha(resContagemAmanha.data.contagem ?? 0);
        setConcluidosSemana(resSemana.data.contagem ?? 0);
        setSessoesBaixas(Array.isArray(resSessoes.data.clientes) ? resSessoes.data.clientes : []);

        try {
          const resFinanceiro = await api.get('/dashboard/financeiro');
          if (resFinanceiro.data) {
            setFinanceiro({
              faturamentoMes: resFinanceiro.data.faturamentoMensal || 0,
              taxaComparecimento: resFinanceiro.data.taxaComparecimento || 0
            });
          }
        } catch (err) {
          console.error("Erro ao buscar dados financeiros:", err);
          setFinanceiro({ faturamentoMes: 0, taxaComparecimento: 0 });
        }
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDadosDashboard();
  }, []);

  const formatarDataHora = (dataIso) => {
    if (!dataIso) return '';
    const data = new Date(dataIso);
    return data.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
  };

  const enviarLembrete = async (id, clienteNome) => {
    try {
      setEnviandoLembrete(id);
      const response = await api.post(`/agendamentos/${id}/enviar-lembrete`);
      if (response.data.success) {
        toastService.whatsapp(clienteNome);
      } else {
        toastService.warning(response.data.message || 'Não foi possível enviar o lembrete.');
      }
    } catch (error) {
      console.error('Erro ao enviar lembrete:', error);
      toastService.error(error.response?.data?.message || 'Erro ao enviar lembrete.');
    } finally {
      setEnviandoLembrete(null);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Realizado': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      'Confirmado': 'text-blue-400 bg-blue-400/10 border-blue-400/20',
      'Pendente': 'text-amber-400 bg-amber-400/10 border-amber-400/20',
      'Cancelado Pelo Cliente': 'text-red-400 bg-red-400/10 border-red-400/20',
      'Cancelado Pelo Proprietário': 'text-red-400 bg-red-400/10 border-red-400/20'
    };
    return colors[status] || 'text-slate-400 bg-slate-400/10 border-slate-400/20';
  };

  const kpiCards = [
    {
      title: 'Faturamento',
      value: `€${financeiro.faturamentoMes.toLocaleString('pt-PT')}`,
      change: '+15%',
      isPositive: true,
      icon: Euro,
      gradient: 'from-emerald-500 to-teal-500',
      subtext: 'este mês'
    },
    {
      title: 'Agendamentos',
      value: agendamentosHoje.length + agendamentosAmanha.length,
      change: '+8%',
      isPositive: true,
      icon: CalendarIcon,
      gradient: 'from-indigo-500 to-purple-500',
      subtext: 'hoje e amanhã'
    },
    {
      title: 'Clientes Ativos',
      value: totais.totalClientes ?? 0,
      change: '+12%',
      isPositive: true,
      icon: Users,
      gradient: 'from-blue-500 to-cyan-500',
      subtext: 'base total'
    },
    {
      title: 'Comparecimento',
      value: `${financeiro.taxaComparecimento}%`,
      change: '+4%',
      isPositive: true,
      icon: Zap,
      gradient: 'from-amber-500 to-orange-500',
      subtext: 'taxa mensal'
    }
  ];

  if (isLoading) {
    return (
      <div className={`min-h-screen p-8 space-y-8 ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className={`h-8 w-64 ${isDark ? 'bg-slate-800' : 'bg-slate-300'} rounded-lg animate-pulse`} />
            <div className={`h-4 w-48 ${isDark ? 'bg-slate-800' : 'bg-slate-300'} rounded-lg animate-pulse`} />
          </div>
        </div>
        <SkeletonKPIGrid count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <SkeletonAgendamentoGrid count={3} />
          </div>
          <div className={`lg:col-span-1 h-64 ${isDark ? 'bg-slate-800' : 'bg-slate-300'} rounded-2xl animate-pulse`} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={`min-h-screen pt-24 px-4 pb-8 md:px-8 overflow-hidden transition-colors duration-300 ${
        isDark ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* --- HEADER --- */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            {getSaudacao()}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">{getPrimeiroNome()}</span> 👋
          </h1>
          <p className="text-slate-400 mt-1 flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-slate-500" />
            {getDataFormatada()}
          </p>
        </div>

        <div className="flex gap-3">
          <ThemeToggle />
          <button className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-slate-400 hover:text-white">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-slate-400 hover:text-white">
            <Users className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('/agendamentos/criar')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all font-medium shadow-lg shadow-indigo-500/25 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Novo Agendamento
          </button>
        </div>
      </motion.div>

      {/* --- KPI GRID --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {kpiCards.map((kpi, index) => (
          <motion.div
            key={index}
            variants={itemVariants}
            className={`group relative p-6 rounded-2xl transition-all duration-300 overflow-hidden ${
              isDark
                ? 'bg-white/5 border border-white/10 hover:border-white/20'
                : 'bg-white border border-slate-200 hover:border-slate-300 shadow-lg'
            }`}
          >
            {/* Gradient Background Hover */}
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

            <div className="flex justify-between items-start mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow-lg`}>
                <kpi.icon className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${kpi.isPositive ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'}`}>
                {kpi.change}
                <ArrowUpRight className="w-3 h-3" />
              </div>
            </div>

            <div>
              <p className={`text-sm mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{kpi.title}</p>
              <h3 className={`text-3xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{kpi.value}</h3>
              <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{kpi.subtext}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* --- MAIN GRID (2 Columns) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN (2/3) - Agenda de Hoje */}
        <motion.div variants={itemVariants} className="lg:col-span-2 space-y-8">
          {/* Agenda Hoje Card */}
          <div className={`rounded-3xl overflow-hidden shadow-2xl ${
            isDark
              ? 'bg-slate-800/50 border border-white/10'
              : 'bg-white border border-slate-200'
          }`}>
            <div className={`p-6 flex justify-between items-center ${
              isDark ? 'border-b border-white/5' : 'border-b border-slate-100'
            }`}>
              <h2 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <CalendarIcon className="w-5 h-5 text-indigo-500" />
                Agenda de Hoje
              </h2>
              <button onClick={() => navigate('/agendamentos')} className="text-sm text-indigo-500 hover:text-indigo-400 transition-colors">
                Ver completa
              </button>
            </div>

            <div className="p-6">
              {agendamentosHoje.length > 0 ? (
                <div className="space-y-4">
                  {agendamentosHoje.map((ag, i) => (
                    <div key={ag._id} className="group flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all duration-300">
                      {/* Time Block */}
                      <div className="flex flex-col items-center justify-center w-16 h-16 rounded-xl bg-slate-900 border border-white/10 group-hover:border-indigo-500/50 transition-colors">
                        <span className="text-lg font-bold text-white">{formatarDataHora(ag.dataHora)}</span>
                      </div>

                      {/* Info Block */}
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg text-white mb-1">{ag.cliente?.nome}</h4>
                        <p className="text-slate-400 text-sm flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                          {ag.pacote?.nome || ag.servicoAvulsoNome || 'Serviço Geral'}
                        </p>
                      </div>

                      {/* Status & Actions */}
                      <div className="flex flex-col items-end gap-2">
                        <div className={`px-3 py-1 rounded-full border text-xs font-medium ${getStatusColor(ag.status)}`}>
                          {ag.status}
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => navigate(`/agendamentos/editar/${ag._id}`)}
                            className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors"
                            title="Ver Detalhes"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => enviarLembrete(ag._id, ag.cliente?.nome)}
                            className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors"
                            title="Enviar Lembrete WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    isDark ? 'bg-slate-800' : 'bg-slate-100'
                  }`}>
                    <CalendarIcon className={`w-8 h-8 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                  </div>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Nenhum agendamento para hoje.</p>
                  <button onClick={() => navigate('/agendamentos/criar')} className="text-indigo-500 text-sm mt-2 hover:underline">
                    Agendar agora
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Agenda Semanal Visual Placeholder */}
          <div className={`rounded-3xl overflow-hidden p-6 relative group ${
            isDark
              ? 'bg-slate-800/50 border border-white/10'
              : 'bg-white border border-slate-200 shadow-lg'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <CalendarIcon className="w-5 h-5 text-indigo-400" />
                Visão Semanal
              </h2>
              <div className="flex gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              </div>
            </div>

            {/* Mock Calendar Grid */}
            <div className={`grid grid-cols-7 gap-px rounded-xl overflow-hidden ${
              isDark ? 'bg-white/5 border border-white/5' : 'bg-slate-200 border border-slate-200'
            }`}>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                <div key={d} className={`p-3 text-center ${isDark ? 'bg-slate-900/50' : 'bg-slate-100'}`}>
                  <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{d}</span>
                </div>
              ))}
              {/* Mock Cells */}
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className={`h-20 p-1 relative transition-colors ${
                  isDark ? 'bg-slate-900/30 hover:bg-white/5' : 'bg-white hover:bg-slate-50'
                }`}>
                  {i === 2 && (
                    <div className="absolute top-1 left-1 right-1 rounded-md bg-indigo-500/20 border border-indigo-500/30 p-1 text-[10px] text-indigo-300 truncate">
                      09:00 Maria
                    </div>
                  )}
                  {i === 4 && (
                    <div className="absolute top-8 left-1 right-1 rounded-md bg-purple-500/20 border border-purple-500/30 p-1 text-[10px] text-purple-300 truncate">
                      14:30 Ana
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Overlay CTA */}
            <div className={`absolute inset-0 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${
              isDark ? 'bg-slate-900/60' : 'bg-white/80'
            }`}>
              <button className={`px-6 py-3 rounded-xl font-bold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 ${
                isDark ? 'bg-white text-slate-900' : 'bg-indigo-600 text-white'
              }`}>
                Ver Calendário Completo
              </button>
            </div>
          </div>
        </motion.div>

        {/* RIGHT COLUMN (1/3) - Performance & Ações */}
        <motion.div variants={itemVariants} className="space-y-8">

          {/* Gráfico de Desempenho */}
          <div className={`rounded-3xl overflow-hidden p-6 ${
            isDark
              ? 'bg-slate-800/50 border border-white/10'
              : 'bg-white border border-slate-200 shadow-lg'
          }`}>
            <h2 className={`text-lg font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Desempenho Semanal
            </h2>
            <DashboardChart />
            <div className={`mt-4 flex justify-between text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <span>Média diária</span>
              <span className={`font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>8.5 atendimentos</span>
            </div>
          </div>

          {/* Ações Pendentes / Alertas */}
          <div className={`rounded-3xl overflow-hidden p-6 ${
            isDark
              ? 'bg-slate-800/50 border border-white/10'
              : 'bg-white border border-slate-200 shadow-lg'
          }`}>
            <h2 className={`text-lg font-bold mb-6 flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Ações Pendentes
            </h2>

            <div className="space-y-4">
              {/* Alerta de Sessões Baixas */}
              {sessoesBaixas.length > 0 && (
                <div className={`p-4 rounded-2xl ${isDark ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-600'}`}>
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className={`font-medium ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>Renovação Necessária</h4>
                      <p className={`text-xs ${isDark ? 'text-amber-400/80' : 'text-amber-600'}`}>{sessoesBaixas.length} clientes com sessões baixas</p>
                    </div>
                  </div>
                  <button onClick={() => navigate('/clientes')} className={`w-full py-2 text-xs rounded-lg transition-colors font-medium ${
                    isDark ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' : 'bg-amber-200 hover:bg-amber-300 text-amber-800'
                  }`}>
                    Ver Clientes
                  </button>
                </div>
              )}

              {/* Alerta de Confirmações Pendentes (Mock) */}
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className={`font-medium ${isDark ? 'text-blue-200' : 'text-blue-800'}`}>Confirmações</h4>
                    <p className={`text-xs ${isDark ? 'text-blue-400/80' : 'text-blue-600'}`}>3 agendamentos pendentes</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={`flex-1 py-2 text-xs rounded-lg transition-colors font-medium ${
                    isDark ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300' : 'bg-blue-200 hover:bg-blue-300 text-blue-800'
                  }`}>
                    Enviar Lembretes
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Próximos de Amanhã (Mini Lista) */}
          <div className={`rounded-3xl overflow-hidden p-6 ${
            isDark
              ? 'bg-slate-800/50 border border-white/10'
              : 'bg-white border border-slate-200 shadow-lg'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <Clock className="w-5 h-5 text-purple-400" />
                Amanhã
              </h2>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                {contagemAmanha}
              </span>
            </div>

            <div className="space-y-3">
              {agendamentosAmanha.slice(0, 3).map(ag => (
                <div key={ag._id} className={`flex items-center gap-3 p-3 rounded-xl ${
                  isDark ? 'bg-white/5 border border-white/5' : 'bg-slate-50 border border-slate-200'
                }`}>
                  <div className="text-center min-w-[3rem]">
                    <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{formatarDataHora(ag.dataHora)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{ag.cliente?.nome}</p>
                    <p className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{ag.pacote?.nome || 'Serviço'}</p>
                  </div>
                </div>
              ))}
              {agendamentosAmanha.length === 0 && (
                <p className={`text-sm text-center py-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Agenda livre amanhã.</p>
              )}
            </div>
          </div>

        </motion.div>

      </div>
    </motion.div>
  );
}

export default Dashboard;