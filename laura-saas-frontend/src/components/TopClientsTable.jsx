import { Loader2, Trophy, Medal, Award, User, Phone, Mail } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const RANKING_STYLES = {
    1: { icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500/20' },
    2: { icon: Medal, color: 'text-slate-300', bg: 'bg-slate-400/20' },
    3: { icon: Award, color: 'text-orange-400', bg: 'bg-orange-500/20' }
};

function TopClientsTable({ clientes = [], isLoading = false, onClientClick }) {
    const { isDarkMode } = useTheme();

    const bgClass = isDarkMode ? 'bg-white/5' : 'bg-slate-50';
    const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
    const subtextClass = isDarkMode ? 'text-slate-400' : 'text-slate-600';
    const borderClass = isDarkMode ? 'border-white/10' : 'border-slate-200';

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className={`w-8 h-8 animate-spin ${subtextClass}`} />
            </div>
        );
    }

    if (!clientes.length) {
        return (
            <div className="flex items-center justify-center h-48">
                <p className={subtextClass}>Sem dados para exibir</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className={`border-b ${borderClass}`}>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subtextClass}`}>
                            Ranking
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${subtextClass}`}>
                            Cliente
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subtextClass}`}>
                            Receita
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subtextClass} hidden sm:table-cell`}>
                            Agendamentos
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider ${subtextClass} hidden md:table-cell`}>
                            Ticket Médio
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {clientes.map((cliente) => {
                        const rankStyle = RANKING_STYLES[cliente.ranking];
                        const RankIcon = rankStyle?.icon || null;

                        return (
                            <tr
                                key={cliente.clienteId}
                                onClick={() => onClientClick?.(cliente.clienteId)}
                                className={`${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-colors ${onClientClick ? 'cursor-pointer' : ''}`}
                            >
                                {/* Ranking */}
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-2">
                                        {RankIcon ? (
                                            <div className={`w-8 h-8 rounded-lg ${rankStyle.bg} flex items-center justify-center`}>
                                                <RankIcon className={`w-4 h-4 ${rankStyle.color}`} />
                                            </div>
                                        ) : (
                                            <div className={`w-8 h-8 rounded-lg ${bgClass} flex items-center justify-center`}>
                                                <span className={`text-sm font-semibold ${subtextClass}`}>
                                                    #{cliente.ranking}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </td>

                                {/* Cliente Info */}
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0`}>
                                            <User className="w-5 h-5 text-indigo-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`font-medium ${textClass} truncate`}>{cliente.nome}</p>
                                            <div className="flex items-center gap-3 mt-0.5">
                                                {cliente.telefone && (
                                                    <span className={`text-xs ${subtextClass} flex items-center gap-1`}>
                                                        <Phone className="w-3 h-3" />
                                                        <span className="hidden sm:inline">{cliente.telefone}</span>
                                                    </span>
                                                )}
                                                {cliente.email && (
                                                    <span className={`text-xs ${subtextClass} flex items-center gap-1 hidden md:flex`}>
                                                        <Mail className="w-3 h-3" />
                                                        <span className="truncate max-w-[150px]">{cliente.email}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>

                                {/* Receita */}
                                <td className="px-4 py-4 text-right">
                                    <span className={`font-semibold ${cliente.ranking <= 3 ? 'text-green-400' : textClass}`}>
                                        €{cliente.receita?.toFixed(2)}
                                    </span>
                                </td>

                                {/* Agendamentos */}
                                <td className="px-4 py-4 text-right hidden sm:table-cell">
                                    <span className={subtextClass}>{cliente.agendamentos}</span>
                                </td>

                                {/* Ticket Médio */}
                                <td className="px-4 py-4 text-right hidden md:table-cell">
                                    <span className={subtextClass}>€{cliente.ticketMedio?.toFixed(2)}</span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default TopClientsTable;
