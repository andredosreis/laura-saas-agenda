import React from 'react';

/**
 * SkeletonCard - Componente de loading com efeito shimmer
 * Usado para exibir placeholders enquanto os dados carregam
 */

// Skeleton Base
export const Skeleton = ({ className = '', ...props }) => (
    <div className={`skeleton ${className}`} {...props} />
);

// Skeleton para KPI Cards
export const SkeletonKPI = () => (
    <div className="glass-card p-6 animate-pulse">
        <div className="skeleton w-12 h-12 rounded-xl mb-4" />
        <div className="skeleton h-8 w-24 mb-2" />
        <div className="skeleton h-4 w-32" />
    </div>
);

// Skeleton para Cards de Agendamento
export const SkeletonAgendamento = () => (
    <div className="glass-card overflow-hidden animate-pulse">
        <div className="p-3 border-b border-white/5">
            <div className="flex justify-between items-center">
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-5 w-20 rounded-full" />
            </div>
        </div>
        <div className="p-4 space-y-3">
            <div className="skeleton h-5 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
        </div>
        <div className="p-3 border-t border-white/5">
            <div className="skeleton h-8 w-full rounded-lg" />
        </div>
    </div>
);

// Skeleton para Lista de Clientes com Sessões Baixas
export const SkeletonClienteAlerta = () => (
    <div className="glass-card p-4 flex items-center justify-between animate-pulse">
        <div className="flex items-center gap-4">
            <div className="skeleton w-10 h-10 rounded-full" />
            <div className="space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-24" />
            </div>
        </div>
        <div className="skeleton h-8 w-16 rounded-lg" />
    </div>
);

// Grid de Skeletons para KPIs
export const SkeletonKPIGrid = ({ count = 5 }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonKPI key={i} />
        ))}
    </div>
);

// Grid de Skeletons para Agendamentos
export const SkeletonAgendamentoGrid = ({ count = 4 }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
            <SkeletonAgendamento key={i} />
        ))}
    </div>
);

export default {
    Skeleton,
    SkeletonKPI,
    SkeletonAgendamento,
    SkeletonClienteAlerta,
    SkeletonKPIGrid,
    SkeletonAgendamentoGrid,
};
