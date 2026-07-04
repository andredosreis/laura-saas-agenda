import { useEffect, useState } from 'react';
import { X, User, Package, Calendar, Clock, Edit, Trash2, MessageCircle, Gift } from 'lucide-react';
import { DateTime } from 'luxon';
import { useTheme } from '../contexts/ThemeContext';
import { nomeServicoAgendamento } from '../utils/agendamento';

// Texto boilerplate gravado pela IA nas observações — redundante no modal
// quando já mostramos o chip "🤖 Marcada pela IA".
const OBS_BOILERPLATE_IA = 'Marcação criada automaticamente pelo agent IA';

// Acções primárias por status actual — o passo natural seguinte do fluxo.
// Os restantes statuses ficam atrás de "Mais opções" (7 botões sempre
// visíveis era ruído; marcar "Não Compareceu" antes da sessão não é acção
// primária de ninguém).
const PRIMARY_NEXT = {
    'Agendado': ['Confirmado', 'Cancelado Pelo Cliente'],
    'Confirmado': ['Compareceu', 'Não Compareceu'],
    'Compareceu': ['Realizado'],
    'Realizado': ['Fechado'],
};

const STATUS_OPTIONS = [
    { value: 'Agendado', label: 'Agendado', color: 'blue' },
    { value: 'Confirmado', label: 'Confirmado', color: 'teal' },
    { value: 'Compareceu', label: 'Compareceu', color: 'purple' },
    { value: 'Realizado', label: 'Realizado', color: 'green' },
    { value: 'Fechado', label: 'Fechado', color: 'green' },
    { value: 'Cancelado Pelo Cliente', label: 'Cancelado pelo Cliente', color: 'red' },
    { value: 'Cancelado Pelo Salão', label: 'Cancelado pelo Salão', color: 'red' },
    { value: 'Não Compareceu', label: 'Não Compareceu', color: 'amber' }
];

