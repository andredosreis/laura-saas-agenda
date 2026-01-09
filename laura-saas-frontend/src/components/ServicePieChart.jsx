import { useMemo } from 'react';
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

// Color palette for services
const COLORS = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#14b8a6', // Teal
    '#f59e0b', // Amber
    '#22c55e', // Green
    '#ec4899', // Pink
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#84cc16'  // Lime
];

function ServicePieChart({ data = [], isLoading = false }) {
    const { isDarkMode } = useTheme();

    // Format data for chart
    const chartData = useMemo(() => {
        return data.map((item, idx) => ({
            name: item.nome,
            value: item.receita,
            quantidade: item.quantidade,
            percentual: item.percentual,
            fill: COLORS[idx % COLORS.length]
        }));
    }, [data]);

    // Custom tooltip
    const CustomTooltip = ({ active, payload }) => {
        if (!active || !payload?.length) return null;

        const item = payload[0].payload;

        return (
            <div className={`p-3 rounded-xl border shadow-xl ${isDarkMode
                    ? 'bg-slate-800 border-white/10'
                    : 'bg-white border-slate-200'
                }`}>
                <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {item.name}
                </p>
                <div className="mt-2 space-y-1">
                    <p className="text-sm">
                        <span className="text-indigo-400">Receita:</span>{' '}
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>
                            €{item.value?.toFixed(2)}
                        </span>
                    </p>
                    <p className="text-sm">
                        <span className="text-purple-400">Quantidade:</span>{' '}
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>
                            {item.quantidade}
                        </span>
                    </p>
                    <p className="text-sm">
                        <span className="text-teal-400">Percentual:</span>{' '}
                        <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>
                            {item.percentual}%
                        </span>
                    </p>
                </div>
            </div>
        );
    };

    // Custom legend
    const renderLegend = (props) => {
        const { payload } = props;

        return (
            <div className="flex flex-wrap justify-center gap-3 mt-4">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {entry.value}
                        </span>
                    </div>
                ))}
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
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="45%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        animationDuration={500}
                        animationBegin={0}
                    >
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.fill}
                                stroke={isDarkMode ? '#1e293b' : '#fff'}
                                strokeWidth={2}
                            />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend content={renderLegend} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

export default ServicePieChart;
