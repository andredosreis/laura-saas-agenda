import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const DashboardChart = ({ data }) => {
    // Dados padrão se não houver dados reais
    const defaultData = [
        { name: 'Seg', atendimentos: 4 },
        { name: 'Ter', atendimentos: 6 },
        { name: 'Qua', atendimentos: 8 },
        { name: 'Qui', atendimentos: 5 },
        { name: 'Sex', atendimentos: 10 },
        { name: 'Sáb', atendimentos: 12 },
    ];

    const chartData = data && data.length > 0 ? data : defaultData;

    return (
        <div className="w-full h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                        dy={10}
                    />
                    <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        contentStyle={{
                            backgroundColor: '#1e293b',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '12px',
                            color: '#fff',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                    />
                    <Bar
                        dataKey="atendimentos"
                        radius={[6, 6, 0, 0]}
                        animationDuration={1500}
                    >
                        {chartData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={index === chartData.length - 1 ? '#6366f1' : '#475569'}
                                className="transition-all duration-300 hover:opacity-80"
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default DashboardChart;
