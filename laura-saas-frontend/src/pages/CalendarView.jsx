import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import { DateTime } from 'luxon';
import {
    CalendarDays,
    CalendarCheck,
    Clock,
    Loader2,
    RefreshCw,
    Plus,
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import api from '../services/api';
import { toast } from 'react-toastify';

// Import modals
import AppointmentDetailModal from '../components/AppointmentDetailModal';
import RescheduleConfirmModal from '../components/RescheduleConfirmModal';
import QuickAppointmentModal from '../components/QuickAppointmentModal';

// Status color mapping
const STATUS_COLORS = {
    'Agendado': { bg: '#3b82f6', border: '#2563eb', text: 'Agendado' },      // Blue
    'Confirmado': { bg: '#14b8a6', border: '#0d9488', text: 'Confirmado' },  // Teal
    'Realizado': { bg: '#22c55e', border: '#16a34a', text: 'Realizado' },    // Green
    'Cancelado': { bg: '#ef4444', border: '#dc2626', text: 'Cancelado' },    // Red
    'Não Compareceu': { bg: '#f59e0b', border: '#d97706', text: 'No-Show' }, // Amber
    'Remarcado': { bg: '#8b5cf6', border: '#7c3aed', text: 'Remarcado' }     // Purple
};

// Business hours config
const BUSINESS_HOURS = {
    start: '09:00',
    end: '19:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6] // Monday to Saturday
};

function CalendarView() {
    const navigate = useNavigate();
    const { isDarkMode } = useTheme();

    // Detect if mobile for default view - dynamic detection
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 640);

    // State
    const [agendamentos, setAgendamentos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [pacotes, setPacotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState(isMobile ? 'timeGridDay' : 'timeGridWeek');
    const [calendarApi, setCalendarApi] = useState(null);
    const [currentTitle, setCurrentTitle] = useState('');

    // Handle window resize for mobile detection
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 640;
            setIsMobile(mobile);
            // Auto-switch to day view on mobile if not already there
            if (mobile && calendarApi && currentView !== 'timeGridDay') {
                calendarApi.changeView('timeGridDay');
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [calendarApi, currentView]);

    // Modal states
    const [selectedAppointment, setSelectedAppointment] = useState(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [rescheduleModal, setRescheduleModal] = useState({
        open: false,
        appointment: null,
        oldDate: null,
        newDate: null,
        conflicts: []
    });
    const [quickModal, setQuickModal] = useState({
        open: false,
        selectedDate: null
    });

    // Fetch data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [agendamentosRes, clientesRes, pacotesRes] = await Promise.all([
                api.get('/agendamentos'),
                api.get('/clientes'),
                api.get('/pacotes')
            ]);

            setAgendamentos(agendamentosRes.data || []);
            setClientes(clientesRes.data || []);
            setPacotes(pacotesRes.data || []);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            toast.error('Erro ao carregar agendamentos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Transform appointments to FullCalendar events
    const events = useMemo(() => {
        return agendamentos.map(agendamento => {
            const statusConfig = STATUS_COLORS[agendamento.status] || STATUS_COLORS['Agendado'];
            const clienteName = agendamento.cliente?.nome || 'Cliente não identificado';
            const pacoteName = agendamento.pacote?.nome || agendamento.servicoAvulsoNome || 'Serviço';

            // Calculate end time (default 1 hour if not specified)
            const startDate = DateTime.fromISO(agendamento.dataHora, { zone: 'Europe/Lisbon' });
            const endDate = startDate.plus({ hours: 1 });

            return {
                id: agendamento._id,
                title: `${clienteName} - ${pacoteName}`,
                start: agendamento.dataHora,
                end: endDate.toISO(),
                backgroundColor: statusConfig.bg,
                borderColor: statusConfig.border,
                textColor: '#ffffff',
                extendedProps: {
                    ...agendamento,
                    statusLabel: statusConfig.text
                }
            };
        });
    }, [agendamentos]);

    // Detect conflicts for a given time slot
    const detectConflicts = useCallback((newStart, excludeId = null) => {
        const newStartDT = DateTime.fromISO(newStart, { zone: 'Europe/Lisbon' });
        const newEndDT = newStartDT.plus({ hours: 1 });

        return agendamentos.filter(ag => {
            if (excludeId && ag._id === excludeId) return false;
            if (ag.status === 'Cancelado' || ag.status === 'Não Compareceu') return false;

            const agStart = DateTime.fromISO(ag.dataHora, { zone: 'Europe/Lisbon' });
            const agEnd = agStart.plus({ hours: 1 });

            // Check overlap
            return newStartDT < agEnd && newEndDT > agStart;
        });
    }, [agendamentos]);

    // Check if within business hours
    const isWithinBusinessHours = useCallback((dateTime) => {
        const dt = DateTime.fromISO(dateTime, { zone: 'Europe/Lisbon' });
        const hour = dt.hour;
        const minute = dt.minute;
        const dayOfWeek = dt.weekday; // 1=Monday, 7=Sunday

        const startHour = parseInt(BUSINESS_HOURS.start.split(':')[0]);
        const endHour = parseInt(BUSINESS_HOURS.end.split(':')[0]);

        // Check if it's a working day
        if (!BUSINESS_HOURS.daysOfWeek.includes(dayOfWeek)) {
            return false;
        }

        // Check if within working hours
        const timeInMinutes = hour * 60 + minute;
        const startInMinutes = startHour * 60;
        const endInMinutes = endHour * 60;

        return timeInMinutes >= startInMinutes && timeInMinutes < endInMinutes;
    }, []);

    // Event click handler
    const handleEventClick = useCallback((info) => {
        const appointment = info.event.extendedProps;
        setSelectedAppointment({
            ...appointment,
            id: info.event.id,
            start: info.event.start
        });
        setDetailModalOpen(true);
    }, []);

    // Date click handler (create new appointment)
    const handleDateClick = useCallback((info) => {
        setQuickModal({
            open: true,
            selectedDate: info.dateStr
        });
    }, []);

    // Event drop handler (drag and drop)
    const handleEventDrop = useCallback((info) => {
        const newStart = info.event.start.toISOString();
        const appointment = info.event.extendedProps;
        const oldStart = DateTime.fromISO(appointment.dataHora, { zone: 'Europe/Lisbon' });

        // Detect conflicts
        const conflicts = detectConflicts(newStart, info.event.id);

        // Check business hours
        const withinHours = isWithinBusinessHours(newStart);

        // Revert the drop and show confirmation modal
        info.revert();

        setRescheduleModal({
            open: true,
            appointment: {
                ...appointment,
                id: info.event.id
            },
            oldDate: oldStart.toISO(),
            newDate: newStart,
            conflicts,
            outsideBusinessHours: !withinHours
        });
    }, [detectConflicts, isWithinBusinessHours]);

    // Confirm reschedule
    const confirmReschedule = async (notes = '') => {
        const { appointment, newDate } = rescheduleModal;

        try {
            // Extract only the necessary fields for update
            const updateData = {
                cliente: appointment.cliente?._id || appointment.cliente,
                pacote: appointment.pacote?._id || appointment.pacote || null,
                dataHora: newDate,
                status: 'Agendado', // Keep as 'Agendado' since 'Remarcado' is not in the enum
                observacoes: notes ? `${appointment.observacoes || ''}\n[Remarcado em ${DateTime.now().setZone('Europe/Lisbon').toFormat('dd/MM/yyyy HH:mm')}] ${notes}`.trim() : appointment.observacoes,
                servicoAvulsoNome: appointment.servicoAvulsoNome || null,
                servicoAvulsoValor: appointment.servicoAvulsoValor || null,
            };

            await api.put(`/agendamentos/${appointment.id || appointment._id}`, updateData);

            toast.success('Agendamento remarcado com sucesso!');
            fetchData();
            setRescheduleModal({ open: false, appointment: null, oldDate: null, newDate: null, conflicts: [] });
        } catch (error) {
            console.error('Erro ao remarcar:', error);
            toast.error('Erro ao remarcar agendamento');
        }
    };

    // Update appointment status
    const handleUpdateStatus = async (appointmentId, newStatus) => {
        try {
            const appointment = agendamentos.find(a => a._id === appointmentId);
            await api.put(`/agendamentos/${appointmentId}`, {
                ...appointment,
                status: newStatus
            });
            toast.success(`Status atualizado para "${newStatus}"`);
            fetchData();
            setDetailModalOpen(false);
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            toast.error('Erro ao atualizar status');
        }
    };

    // Delete appointment
    const handleDeleteAppointment = async (appointmentId) => {
        if (!window.confirm('Tem certeza que deseja excluir este agendamento?')) return;

        try {
            await api.delete(`/agendamentos/${appointmentId}`);
            toast.success('Agendamento excluído com sucesso!');
            fetchData();
            setDetailModalOpen(false);
        } catch (error) {
            console.error('Erro ao excluir:', error);
            toast.error('Erro ao excluir agendamento');
        }
    };

    // Create new appointment
    const handleCreateAppointment = async (appointmentData) => {
        try {
            await api.post('/agendamentos', appointmentData);
            toast.success('Agendamento criado com sucesso!');
            fetchData();
            setQuickModal({ open: false, selectedDate: null });
        } catch (error) {
            console.error('Erro ao criar:', error);
            toast.error('Erro ao criar agendamento');
        }
    };

    // Calendar ref callback
    const handleCalendarRef = useCallback((ref) => {
        if (ref) {
            setCalendarApi(ref.getApi());
        }
    }, []);

    // Update title when calendar dates change
    const handleDatesSet = useCallback((arg) => {
        setCurrentTitle(arg.view.title);
        setCurrentView(arg.view.type);
    }, []);

    // View buttons
    const viewButtons = [
        { key: 'dayGridMonth', label: 'Mês', icon: CalendarDays },
        { key: 'timeGridWeek', label: 'Semana', icon: CalendarCheck },
        { key: 'timeGridDay', label: 'Dia', icon: Clock }
    ];

    // Card style based on theme
    const cardClass = isDarkMode
        ? 'bg-slate-800/50 border-white/10'
        : 'bg-white border-slate-200';

    const textClass = isDarkMode ? 'text-white' : 'text-slate-900';
    const subtextClass = isDarkMode ? 'text-slate-400' : 'text-slate-600';

    return (
        <div className={`min-h-screen pt-20 pb-8 px-4 ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className={`text-2xl font-bold ${textClass} flex items-center gap-3`}>
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <CalendarIcon className="w-5 h-5 text-white" />
                            </div>
                            Calendário
                        </h1>
                        <p className={`${subtextClass} mt-1`}>
                            Visualize e gerencie seus agendamentos de forma visual
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/criar-agendamento')}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20"
                        >
                            <Plus className="w-4 h-4" />
                            <span className="hidden sm:inline">Novo Agendamento</span>
                        </button>
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className={`p-2 rounded-xl ${cardClass} border transition-all hover:scale-105`}
                            title="Atualizar"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''} ${subtextClass}`} />
                        </button>
                    </div>
                </div>

                {/* Calendar Controls */}
                <div className={`rounded-2xl border ${cardClass} p-4 mb-4`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                        {/* Navigation */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => calendarApi?.prev()}
                                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                            >
                                <ChevronLeft className={`w-5 h-5 ${subtextClass}`} />
                            </button>
                            <button
                                onClick={() => calendarApi?.today()}
                                className={`px-3 py-1.5 text-sm font-medium rounded-lg ${isDarkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}
                            >
                                Hoje
                            </button>
                            <button
                                onClick={() => calendarApi?.next()}
                                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'} transition-colors`}
                            >
                                <ChevronRight className={`w-5 h-5 ${subtextClass}`} />
                            </button>
                            <h2 className={`text-lg font-semibold ${textClass} ml-2`}>
                                {currentTitle}
                            </h2>
                        </div>

                        {/* View Switcher */}
                        <div className={`flex items-center gap-1 p-1 rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
                            {viewButtons.map(({ key, label, icon: Icon }) => (
                                <button
                                    key={key}
                                    onClick={() => calendarApi?.changeView(key)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${currentView === key
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg'
                                        : `${subtextClass} ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-white'}`
                                        }`}
                                >
                                    <Icon className="w-4 h-4 sm:w-4 sm:h-4" />
                                    <span className={currentView === key ? 'inline' : 'hidden sm:inline'}>{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Status Legend */}
                <div className={`rounded-2xl border ${cardClass} p-4 mb-4`}>
                    <div className="flex flex-wrap items-center gap-4">
                        <span className={`text-sm font-medium ${subtextClass}`}>Legenda:</span>
                        {Object.entries(STATUS_COLORS).map(([status, config]) => (
                            <div key={status} className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: config.bg }}
                                />
                                <span className={`text-sm ${subtextClass}`}>{status}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Calendar */}
                <div className={`rounded-2xl border ${cardClass} p-4 overflow-hidden`}>
                    {loading ? (
                        <div className="flex items-center justify-center h-96">
                            <Loader2 className={`w-8 h-8 animate-spin ${subtextClass}`} />
                        </div>
                    ) : (
                        <div className={`calendar-container ${isDarkMode ? 'dark-calendar' : 'light-calendar'}`}>
                            <FullCalendar
                                ref={handleCalendarRef}
                                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
                                initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
                                locale="pt"
                                timeZone="Europe/Lisbon"
                                headerToolbar={false}
                                events={events}
                                editable={true}
                                droppable={true}
                                selectable={true}
                                selectMirror={true}
                                dayMaxEvents={true}
                                weekends={true}
                                nowIndicator={true}
                                slotMinTime={BUSINESS_HOURS.start}
                                slotMaxTime={BUSINESS_HOURS.end}
                                slotDuration="00:30:00"
                                slotLabelInterval="01:00"
                                allDaySlot={false}
                                height="auto"
                                aspectRatio={isMobile ? 1.2 : 1.8}
                                contentHeight={isMobile ? 600 : 'auto'}
                                businessHours={{
                                    daysOfWeek: BUSINESS_HOURS.daysOfWeek,
                                    startTime: BUSINESS_HOURS.start,
                                    endTime: BUSINESS_HOURS.end
                                }}
                                eventClick={handleEventClick}
                                dateClick={handleDateClick}
                                eventDrop={handleEventDrop}
                                datesSet={handleDatesSet}
                                eventContent={(arg) => {
                                    const clienteName = arg.event.extendedProps.cliente?.nome || 'Cliente';
                                    const serviceName = arg.event.extendedProps.pacote?.nome || arg.event.extendedProps.servicoAvulsoNome || 'Serviço';

                                    return (
                                        <div className="px-2 py-1 sm:p-2 h-full flex flex-col justify-center">
                                            {/* Nome do Cliente - GRANDE e VISÍVEL */}
                                            <div className="font-extrabold text-sm sm:text-base text-white whitespace-nowrap overflow-hidden text-ellipsis w-full mb-0.5">
                                                {clienteName}
                                            </div>
                                            {/* Serviço - Pequeno abaixo */}
                                            <div className="text-[10px] sm:text-xs text-white/80 font-normal whitespace-nowrap overflow-hidden text-ellipsis w-full">
                                                {serviceName}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                    {[
                        {
                            label: 'Total Hoje', value: agendamentos.filter(a => {
                                const dt = DateTime.fromISO(a.dataHora, { zone: 'Europe/Lisbon' });
                                return dt.hasSame(DateTime.now().setZone('Europe/Lisbon'), 'day');
                            }).length, color: 'indigo'
                        },
                        { label: 'Confirmados', value: agendamentos.filter(a => a.status === 'Confirmado').length, color: 'teal' },
                        { label: 'Pendentes', value: agendamentos.filter(a => a.status === 'Agendado').length, color: 'blue' },
                        {
                            label: 'Esta Semana', value: agendamentos.filter(a => {
                                const dt = DateTime.fromISO(a.dataHora, { zone: 'Europe/Lisbon' });
                                const now = DateTime.now().setZone('Europe/Lisbon');
                                return dt >= now.startOf('week') && dt <= now.endOf('week');
                            }).length, color: 'purple'
                        }
                    ].map((stat, idx) => (
                        <div key={idx} className={`rounded-xl border ${cardClass} p-4`}>
                            <p className={`text-sm ${subtextClass}`}>{stat.label}</p>
                            <p className={`text-2xl font-bold ${textClass}`}>{stat.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modals */}
            <AppointmentDetailModal
                isOpen={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                appointment={selectedAppointment}
                onUpdateStatus={handleUpdateStatus}
                onDelete={handleDeleteAppointment}
                onEdit={(id) => navigate(`/agendamentos/editar/${id}`)}
            />

            <RescheduleConfirmModal
                isOpen={rescheduleModal.open}
                onClose={() => setRescheduleModal({ open: false, appointment: null, oldDate: null, newDate: null, conflicts: [] })}
                appointment={rescheduleModal.appointment}
                oldDate={rescheduleModal.oldDate}
                newDate={rescheduleModal.newDate}
                conflicts={rescheduleModal.conflicts}
                outsideBusinessHours={rescheduleModal.outsideBusinessHours}
                onConfirm={confirmReschedule}
            />

            <QuickAppointmentModal
                isOpen={quickModal.open}
                onClose={() => setQuickModal({ open: false, selectedDate: null })}
                selectedDate={quickModal.selectedDate}
                clientes={clientes}
                pacotes={pacotes}
                onSubmit={handleCreateAppointment}
            />

            {/* Calendar Styles */}
            <style>{`
        .dark-calendar .fc {
          --fc-border-color: rgba(255, 255, 255, 0.1);
          --fc-page-bg-color: transparent;
          --fc-neutral-bg-color: rgba(255, 255, 255, 0.05);
          --fc-list-event-hover-bg-color: rgba(255, 255, 255, 0.1);
          --fc-today-bg-color: rgba(99, 102, 241, 0.1);
        }

        .dark-calendar .fc-theme-standard td,
        .dark-calendar .fc-theme-standard th {
          border-color: rgba(255, 255, 255, 0.1);
        }

        /* Colors handled by global index.css now */

        .dark-calendar .fc-day-today .fc-daygrid-day-number {
          color: #818cf8 !important;
          font-weight: bold;
        }

        .light-calendar .fc {
          --fc-border-color: #e2e8f0;
          --fc-page-bg-color: transparent;
          --fc-neutral-bg-color: #f8fafc;
          --fc-today-bg-color: rgba(99, 102, 241, 0.05);
        }

        .fc-event {
          cursor: pointer;
          border-radius: 6px;
          border-width: 0 0 0 3px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .fc-event:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .fc-timegrid-event {
          border-radius: 6px;
        }

        .fc-daygrid-event {
          border-radius: 4px;
          padding: 2px 4px;
        }

        .fc-non-business {
          background: ${isDarkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.03)'} !important;
        }

        .fc-now-indicator-line {
          border-color: #ef4444;
          border-width: 2px;
        }

        .fc-now-indicator-arrow {
          border-color: #ef4444;
        }

        .fc-scrollgrid {
          border-radius: 12px;
          overflow: hidden;
        }

        .fc-col-header-cell {
          padding: 12px 8px;
          font-weight: 600;
        }

        .fc-timegrid-slot {
          height: 48px;
        }

        /* 📱 Mobile Optimizations */
        @media (max-width: 640px) {
          /* 1. ✨ Sticky Header - Data e dia fixos ao rolar */
          .fc-col-header {
            position: sticky !important;
            top: 0 !important;
            z-index: 10 !important;
            background: ${isDarkMode ? '#1e293b' : '#ffffff'} !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }

          .fc-timegrid-axis-cushion {
            position: sticky !important;
            left: 0 !important;
            z-index: 11 !important;
            background: ${isDarkMode ? '#1e293b' : '#ffffff'} !important;
          }

          .fc-col-header-cell {
            padding: 10px 4px;
            font-size: 13px;
            font-weight: 700;
            background: ${isDarkMode ? '#1e293b' : '#ffffff'} !important;
          }

          /* Horários também fixos na lateral */
          .fc-timegrid-slot-label-frame {
            position: sticky !important;
            left: 0 !important;
            z-index: 5 !important;
            background: ${isDarkMode ? '#1e293b' : '#ffffff'} !important;
            padding-right: 4px !important;
          }

          .fc-timegrid-slot-label {
            font-size: 12px;
            padding: 4px 6px;
            font-weight: 600;
          }

          .fc-timegrid-slot {
            height: 50px;
          }

          /* 2. ✨ Nome do cliente MUITO mais visível */
          .fc-timegrid-event {
            font-size: 14px !important;
            padding: 8px !important;
            min-height: 48px !important;
            line-height: 1.4 !important;
          }

          .fc-event-title {
            font-size: 14px !important;
            font-weight: 700 !important;
            line-height: 1.4 !important;
            color: white !important;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          }

          .fc-daygrid-day-number {
            font-size: 14px;
            padding: 6px;
            font-weight: 600;
          }

          /* Force day view to be readable on mobile */
          .fc-timeGridDay-view .fc-timegrid-col {
            min-width: 100%;
          }

          /* Melhor contraste e visibilidade dos eventos */
          .fc-event {
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
            border-width: 0 0 0 4px !important;
          }
        }

        /* Better touch targets for mobile */
        @media (hover: none) and (pointer: coarse) {
          .fc-event {
            min-height: 48px;
            padding: 8px;
          }
        }
      `}</style>
        </div>
    );
}

export default CalendarView;
