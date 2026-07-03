import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, User, Package, Calendar, FileText, Loader2, Gift, Search, ChevronDown } from 'lucide-react';
import { DateTime } from 'luxon';
import { toast } from 'react-toastify';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import SlotPicker from './SlotPicker';

function QuickAppointmentModal({
    isOpen,
    onClose,
    selectedDate,
    clientes,
    onSubmit
}) {
    const { isDarkMode } = useTheme();
    const { isAdmin } = useAuth();
    const [loading, setLoading] = useState(false);
    const [loadingPacotes, setLoadingPacotes] = useState(false);
    const [pacotesDoCliente, setPacotesDoCliente] = useState([]);
    const [clientSearch, setClientSearch] = useState('');
    const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
    // F04 — data escolhida (o horário vem do SlotPicker) + toggle de força (admin).
    const [dataDia, setDataDia] = useState('');
    const [forcarEncaixe, setForcarEncaixe] = useState(false);
    const searchRef = useRef(null);
    const [formData, setFormData] = useState({
        cliente: '',
        pacote: '',
        dataHora: '',
        observacoes: '',
        servicoAvulsoNome: '',
        servicoAvulsoValor: '',
        servicoOfertaNome: ''
    });
    const [serviceMode, setServiceMode] = useState('pacote');
    // F04 — erro de validação client-side (o `required` nativo desapareceu com o
    // SlotPicker; sem isto o submit falhava em silêncio, sem qualquer feedback).
    const [formError, setFormError] = useState('');

    // F04 — semeia apenas a DATA a partir de selectedDate; o horário vem do SlotPicker.
    useEffect(() => {
        if (selectedDate) {
            const dt = DateTime.fromISO(selectedDate, { zone: 'Europe/Lisbon' });
            setDataDia(dt.toISODate() ?? '');
            setFormData(prev => ({ ...prev, dataHora: '' }));
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
                servicoAvulsoValor: '',
                servicoOfertaNome: ''
            });
            setServiceMode('pacote');
            setPacotesDoCliente([]);
            setLoadingPacotes(false);
            setClientSearch('');
            setIsClientSearchOpen(false);
            setDataDia('');
            setForcarEncaixe(false);
        }
    }, [isOpen]);

    useEffect(() => {
        let cancelled = false;

        async function fetchPacotesDoCliente() {
            if (!isOpen || !formData.cliente) {
                setPacotesDoCliente([]);
                setFormData(prev => ({ ...prev, pacote: '' }));
                return;
            }

            setLoadingPacotes(true);
            setFormData(prev => ({ ...prev, pacote: '' }));

            try {
                const res = await api.get(`/compras-pacotes/cliente/${formData.cliente}`);
                if (cancelled) return;

                const pacotesAtivos = (res.data || []).filter(
                    (cp) => cp.status === 'Ativo' && cp.sessoesRestantes > 0
                );

                setPacotesDoCliente(pacotesAtivos);

                if (pacotesAtivos.length === 1) {
                    setFormData(prev => ({ ...prev, pacote: pacotesAtivos[0]._id }));
                    setServiceMode('pacote');
                } else if (pacotesAtivos.length === 0) {
                    setServiceMode(prev => (prev === 'pacote' ? 'oferta' : prev));
                    toast.info('Cliente sem pacotes ativos. Pode agendar uma oferta ou serviço avulso.', { autoClose: 5000 });
                }
            } catch {
                if (!cancelled) {
                    setPacotesDoCliente([]);
                    toast.error('Erro ao carregar pacotes do cliente');
                }
            } finally {
                if (!cancelled) setLoadingPacotes(false);
            }
        }

        fetchPacotesDoCliente();

        return () => {
            cancelled = true;
        };
    }, [formData.cliente, isOpen]);

    const normalizeSearch = (value = '') =>
        value
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const selectedCliente = clientes.find((cliente) => cliente._id === formData.cliente);
    const normalizedClientSearch = normalizeSearch(clientSearch);
    const filteredClientes = useMemo(() => {
        // Campo vazio: lista todos os clientes (já ordenados a montante) para
        // permitir navegar/escolher sem precisar de escrever — comportamento combobox.
        if (!normalizedClientSearch) return clientes;

        return clientes
            .map((cliente) => {
                const nome = normalizeSearch(cliente.nome);
                const telefone = normalizeSearch(cliente.telefone);
                const email = normalizeSearch(cliente.email);
                const startsWithName = nome.startsWith(normalizedClientSearch);
                const matches = startsWithName
                    || nome.includes(normalizedClientSearch)
                    || telefone.includes(normalizedClientSearch)
                    || email.includes(normalizedClientSearch);

                return { cliente, matches, startsWithName };
            })
            .filter(({ matches }) => matches)
            .sort((a, b) => {
                if (a.startsWithName !== b.startsWithName) return a.startsWithName ? -1 : 1;
                return (a.cliente.nome || '').localeCompare(b.cliente.nome || '', 'pt-PT', { sensitivity: 'base' });
            })
            .map(({ cliente }) => cliente);
    }, [clientes, normalizedClientSearch]);

    // Fechar a lista de resultados ao tocar/clicar fora (essencial em mobile).
    useEffect(() => {
        if (!isClientSearchOpen) return;
        const handleOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsClientSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isClientSearchOpen]);

    // F04 — horário seleccionado ("HH:mm") derivado do dataHora composto.
    const horaSelecionada = useMemo(() => {
        if (!dataDia || !formData.dataHora) return null;
        const [d, t] = formData.dataHora.split('T');
        return d === dataDia && t ? t.slice(0, 5) : null;
    }, [dataDia, formData.dataHora]);

    const hojeISO = DateTime.now().setZone('Europe/Lisbon').toISODate();

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDataDia = (nova) => {
        setDataDia(nova);
        setFormData(prev => ({ ...prev, dataHora: '' }));
        setFormError('');
    };

    const handleSlot = (hora) => {
        // `hora` pode vir vazio (input "Hora manual" limpo) — sem esta guarda,
        // compunha-se "YYYY-MM-DDT" (truthy) que passava a validação e chegava
        // malformado ao backend.
        setFormData(prev => ({ ...prev, dataHora: dataDia && hora ? `${dataDia}T${hora}` : '' }));
        setFormError('');
    };

    const handleClientSearchChange = (e) => {
        setClientSearch(e.target.value);
        setIsClientSearchOpen(true);

        if (formData.cliente) {
            setFormData(prev => ({ ...prev, cliente: '', pacote: '' }));
            setPacotesDoCliente([]);
        }
    };

    const handleSelectCliente = (cliente) => {
        setFormData(prev => ({ ...prev, cliente: cliente._id, pacote: '' }));
        setClientSearch(cliente.nome || '');
        setIsClientSearchOpen(false);
    };

    const handleClearCliente = () => {
        setFormData(prev => ({ ...prev, cliente: '', pacote: '' }));
        setClientSearch('');
        setPacotesDoCliente([]);
        setIsClientSearchOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validação client-side com feedback inline (o `required` nativo
        // desapareceu com o SlotPicker — nunca falhar em silêncio).
        if (!formData.cliente) {
            setFormError('Selecione um cliente.');
            return;
        }

        if (!formData.dataHora) {
            setFormError(dataDia ? 'Escolha um horário disponível.' : 'Escolha a data e o horário.');
            return;
        }

        if (serviceMode === 'pacote' && !formData.pacote) {
            setFormError('Selecione o pacote do cliente.');
            return;
        }

        if (serviceMode === 'avulso' && (!formData.servicoAvulsoNome || !formData.servicoAvulsoValor)) {
            setFormError('Preencha o nome e o valor do serviço avulso.');
            return;
        }

        if (serviceMode === 'oferta' && !formData.servicoOfertaNome.trim()) {
            setFormError('Preencha o nome da oferta.');
            return;
        }

        setFormError('');
        setLoading(true);
        try {
            const submitData = {
                cliente: formData.cliente,
                dataHora: formData.dataHora,
                observacoes: formData.observacoes,
                // F05 — sem este flag o backend rejeita horários fora da
                // disponibilidade mesmo com o toggle de encaixe ligado.
                ...(forcarEncaixe && { forcarEncaixe: true })
            };

            if (serviceMode === 'avulso') {
                submitData.servicoTipo = 'avulso';
                submitData.servicoAvulsoNome = formData.servicoAvulsoNome;
                submitData.servicoAvulsoValor = parseFloat(formData.servicoAvulsoValor);
            } else if (serviceMode === 'oferta') {
                submitData.servicoTipo = 'oferta';
                submitData.servicoAvulsoNome = formData.servicoOfertaNome.trim();
                submitData.servicoAvulsoValor = 0;
            } else {
                submitData.servicoTipo = 'pacote';
                submitData.compraPacote = formData.pacote;
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

    // createPortal → document.body: `position: fixed` deixa de depender dos
    // ancestrais da página (um transform/filter num deles reposicionava o
    // modal para fora do ecrã). Em mobile é bottom-sheet (items-end) para as
    // acções ficarem sempre visíveis; ≥sm volta a ser card centrado.
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className={`relative w-full max-w-md max-h-[92dvh] sm:max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-2xl ${bgClass} border ${borderClass} shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]`}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
                    <h2 className={`text-lg font-semibold ${textClass}`}>Novo Agendamento Rápido</h2>
                    <button
                        onClick={onClose}
                        className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                    >
                        <X className={`w-5 h-5 ${subtextClass}`} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto min-h-0">
                    {/* Client Search */}
                    <div ref={searchRef}>
                        <label htmlFor="quick-client-search" className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                            <User className="w-4 h-4" />
                            Cliente *
                        </label>
                        <div className="relative">
                            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${subtextClass}`} />
                            <input
                                id="quick-client-search"
                                type="text"
                                value={clientSearch}
                                onChange={handleClientSearchChange}
                                onFocus={() => setIsClientSearchOpen(true)}
                                placeholder="Digite nome, telefone ou email"
                                autoComplete="off"
                                aria-expanded={isClientSearchOpen}
                                aria-controls="quick-client-results"
                                className={`w-full pl-9 pr-11 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
                            />
                            {clientSearch ? (
                                <button
                                    type="button"
                                    onClick={handleClearCliente}
                                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                                    aria-label="Limpar cliente selecionado"
                                >
                                    <X className={`w-4 h-4 ${subtextClass}`} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsClientSearchOpen(prev => !prev)}
                                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                                    aria-label="Mostrar todos os clientes"
                                >
                                    <ChevronDown className={`w-4 h-4 ${subtextClass} transition-transform ${isClientSearchOpen ? 'rotate-180' : ''}`} />
                                </button>
                            )}
                        </div>

                        {formData.cliente && selectedCliente && (
                            <p className={`mt-2 text-xs ${subtextClass}`}>
                                Selecionado: <span className={textClass}>{selectedCliente.nome}</span>
                            </p>
                        )}

                        {isClientSearchOpen && !formData.cliente && (
                            <div
                                id="quick-client-results"
                                className={`mt-2 max-h-56 overflow-y-auto rounded-xl border ${borderClass} ${isDarkMode ? 'bg-slate-900' : 'bg-white'} shadow-lg`}
                            >
                                {filteredClientes.length > 0 ? (
                                    filteredClientes.map(cliente => (
                                        <button
                                            type="button"
                                            key={cliente._id}
                                            onClick={() => handleSelectCliente(cliente)}
                                            className={`w-full text-left px-3 py-3 border-b last:border-b-0 ${borderClass} ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-50'} transition-colors`}
                                        >
                                            <span className={`block text-sm font-semibold ${textClass}`}>
                                                {cliente.nome}
                                            </span>
                                            <span className={`block text-xs ${subtextClass} mt-0.5`}>
                                                {[cliente.telefone, cliente.email].filter(Boolean).join(' · ') || 'Sem contacto registado'}
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <div className={`px-3 py-3 text-sm ${subtextClass}`}>
                                        {clientSearch ? 'Nenhum cliente encontrado.' : 'Sem clientes registados.'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Service Type Toggle */}
                    <div className={`grid grid-cols-3 gap-2 p-1 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                        <button
                            type="button"
                            onClick={() => setServiceMode('pacote')}
                            disabled={!formData.cliente || loadingPacotes || pacotesDoCliente.length === 0}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${serviceMode === 'pacote'
                                ? 'bg-linear-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                : `${subtextClass} disabled:opacity-50 disabled:cursor-not-allowed`
                                }`}
                        >
                            <Package className="w-4 h-4" />
                            Pacote
                        </button>
                        <button
                            type="button"
                            onClick={() => setServiceMode('avulso')}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${serviceMode === 'avulso'
                                ? 'bg-linear-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                : `${subtextClass}`
                                }`}
                        >
                            Avulso
                        </button>
                        <button
                            type="button"
                            onClick={() => setServiceMode('oferta')}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${serviceMode === 'oferta'
                                ? 'bg-linear-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                                : `${subtextClass}`
                                }`}
                        >
                            <Gift className="w-4 h-4" />
                            Oferta
                        </button>
                    </div>

                    {formData.cliente && loadingPacotes && (
                        <div className={`flex items-center gap-2 text-sm ${subtextClass}`}>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Carregando pacotes do cliente...
                        </div>
                    )}

                    {formData.cliente && !loadingPacotes && pacotesDoCliente.length === 0 && (
                        <div className={`rounded-xl border ${isDarkMode ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-800'} px-3 py-2 text-sm`}>
                            Cliente sem pacote ativo com sessões disponíveis.
                        </div>
                    )}

                    {/* Package Select or Avulso Fields */}
                    {serviceMode === 'pacote' ? (
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                                <Package className="w-4 h-4" />
                                Pacote contratado *
                            </label>
                            <select
                                name="pacote"
                                value={formData.pacote}
                                onChange={handleChange}
                                required={serviceMode === 'pacote'}
                                disabled={!formData.cliente || loadingPacotes || pacotesDoCliente.length === 0}
                                className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
                            >
                                <option value="">
                                    {formData.cliente ? 'Selecione o pacote contratado' : 'Selecione primeiro um cliente'}
                                </option>
                                {pacotesDoCliente.map(compra => (
                                    <option key={compra._id} value={compra._id}>
                                        {compra.pacote?.nome || 'Pacote'} - {compra.sessoesRestantes} {compra.sessoesRestantes === 1 ? 'sessão restante' : 'sessões restantes'}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : serviceMode === 'avulso' ? (
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
                                    required={serviceMode === 'avulso'}
                                    className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
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
                                    required={serviceMode === 'avulso'}
                                    className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                                <Gift className="w-4 h-4" />
                                Serviço ofertado *
                            </label>
                            <input
                                type="text"
                                name="servicoOfertaNome"
                                value={formData.servicoOfertaNome}
                                onChange={handleChange}
                                placeholder="Ex: Sessão cortesia"
                                required={serviceMode === 'oferta'}
                                className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500`}
                            />
                            <p className={`mt-2 text-xs ${subtextClass}`}>
                                Oferta sem cobrança. O atendimento fica registado, mas não entra no faturamento.
                            </p>
                        </div>
                    )}

                    {/* Date & Slot Picker (F04) */}
                    <div>
                        <label className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                            <Calendar className="w-4 h-4" />
                            Data *
                        </label>
                        <input
                            type="date"
                            name="dataDia"
                            value={dataDia}
                            min={hojeISO}
                            onChange={(e) => handleDataDia(e.target.value)}
                            className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} focus:outline-hidden focus:ring-2 focus:ring-indigo-500`}
                        />
                        <div className="mt-3">
                            <span className={`flex items-center gap-2 text-sm font-medium ${subtextClass} mb-2`}>
                                Horário *
                            </span>
                            <SlotPicker
                                date={dataDia}
                                value={horaSelecionada}
                                onChange={handleSlot}
                                allowForce={forcarEncaixe}
                                onForceToggle={isAdmin ? setForcarEncaixe : undefined}
                                isDarkMode={isDarkMode}
                            />
                        </div>
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
                            className={`w-full px-3 py-2.5 rounded-xl border ${inputBgClass} ${textClass} placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none`}
                        />
                    </div>

                    {/* Erro de validação client-side (inline, junto às ações) */}
                    {formError && (
                        <p role="alert" className="text-red-400 text-sm">
                            {formError}
                        </p>
                    )}

                    {/* Actions — sticky no fundo da área scrollável para nunca
                        ficarem cortadas/fora do ecrã em ecrãs baixos. */}
                    <div className={`sticky bottom-0 -mx-4 -mb-4 mt-2 px-4 py-3 ${bgClass} border-t ${borderClass} flex items-center gap-3`}>
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
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-purple-600 text-white font-medium hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>,
        document.body
    );
}

export default QuickAppointmentModal;