function AppointmentDetailModal({
    isOpen,
    onClose,
    appointment,
    onUpdateStatus,
    onDelete,
    onEdit
}) {
    const { isDarkMode } = useTheme();
    const [showAllStatus, setShowAllStatus] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // Reset dos estados transitórios ao fechar/trocar de agendamento.
    useEffect(() => {
        setShowAllStatus(false);
        setConfirmingDelete(false);
    }, [isOpen, appointment?._id]);

    if (!isOpen || !appointment) return null;

    const dateTime = DateTime.fromISO(appointment.dataHora, { zone: 'Europe/Lisbon' });
    const formattedDate = dateTime.toFormat("EEEE, dd 'de' MMMM", { locale: 'pt' });
    const formattedTime = dateTime.toFormat('HH:mm');

    const currentStatus = STATUS_OPTIONS.find(s => s.value === appointment.status) || STATUS_OPTIONS[0];

    // Marcações de leads (avaliações via IA) não têm Cliente — o contacto
    // vem embebido em appointment.lead.
    const isLead = !appointment.cliente?.nome && Boolean(appointment.lead?.nome || appointment.lead?.telefone);
    const nomeContacto = appointment.cliente?.nome || appointment.lead?.nome || 'Cliente não identificado';
    const telefoneContacto = appointment.cliente?.telefone || appointment.lead?.telefone || null;
    const servicoNome = nomeServicoAgendamento(appointment);

    // "Sessão X de Y" só quando há compraPacote populada — os contadores
    // vivem lá (sessoesUsadas/Contratadas), não no cliente.
    const compra = appointment.compraPacote;
    const sessaoInfo = compra?.sessoesContratadas
        ? `Sessão ${Math.min((compra.sessoesUsadas ?? 0) + 1, compra.sessoesContratadas)} de ${compra.sessoesContratadas}`
        : null;

    // Observações: esconder o boilerplate da IA (o chip 🤖 já o diz).
    const observacoesVisiveis = appointment.observacoes
        ?.split('\n')
        .filter((linha) => !linha.startsWith(OBS_BOILERPLATE_IA))
        .join('\n')
        .trim();

    // Confirmação WhatsApp (mesmos chips dos cards de Agendamentos).
    const conf = appointment.confirmacao?.tipo;

    // Acções de status: primárias do fluxo + restantes atrás de "Mais opções".
    const primarias = STATUS_OPTIONS.filter(
        (s) => (PRIMARY_NEXT[appointment.status] || []).includes(s.value)
    );
    const restantes = STATUS_OPTIONS.filter(
        (s) => s.value !== appointment.status && !(PRIMARY_NEXT[appointment.status] || []).includes(s.value)
    );

    const getStatusColor = (color) => {
        const colors = {
            blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            teal: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
            green: 'bg-green-500/20 text-green-400 border-green-500/30',
            red: 'bg-red-500/20 text-red-400 border-red-500/30',
            amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
        };
        return colors[color] || colors.blue;
    };

    const bgClass = isDarkMode ? 'bg-slate-800' : 'bg-white';
    const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
    const subtextClass = isDarkMode ? 'text-slate-400' : 'text-slate-600';
    const borderClass = isDarkMode ? 'border-white/10' : 'border-slate-200';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className={`relative w-full max-w-md rounded-2xl ${bgClass} border ${borderClass} shadow-2xl overflow-hidden`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className={`text-lg font-semibold ${textClass}`}>Detalhes do Agendamento</h2>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                    >
                        <X className={`w-5 h-5 ${subtextClass}`} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Client Info */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                        <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center">
                            <User className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                            <p className={`font-semibold ${textClass} flex items-center gap-2`}>
                                {nomeContacto}
                                {isLead && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">lead</span>
                                )}
                            </p>
                            <p className={`text-sm ${subtextClass}`}>
                                {telefoneContacto || 'Sem telefone'}
                            </p>
                            {/* Estado num relance: status + confirmação WhatsApp + origem IA */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getStatusColor(currentStatus.color)}`}>
                                    {currentStatus.label}
                                </span>
                                {conf === 'pendente' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                                        ⏳ WhatsApp pendente
                                    </span>
                                )}
                                {conf === 'confirmado' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
                                        ✓ Confirmado no WhatsApp
                                    </span>
                                )}
                                {conf === 'rejeitado' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full border bg-red-500/10 text-red-500 border-red-500/20 font-medium">
                                        ✗ Cancelado no WhatsApp
                                    </span>
                                )}
                                {appointment.criadoPorIA && (
                                    <span className="text-xs px-2 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-medium">
                                        🤖 IA
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Service Info */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <Package className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className={`font-semibold ${textClass}`}>
                                {servicoNome}
                            </p>
                            {sessaoInfo && (
                                <p className={`text-sm ${subtextClass}`}>{sessaoInfo}</p>
                            )}
                            {appointment.servicoTipo === 'oferta' && (
                                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-medium">
                                    <Gift className="w-3 h-3" />
                                    Oferta sem cobrança
                                </span>
                            )}
                            {appointment.servicoTipo !== 'oferta' && appointment.servicoAvulsoValor && (
                                <p className={`text-sm ${subtextClass}`}>
                                    €{Number(appointment.servicoAvulsoValor).toFixed(2)}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className={`flex items-center gap-2 p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                            <Calendar className={`w-5 h-5 ${subtextClass}`} />
                            <div>
                                <p className={`text-xs ${subtextClass}`}>Data</p>
                                <p className={`text-sm font-medium ${textClass}`}>{formattedDate}</p>
                            </div>
                        </div>
                        <div className={`flex items-center gap-2 p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                            <Clock className={`w-5 h-5 ${subtextClass}`} />
                            <div>
                                <p className={`text-xs ${subtextClass}`}>Horário</p>
                                <p className={`text-sm font-medium ${textClass}`}>{formattedTime}</p>
                            </div>
                        </div>
                    </div>

                    {/* Observations (sem o boilerplate da IA — o chip acima já o diz) */}
                    {observacoesVisiveis && (
                        <div>
                            <p className={`text-sm font-medium ${subtextClass} mb-2`}>Observações</p>
                            <p className={`text-sm ${textClass} p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                                {observacoesVisiveis}
                            </p>
                        </div>
                    )}

                    {/* Acções contextuais: o passo seguinte natural do fluxo,
                        com os statuses raros atrás de "Mais opções" */}
                    {(primarias.length > 0 || restantes.length > 0) && (
                        <div>
                            <p className={`text-sm font-medium ${subtextClass} mb-2`}>Ações</p>
                            <div className="flex flex-wrap gap-2">
                                {primarias.map(status => (
                                    <button
                                        key={status.value}
                                        onClick={() => onUpdateStatus(appointment._id || appointment.id, status.value)}
                                        className={`flex-1 min-w-[40%] px-3 py-2.5 text-sm font-medium rounded-xl border transition-all hover:scale-[1.02] ${getStatusColor(status.color)}`}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                            {!showAllStatus && restantes.length > 0 && (
                                <button
                                    onClick={() => setShowAllStatus(true)}
                                    className={`mt-2 text-xs ${subtextClass} hover:underline`}
                                >
                                    Mais opções…
                                </button>
                            )}
                            {showAllStatus && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {restantes.map(status => (
                                        <button
                                            key={status.value}
                                            onClick={() => onUpdateStatus(appointment._id || appointment.id, status.value)}
                                            className={`px-3 py-1.5 text-xs rounded-lg border transition-all hover:scale-105 ${getStatusColor(status.color)}`}
                                        >
                                            {status.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className={`flex items-center gap-3 p-4 border-t ${borderClass}`}>
                    <button
                        onClick={() => onEdit(appointment._id || appointment.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500/30 transition-colors"
                    >
                        <Edit className="w-4 h-4" />
                        Editar
                    </button>
                    <button
                        onClick={() => {
                            const raw = telefoneContacto?.replace(/[\s\-()+]/g, '');
                            const phone = raw
                                ? raw.startsWith('351') ? raw
                                    : (raw.startsWith('9') || raw.startsWith('2')) ? `351${raw}`
                                    : raw
                                : null;
                            if (phone) {
                                const primeiroNome = nomeContacto.split(' ')[0];
                                const message = encodeURIComponent(
                                    `Olá ${primeiroNome}! 👋\n\n` +
                                    `Lembrete do seu agendamento:\n` +
                                    `📅 ${formattedDate}\n` +
                                    `🕐 ${formattedTime}\n` +
                                    `💆 ${servicoNome}\n\n` +
                                    `Confirma a sua presença? 😊`
                                );
                                window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
                            }
                        }}
                        disabled={!telefoneContacto}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/20 text-green-400 rounded-xl hover:bg-green-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-500/20"
                    >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                    </button>
                    {!confirmingDelete ? (
                        <button
                            onClick={() => setConfirmingDelete(true)}
                            title="Eliminar agendamento"
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    ) : (
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => onDelete(appointment._id || appointment.id)}
                                className="flex items-center gap-1.5 px-3 py-2.5 bg-red-500 text-white text-sm font-medium rounded-xl hover:bg-red-600 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                Apagar?
                            </button>
                            <button
                                onClick={() => setConfirmingDelete(false)}
                                className={`p-2.5 rounded-xl ${isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'} transition-colors`}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AppointmentDetailModal;
