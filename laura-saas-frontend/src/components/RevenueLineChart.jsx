import { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

function RevenueLineChart({ data = [], periodo = 'dia', isLoading = false }) {
    const { isDarkMode } = useTheme();

    // Memoize formatted data
    const chartData = useMemo(() => {
        return data.map(item => ({
            ...item,
            receitaFormatted: `€${item.receita?.toFixed(2) || '0.00'}`
        }));
    }, [data]);

    // Custom tooltip
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;

        const item = payload[0].payload;

        return (
            <div className={`p-3 rounded-xl border shadow-xl ${isDarkMode
                    ? 'bg-slate-800 border-white/10'
                    : 'bg-white border-slate-200'
                }`}>
                <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {label}
                </p>
                <div className="mt-2 space-y-1">
                    <p className="text-sm">
                        <span className="text-indigo-400">Receita:</span>{' '}
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>
                            €{item.receita?.toFixed(2)}
                        </span>
                    </p>
                    <p className="text-sm">
                        <span className="text-purple-400">Agendamentos:</span>{' '}
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>
                            {item.agendamentos}
                        </span>
                    </p>
                    <p className="text-sm">
                        <span className="text-teal-400">Média:</span>{' '}
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>
                            €{item.media?.toFixed(2)}
                        </span>
                    </p>
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className={`w-8 h-8 animate-spin ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            </div>
        );
    }

    if (!data.length) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
                    Sem dados para exibir
                </p>
            </div>
        );
    }

    return (
        <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                        vertical={false}
                    />
                    <XAxis
                        dataKey="data"
                        tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
                        axisLine={{ stroke: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `€${value}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="receita"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fill="url(#colorReceita)"
                        dot={false}
                        activeDot={{
                            r: 6,
                            fill: '#6366f1',
                            stroke: '#fff',
                            strokeWidth: 2
                        }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

export default RevenueLineChart;
