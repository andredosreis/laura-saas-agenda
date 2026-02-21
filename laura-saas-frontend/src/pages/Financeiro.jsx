import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import {
    TrendingUp,
    DollarSign,
    Users,
    Calendar as CalendarIcon,
    Percent,
    RefreshCw,
    Loader2,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { toast } from 'react-toastify';

// Chart components
import RevenueLineChart from '../components/RevenueLineChart';
import ServicePieChart from '../components/ServicePieChart';
import TopClientsTable from '../components/TopClientsTable';

// Date presets
const DATE_PRESETS = [
    { label: 'Última Semana', days: 7 },
    { label: 'Último Mês', days: 30 },
    { label: 'Último Trimestre', days: 90 },
    { label: 'Este Ano', days: 365 }
];

// Period options
const PERIOD_OPTIONS = [
    { value: 'dia', label: 'Diário' },
    { value: 'semana', label: 'Semanal' },
    { value: 'mes', label: 'Mensal' }
];

function Financeiro() {
    const navigate = useNavigate();
    const { isDarkMode } = useTheme();

    // State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPreset, setSelectedPreset] = useState(1); // Último Mês
    const [periodo, setPeriodo] = useState('dia');

    // Data states
    const [receitaTemporal, setReceitaTemporal] = useState([]);
    const [distribuicaoServicos, setDistribuicaoServicos] = useState([]);
    const [topClientes, setTopClientes] = useState([]);
    const [kpis, setKpis] = useState({
        totalReceita: 0,
        ticketMedio: 0,
        taxaComparecimento: 0,
        crescimento: 0,
        totalClientes: 0,
        valorPendente: 0
    });

    // Calculate date range
    const getDateRange = useCallback(() => {
        const dias = DATE_PRESETS[selectedPreset].days;
        const dataFim = DateTime.now().setZone('Europe/Lisbon').endOf('day');
        const dataInicio = dataFim.minus({ days: dias }).startOf('day');
        return { dataInicio, dataFim, dias };
    }, [selectedPreset]);

    // Fetch all data
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { dataInicio, dataFim, dias } = getDateRange();

        try {
            const [
                receitaRes,
                servicosRes,
                clientesRes,
                financeiroRes,
                todosClientesRes
            ] = await Promise.all([
                api.get(`/analytics/receita-temporal?periodo=${periodo}&dias=${dias}`),
                api.get(`/analytics/distribuicao-servicos?dataInicio=${dataInicio.toISODate()}&dataFim=${dataFim.toISODate()}`),
                api.get(`/analytics/top-clientes?limite=10&dataInicio=${dataInicio.toISODate()}&dataFim=${dataFim.toISODate()}`),
                api.get('/dashboard/financeiro'),
                api.get('/clientes')
            ]);

            // Set chart data
            setReceitaTemporal(receitaRes.data?.dados || []);
            setDistribuicaoServicos(servicosRes.data?.servicos || []);
            setTopClientes(clientesRes.data?.clientes || []);

            // Calculate KPIs
            const totalReceita = servicosRes.data?.totalReceita || 0;
            const totalAgendamentos = (receitaRes.data?.dados || []).reduce((acc, d) => acc + d.agendamentos, 0);
            const totalClientesAtivos = todosClientesRes.data?.data?.length || 0;

            setKpis({
                totalReceita,
                ticketMedio: totalAgendamentos > 0 ? totalReceita / totalAgendamentos : 0,
                taxaComparecimento: financeiroRes.data?.taxaComparecimento || 0,
                crescimento: 0, // Would need previous period data
                totalClientes: totalClientesAtivos,
                valorPendente: financeiroRes.data?.valorPendente || 0
            });

        } catch (error) {
            console.error('Erro ao carregar dados financeiros:', error);
            setError(error.response?.data?.message || 'Erro ao carregar dados financeiros');
            toast.error('Erro ao carregar dados financeiros');
        } finally {
            setLoading(false);
        }
    }, [getDateRange, periodo]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle client click
    const handleClientClick = (clienteId) => {
        navigate(`/clientes/editar/${clienteId}`);
    };

    // Theme classes
    const cardClass = isDarkMode
        ? 'bg-slate-800/50 border-white/10'
        : 'bg-white border-slate-200';
    const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
    const subtextClass = isDarkMode ? 'text-slate-400' : 'text-slate-600';

    // KPI Card component
    const KPICard = ({ title, value, icon: Icon, trend, format = 'currency', color = 'indigo' }) => {
        const colorStyles = {
            indigo: 'from-indigo-500 to-purple-600',
            teal: 'from-teal-500 to-emerald-600',
            amber: 'from-amber-500 to-orange-600',
            green: 'from-green-500 to-emerald-600'
        };

        const formatValue = () => {
            if (format === 'currency') return `€${value.toFixed(2)}`;
            if (format === 'percent') return `${value.toFixed(1)}%`;
            return value;
        };

        return (
            <div className={`rounded-2xl border ${cardClass} p-5 relative overflow-hidden`}>
                <div className="flex items-start justify-between">
                    <div>
                        <p className={`text-sm font-medium ${subtextClass}`}>{title}</p>
                        <p className={`text-2xl font-bold ${textClass} mt-1`}>{formatValue()}</p>
                        {trend !== undefined && trend !== 0 && (
                            <div className={`flex items-center gap-1 mt-2 text-sm ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {trend > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                <span>{Math.abs(trend).toFixed(1)}%</span>
                            </div>
                        )}
                    </div>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorStyles[color]} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-6 h-6 text-white" />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`min-h-screen pt-24 pb-8 px-4 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className={`text-2xl font-bold ${textClass} flex items-center gap-3`}>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-white" />
                            </div>
                            Financeiro
                        </h1>
                        <p className={`${subtextClass} mt-1`}>
                            Análise de receita, serviços e clientes
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className={`p-2 rounded-xl ${cardClass} border transition-all hover:scale-105`}
                            title="Atualizar"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''} ${subtextClass}`} />
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className={`rounded-2xl border ${cardClass} p-4 mb-6`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                        {/* Date Presets */}
                        <div className={`flex items-center gap-1 p-1 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                            {DATE_PRESETS.map((preset, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedPreset(idx)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedPreset === idx
                                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                            : `${subtextClass} ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-white'}`
                                        }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        {/* Period Selector for Line Chart */}
                        <div className={`flex items-center gap-1 p-1 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                            <span className={`text-sm ${subtextClass} px-2`}>Agrupar por:</span>
                            {PERIOD_OPTIONS.map(({ value, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setPeriodo(value)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${periodo === value
                                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                            : `${subtextClass} ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-white'}`
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Error Message */}
                {error && !loading && (
                    <div className={`rounded-2xl border p-6 text-center ${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-red-500 font-medium">{error}</p>
                        <button
                            onClick={fetchData}
                            className="mt-4 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                        >
                            Tentar Novamente
                        </button>
                    </div>
                )}

                {/* Loading Overlay */}
                {loading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className={`w-8 h-8 animate-spin ${subtextClass}`} />
                    </div>
                )}

                {!loading && (
                    <>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <KPICard
                                title="Receita Total"
                                value={kpis.totalReceita}
                                icon={DollarSign}
                                color="green"
                            />
                            <KPICard
                                title="Ticket Médio"
                                value={kpis.ticketMedio}
                                icon={TrendingUp}
                                color="indigo"
                            />
                            <KPICard
                                title="Taxa de Comparecimento"
                                value={kpis.taxaComparecimento}
                                icon={Percent}
                                format="percent"
                                color="teal"
                            />
                            <KPICard
                                title="Total Clientes"
                                value={kpis.totalClientes}
                                icon={Users}
                                format="number"
                                color="amber"
                            />
                        </div>

                        {/* Charts Row */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                            {/* Revenue Line Chart */}
                            <div className={`lg:col-span-2 rounded-2xl border ${cardClass} p-5`}>
                                <h3 className={`text-lg font-semibold ${textClass} mb-4`}>
                                    Evolução da Receita
                                </h3>
                                <RevenueLineChart
                                    data={receitaTemporal}
                                    periodo={periodo}
                                    isLoading={loading}
                                />
                            </div>

                            {/* Service Pie Chart */}
                            <div className={`rounded-2xl border ${cardClass} p-5`}>
                                <h3 className={`text-lg font-semibold ${textClass} mb-4`}>
                                    Distribuição por Serviço
                                </h3>
                                <ServicePieChart
                                    data={distribuicaoServicos}
                                    isLoading={loading}
                                />
                            </div>
                        </div>

                        {/* Top Clients Table */}
                        <div className={`rounded-2xl border ${cardClass} p-5`}>
                            <h3 className={`text-lg font-semibold ${textClass} mb-4`}>
                                Top Clientes
                            </h3>
                            <TopClientsTable
                                clientes={topClientes}
                                isLoading={loading}
                                onClientClick={handleClientClick}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default Financeiro;
