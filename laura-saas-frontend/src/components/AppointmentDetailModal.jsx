import { X, User, Package, Calendar, Clock, Edit, Trash2, CheckCircle, XCircle, AlertTriangle, MessageCircle } from 'lucide-react';
import { DateTime } from 'luxon';
import { useTheme } from '../contexts/ThemeContext';

const STATUS_OPTIONS = [
    { value: 'Agendado', label: 'Agendado', color: 'blue' },
    { value: 'Confirmado', label: 'Confirmado', color: 'teal' },
    { value: 'Realizado', label: 'Realizado', color: 'green' },
    { value: 'Cancelado', label: 'Cancelado', color: 'red' },
    { value: 'Não Compareceu', label: 'Não Compareceu', color: 'amber' },
    { value: 'Remarcado', label: 'Remarcado', color: 'purple' }
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

    if (!isOpen || !appointment) return null;

    const dateTime = DateTime.fromISO(appointment.dataHora, { zone: 'Europe/Lisbon' });
    const formattedDate = dateTime.toFormat("EEEE, dd 'de' MMMM", { locale: 'pt' });
    const formattedTime = dateTime.toFormat('HH:mm');

    const currentStatus = STATUS_OPTIONS.find(s => s.value === appointment.status) || STATUS_OPTIONS[0];

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
                        <div>
                            <p className={`font-semibold ${textClass}`}>
                                {appointment.cliente?.nome || 'Cliente não identificado'}
                            </p>
                            <p className={`text-sm ${subtextClass}`}>
                                {appointment.cliente?.telefone || 'Sem telefone'}
                            </p>
                        </div>
                    </div>

                    {/* Service Info */}
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <Package className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className={`font-semibold ${textClass}`}>
                                {appointment.pacote?.nome || appointment.servicoAvulsoNome || 'Serviço'}
                            </p>
                            {appointment.pacote && (
                                <p className={`text-sm ${subtextClass}`}>
                                    Sessão {(() => {
                                        // Calcular sessão atual: total - restantes + 1
                                        const totalSessoes = appointment.pacote.sessoes || 0;
                                        const sessoesRestantes = appointment.cliente?.sessoesRestantes ?? totalSessoes;
                                        const sessaoAtual = totalSessoes - sessoesRestantes + 1;
                                        return sessaoAtual > 0 ? sessaoAtual : 1;
                                    })()} de {appointment.pacote.sessoes || '?'}
                                </p>
                            )}
                            {appointment.servicoAvulsoValor && (
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

                    {/* Current Status */}
                    <div>
                        <p className={`text-sm font-medium ${subtextClass} mb-2`}>Status Atual</p>
                        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${getStatusColor(currentStatus.color)}`}>
                            {currentStatus.label}
                        </span>
                    </div>

                    {/* Observations */}
                    {appointment.observacoes && (
                        <div>
                            <p className={`text-sm font-medium ${subtextClass} mb-2`}>Observações</p>
                            <p className={`text-sm ${textClass} p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                                {appointment.observacoes}
                            </p>
                        </div>
                    )}

                    {/* Status Change Buttons */}
                    <div>
                        <p className={`text-sm font-medium ${subtextClass} mb-2`}>Alterar Status</p>
                        <div className="flex flex-wrap gap-2">
                            {STATUS_OPTIONS.filter(s => s.value !== appointment.status).map(status => (
                                <button
                                    key={status.value}
                                    onClick={() => onUpdateStatus(appointment._id || appointment.id, status.value)}
                                    className={`px-3 py-1.5 text-sm rounded-lg border transition-all hover:scale-105 ${getStatusColor(status.color)}`}
                                >
                                    {status.label}
                                </button>
                            ))}
                        </div>
                    </div>
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
                            const phone = appointment.cliente?.telefone?.replace(/\D/g, '');
                            if (phone) {
                                const clientName = appointment.cliente?.nome || 'Cliente';
                                const serviceName = appointment.pacote?.nome || appointment.servicoAvulsoNome || 'Serviço';
                                const message = encodeURIComponent(
                                    `Olá ${clientName}! 👋\n\n` +
                                    `Lembrete do seu agendamento:\n` +
                                    `📅 ${formattedDate}\n` +
                                    `🕐 ${formattedTime}\n` +
                                    `💆 ${serviceName}\n\n` +
                                    `Confirma a sua presença? 😊`
                                );
                                window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
                            }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/20 text-green-400 rounded-xl hover:bg-green-500/30 transition-colors"
                    >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                    </button>
                    <button
                        onClick={() => onDelete(appointment._id || appointment.id)}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AppointmentDetailModal;
