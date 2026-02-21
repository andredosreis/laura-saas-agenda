import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CustomTooltip = ({ active, payload, label, isDark }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    return (
        <div className={`px-3 py-2 rounded-xl text-xs shadow-xl ${
            isDark
                ? 'bg-slate-800 border border-white/10 text-white'
                : 'bg-white border border-slate-200 text-slate-900'
        }`}>
            <p className="font-semibold mb-1">{label}</p>
            <p>{d.atendimentos} atendimento{d.atendimentos !== 1 ? 's' : ''}</p>
            {d.receita > 0 && (
                <p className="text-emerald-400">€{d.receita.toFixed(2)}</p>
            )}
        </div>
    );
};

const DashboardChart = ({ data, isDark = true }) => {
    const defaultData = [
        { name: 'Seg', atendimentos: 0, receita: 0, isHoje: false },
        { name: 'Ter', atendimentos: 0, receita: 0, isHoje: false },
        { name: 'Qua', atendimentos: 0, receita: 0, isHoje: false },
        { name: 'Qui', atendimentos: 0, receita: 0, isHoje: false },
        { name: 'Sex', atendimentos: 0, receita: 0, isHoje: false },
        { name: 'Sáb', atendimentos: 0, receita: 0, isHoje: true },
    ];

    const chartData = data && data.length > 0 ? data : defaultData;
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    return (
        <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="30%">
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: tickColor, fontSize: 11 }}
                        dy={8}
                    />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip
                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                        content={<CustomTooltip isDark={isDark} />}
                    />
                    <Bar dataKey="atendimentos" radius={[6, 6, 0, 0]} animationDuration={1200}>
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.isHoje
                                    ? '#6366f1'
                                    : isDark ? '#334155' : '#e2e8f0'
                                }
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default DashboardChart;
