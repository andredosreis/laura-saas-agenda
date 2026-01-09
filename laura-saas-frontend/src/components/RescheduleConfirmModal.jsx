import { useState } from 'react';
import { X, AlertTriangle, Clock, Calendar, ArrowRight, FileText } from 'lucide-react';
import { DateTime } from 'luxon';
import { useTheme } from '../contexts/ThemeContext';

function RescheduleConfirmModal({
    isOpen,
    onClose,
    appointment,
    oldDate,
    newDate,
    conflicts,
    outsideBusinessHours,
    onConfirm
}) {
    const { isDarkMode } = useTheme();
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen || !appointment) return null;

    const oldDateTime = DateTime.fromISO(oldDate, { zone: 'Europe/Lisbon' });
    const newDateTime = DateTime.fromISO(newDate, { zone: 'Europe/Lisbon' });

    const formatDateTime = (dt) => dt.toFormat("dd/MM/yyyy 'às' HH:mm", { locale: 'pt' });

    const hasWarnings = conflicts.length > 0 || outsideBusinessHours;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm(notes);
        } finally {
            setLoading(false);
        }
    };

    const bgClass = isDarkMode ? 'bg-slate-800' : 'bg-white';
    const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
    const subtextClass = isDarkMode ? 'text-slate-400' : 'text-slate-600';
    const borderClass = isDarkMode ? 'border-white/10' : 'border-slate-200';
    const inputBgClass = isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';

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
                    <h2 className={`text-lg font-semibold ${textClass}`}>Confirmar Remarcação</h2>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                    >
                        <X className={`w-5 h-5 ${subtextClass}`} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {/* Client Name */}
                    <div className={`text-center p-3 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                        <p className={`font-semibold ${textClass}`}>
                            {appointment.cliente?.nome || 'Cliente'}
                        </p>
                        <p className={`text-sm ${subtextClass}`}>
                            {appointment.pacote?.nome || appointment.servicoAvulsoNome || 'Serviço'}
                        </p>
                    </div>

                    {/* Date Comparison */}
                    <div className="flex items-center gap-2">
                        <div className={`flex-1 p-3 rounded-xl ${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-red-400" />
                                <span className="text-xs text-red-400">Data Anterior</span>
                            </div>
                            <p className={`text-sm font-medium ${textClass}`}>
                                {formatDateTime(oldDateTime)}
                            </p>
                        </div>
                        <ArrowRight className={`w-5 h-5 ${subtextClass} flex-shrink-0`} />
                        <div className={`flex-1 p-3 rounded-xl ${isDarkMode ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200'} border`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Calendar className="w-4 h-4 text-green-400" />
                                <span className="text-xs text-green-400">Nova Data</span>
                            </div>
                            <p className={`text-sm font-medium ${textClass}`}>
                                {formatDateTime(newDateTime)}
                            </p>
                        </div>
                    </div>

                    {/* Warnings */}
                    {hasWarnings && (
                        <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'} border`}>
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                <span className="font-medium text-amber-400">Atenção</span>
                            </div>
                            <ul className={`text-sm ${subtextClass} space-y-1`}>
                                {outsideBusinessHours && (
                                    <li className="flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        Fora do horário comercial (09:00-19:00)
                                    </li>
                                )}
                                {conflicts.length > 0 && (
                                    <li className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" />
                                        {conflicts.length} conflito(s) de horário detectado(s)
                                    </li>
                                )}
                            </ul>
                            {conflicts.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-amber-500/20">
                                    <p className="text-xs text-amber-400 mb-1">Conflitos:</p>
                                    {conflicts.map((c, idx) => (
                                        <p key={idx} className={`text-xs ${subtextClass}`}>
                                            • {c.cliente?.nome} - {DateTime.fromISO(c.dataHora, { zone: 'Europe/Lisbon' }).toFormat('HH:mm')}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div>
                        <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                            <FileText className="w-4 h-4" />
                            Notas sobre a remarcação (opcional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ex: Cliente solicitou remarcação por telefone"
                            rows={3}
                            className={`w-full px-3 py-2 rounded-xl border ${inputBgClass} ${textClass} placeholder:${subtextClass} focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none`}
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className={`flex items-center gap-3 p-4 border-t ${borderClass}`}>
                    <button
                        onClick={onClose}
                        className={`flex-1 px-4 py-2.5 rounded-xl border ${borderClass} ${textClass} hover:bg-white/5 transition-colors`}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className={`flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${hasWarnings ? 'from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700' : ''}`}
                    >
                        {loading ? 'Salvando...' : hasWarnings ? 'Confirmar Mesmo Assim' : 'Confirmar Remarcação'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default RescheduleConfirmModal;
