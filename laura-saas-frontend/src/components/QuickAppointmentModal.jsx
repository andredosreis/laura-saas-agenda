import { useState, useEffect } from 'react';
import { X, User, Package, Calendar, Clock, FileText, Loader2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { useTheme } from '../contexts/ThemeContext';

function QuickAppointmentModal({
    isOpen,
    onClose,
    selectedDate,
    clientes,
    pacotes,
    onSubmit
}) {
    const { isDarkMode } = useTheme();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        cliente: '',
        pacote: '',
        dataHora: '',
        observacoes: '',
        servicoAvulsoNome: '',
        servicoAvulsoValor: ''
    });
    const [useAvulso, setUseAvulso] = useState(false);

    // Update date when selectedDate changes
    useEffect(() => {
        if (selectedDate) {
            const dt = DateTime.fromISO(selectedDate, { zone: 'Europe/Lisbon' });
            setFormData(prev => ({
                ...prev,
                dataHora: dt.toFormat("yyyy-MM-dd'T'HH:mm")
            }));
        }
    }, [selectedDate]);

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setFormData({
                cliente: '',
                pacote: '',
                dataHora: '',
                observacoes: '',
                servicoAvulsoNome: '',
                servicoAvulsoValor: ''
            });
            setUseAvulso(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.cliente) {
            return;
        }

        if (!useAvulso && !formData.pacote) {
            return;
        }

        if (useAvulso && (!formData.servicoAvulsoNome || !formData.servicoAvulsoValor)) {
            return;
        }

        setLoading(true);
        try {
            const submitData = {
                cliente: formData.cliente,
                dataHora: formData.dataHora,
                observacoes: formData.observacoes,
                status: 'Agendado'
            };

            if (useAvulso) {
                submitData.servicoAvulsoNome = formData.servicoAvulsoNome;
                submitData.servicoAvulsoValor = parseFloat(formData.servicoAvulsoValor);
            } else {
                submitData.pacote = formData.pacote;
            }

            await onSubmit(submitData);
        } finally {
            setLoading(false);
        }
    };

    const bgClass = isDarkMode ? 'bg-slate-800' : 'bg-white';
    const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
    const subtextClass = isDarkMode ? 'text-slate-300' : 'text-slate-700';
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
                    <h2 className={`text-lg font-semibold ${textClass}`}>Novo Agendamento Rápido</h2>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                    >
                        <X className={`w-5 h-5 ${subtextClass}`} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Client Select */}
                    <div>
                        <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                            <User className="w-4 h-4" />
                            Cliente *
                        </label>
                        <select
                            name="cliente"
                            value={formData.cliente}
                            onChange={handleChange}
                            required
                            className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        >
                            <option value="">Selecione um cliente</option>
                            {clientes.map(cliente => (
                                <option key={cliente._id} value={cliente._id}>
                                    {cliente.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Service Type Toggle */}
                    <div className={`flex items-center gap-2 p-1 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                        <button
                            type="button"
                            onClick={() => setUseAvulso(false)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${!useAvulso
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                : `${subtextClass}`
                                }`}
                        >
                            Pacote
                        </button>
                        <button
                            type="button"
                            onClick={() => setUseAvulso(true)}
                            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${useAvulso
                                ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                : `${subtextClass}`
                                }`}
                        >
                            Serviço Avulso
                        </button>
                    </div>

                    {/* Package Select or Avulso Fields */}
                    {!useAvulso ? (
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                                <Package className="w-4 h-4" />
                                Pacote *
                            </label>
                            <select
                                name="pacote"
                                value={formData.pacote}
                                onChange={handleChange}
                                required={!useAvulso}
                                className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                            >
                                <option value="">Selecione um pacote</option>
                                {pacotes.map(pacote => (
                                    <option key={pacote._id} value={pacote._id}>
                                        {pacote.nome} - €{pacote.valor?.toFixed(2)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                                    <Package className="w-4 h-4" />
                                    Nome do Serviço *
                                </label>
                                <input
                                    type="text"
                                    name="servicoAvulsoNome"
                                    value={formData.servicoAvulsoNome}
                                    onChange={handleChange}
                                    placeholder="Ex: Massagem Relaxante"
                                    required={useAvulso}
                                    className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder:${subtextClass} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                                    € Valor *
                                </label>
                                <input
                                    type="number"
                                    name="servicoAvulsoValor"
                                    value={formData.servicoAvulsoValor}
                                    onChange={handleChange}
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    required={useAvulso}
                                    className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder:${subtextClass} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                                />
                            </div>
                        </div>
                    )}

                    {/* Date & Time */}
                    <div>
                        <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                            <Calendar className="w-4 h-4" />
                            Data e Hora *
                        </label>
                        <input
                            type="datetime-local"
                            name="dataHora"
                            value={formData.dataHora}
                            onChange={handleChange}
                            required
                            className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
                        />
                    </div>

                    {/* Notes */}
                    <div>
                        <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                            <FileText className="w-4 h-4" />
                            Observações
                        </label>
                        <textarea
                            name="observacoes"
                            value={formData.observacoes}
                            onChange={handleChange}
                            placeholder="Observações adicionais..."
                            rows={2}
                            className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder:${subtextClass} focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none`}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex-1 px-4 py-2.5 rounded-xl border ${borderClass} ${textClass} hover:bg-white/5 transition-colors`}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                'Criar Agendamento'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default QuickAppointmentModal;
