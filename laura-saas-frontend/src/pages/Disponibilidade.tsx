import React, { useState, useEffect, useCallback } from 'react';
import { getSchedules, updateSchedule } from '../services/scheduleService.js';
import type { Schedule, Agendamento } from '../services/scheduleService.js';
import { DateTime } from 'luxon';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight, RefreshCw, Edit2, Check, X, Calendar } from 'lucide-react';

// Componente para um "slot" de agendamento na agenda
const AgendamentoSlot = ({ agendamento }: { agendamento: Agendamento }) => (
  <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border-l-4 border-indigo-500 p-2 rounded-r-md shadow-lg text-xs absolute w-[calc(100%-8px)] left-1 backdrop-blur-sm">
    <p className="font-bold text-indigo-700 dark:text-indigo-300">{agendamento.cliente.nome}</p>
    <p className="text-indigo-600 dark:text-indigo-400">{agendamento.cliente.telefone}</p>
  </div>
);

// Modal para editar horários de um dia específico
const EditScheduleModal = ({
  schedule,
  isOpen,
  onClose,
  onSave
}: {
  schedule: Schedule | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (dayOfWeek: number, data: Partial<Schedule>) => Promise<void>;
}) => {
  const [formData, setFormData] = useState({
    isActive: false,
    startTime: '09:00',
    endTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00'
  });

  useEffect(() => {
    if (schedule) {
      setFormData({
        isActive: schedule.isActive,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        breakStartTime: schedule.breakStartTime,
        breakEndTime: schedule.breakEndTime
      });
    }
  }, [schedule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule) return;

    try {
      await onSave(schedule.dayOfWeek, formData);
      onClose();
      toast.success('✅ Horários atualizados com sucesso!');
    } catch (error) {
      toast.error('❌ Erro ao atualizar horários');
    }
  };

  if (!isOpen || !schedule) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Editar Horários</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{schedule.label}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              Dia ativo para agendamentos
            </label>
          </div>

          {formData.isActive && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Horário de Expediente
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Início
                    </label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Fim
                    </label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Horário de Pausa
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Início
                    </label>
                    <input
                      type="time"
                      value={formData.breakStartTime}
                      onChange={(e) => setFormData({ ...formData, breakStartTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                      Fim
                    </label>
                    <input
                      type="time"
                      value={formData.breakEndTime}
                      onChange={(e) => setFormData({ ...formData, breakEndTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all font-medium shadow-lg shadow-indigo-500/30 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AgendaDisponibilidade = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [currentWeekStart, setCurrentWeekStart] = useState<DateTime>(DateTime.now().startOf('week'));

  // Função para buscar os dados
  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const { disponibilidade, agendamentos } = await getSchedules();
      setSchedules(disponibilidade);
      setAgendamentos(agendamentos);
      setError(null);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Ocorreu um erro desconhecido.');
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Funções para navegar entre as semanas
  const goToPreviousWeek = () => {
    setCurrentWeekStart(prev => prev.minus({ weeks: 1 }));
  };

  const goToNextWeek = () => {
    setCurrentWeekStart(prev => prev.plus({ weeks: 1 }));
  };

  const goToCurrentWeek = () => {
    setCurrentWeekStart(DateTime.now().startOf('week'));
  };

  // Função para abrir modal de edição
  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setIsModalOpen(true);
  };

  // Função para fechar modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSchedule(null);
  };

  // Função para salvar alterações
  const handleSaveSchedule = async (dayOfWeek: number, data: Partial<Schedule>) => {
    try {
      await updateSchedule(dayOfWeek, data);
      await fetchSchedules();
    } catch (error) {
      throw error;
    }
  };

  // Gerar slots de tempo para o dia (ex: 08:00, 08:30, ...)
  const timeSlots: string[] = [];
  for (let hour = 8; hour < 20; hour++) {
    timeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    timeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  // Gerar os dias da semana com as datas específicas
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const date = currentWeekStart.plus({ days: i });
    return {
      dayOfWeek: date.weekday === 7 ? 0 : date.weekday,
      label: date.toFormat('EEE dd/MM'),
      fullDate: date.toISODate() as string,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">A carregar agenda...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-red-600 dark:text-red-400 font-semibold text-lg">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
                Agenda Semanal
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Gerencie sua disponibilidade e visualize agendamentos
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={goToPreviousWeek}
                className="px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-all border border-slate-300 dark:border-slate-600 shadow-sm flex items-center gap-2 font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>

              <button
                onClick={goToCurrentWeek}
                className="px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/30 font-medium"
              >
                Hoje
              </button>

              <span className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-semibold border border-slate-300 dark:border-slate-600">
                {currentWeekStart.toFormat('dd/MM/yyyy')} - {currentWeekStart.plus({ days: 6 }).toFormat('dd/MM/yyyy')}
              </span>

              <button
                onClick={goToNextWeek}
                className="px-4 py-2.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-all border border-slate-300 dark:border-slate-600 shadow-sm flex items-center gap-2 font-medium"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => fetchSchedules()}
                className="px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/30 flex items-center gap-2 font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header with days */}
          <div className="grid grid-cols-8 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <div className="p-4 text-center font-bold text-slate-600 dark:text-slate-400 text-sm">
              Hora
            </div>
            {weekDays.map(dayInfo => {
              const daySchedule = schedules.find(s => s.dayOfWeek === dayInfo.dayOfWeek);
              return (
                <div key={dayInfo.fullDate} className="p-4 text-center border-l border-slate-200 dark:border-slate-700">
                  <div className="flex flex-col items-center gap-2">
                    <span className={`font-bold text-sm ${daySchedule?.isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'}`}>
                      {dayInfo.label}
                    </span>
                    {daySchedule && (
                      <button
                        onClick={() => handleEditSchedule(daySchedule)}
                        className="px-3 py-1.5 text-xs bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md flex items-center gap-1.5 font-medium"
                      >
                        <Edit2 className="w-3 h-3" />
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time slots grid */}
          <div className="grid grid-cols-8">
            {/* Time column */}
            <div className="col-span-1">
              {timeSlots.map(time => (
                <div key={time} className="h-14 border-r border-b border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-medium text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/30">
                  {time}
                </div>
              ))}
            </div>

            {/* Days columns */}
            {weekDays.map(dayInfo => {
              const daySchedule = schedules.find(s => s.dayOfWeek === dayInfo.dayOfWeek);
              return (
                <div key={dayInfo.fullDate} className="col-span-1 relative">
                  {timeSlots.map(time => {
                    const agendamentoNesteSlot = agendamentos.find(ag => {
                      const agDateTime = DateTime.fromISO(ag.dataHora);
                      const isSameDay = agDateTime.toISODate() === dayInfo.fullDate;
                      const horaCorreta = agDateTime.toFormat('HH:mm') === time;
                      return isSameDay && horaCorreta;
                    });

                    // Verificar se o horário está dentro do expediente
                    const [timeHour, timeMinute] = time.split(":");
                    const timeInMinutes = parseInt(timeHour ?? "0") * 60 + parseInt(timeMinute ?? "0");

                    const startTimeParts = daySchedule?.startTime?.split(":");
                    const startTimeInMinutes = daySchedule?.startTime && startTimeParts ? parseInt(startTimeParts[0] ?? "0") * 60 + parseInt(startTimeParts[1] ?? "0") : 0;

                    const endTimeParts = daySchedule?.endTime?.split(":");
                    const endTimeInMinutes = daySchedule?.endTime && endTimeParts ? parseInt(endTimeParts[0] ?? "23") * 60 + parseInt(endTimeParts[1] ?? "59") : 1440;

                    const breakStartTimeParts = daySchedule?.breakStartTime?.split(":");
                    const breakStartInMinutes = daySchedule?.breakStartTime && breakStartTimeParts ? parseInt(breakStartTimeParts[0] ?? "0") * 60 + parseInt(breakStartTimeParts[1] ?? "0") : null;

                    const breakEndTimeParts = daySchedule?.breakEndTime?.split(":");
                    const breakEndInMinutes = daySchedule?.breakEndTime && breakEndTimeParts ? parseInt(breakEndTimeParts[0] ?? "0") * 60 + parseInt(breakEndTimeParts[1] ?? "0") : null;

                    const isWorkingHour = daySchedule?.isActive && timeInMinutes >= startTimeInMinutes && timeInMinutes < endTimeInMinutes;
                    const isBreakTime = breakStartInMinutes && breakEndInMinutes && timeInMinutes >= breakStartInMinutes && timeInMinutes < breakEndInMinutes;

                    let slotClass = "h-14 border-b border-r border-slate-200 dark:border-slate-700 transition-colors ";
                    if (!daySchedule?.isActive) {
                      slotClass += "bg-slate-100 dark:bg-slate-900/50";
                    } else if (isBreakTime) {
                      slotClass += "bg-red-50 dark:bg-red-900/20";
                    } else if (isWorkingHour) {
                      slotClass += agendamentoNesteSlot ? "bg-indigo-50 dark:bg-indigo-900/20" : "bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30";
                    } else {
                      slotClass += "bg-slate-100 dark:bg-slate-900/50";
                    }

                    return (
                      <div key={time} className={slotClass}>
                        {agendamentoNesteSlot && <AgendamentoSlot agendamento={agendamentoNesteSlot} />}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Legenda</h3>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-700 rounded"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Horário disponível</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-700 rounded"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Agendamento marcado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-700 rounded"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Horário de pausa</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-slate-100 dark:bg-slate-900/50 border-2 border-slate-300 dark:border-slate-700 rounded"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">Fora do expediente</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Edição */}
      <EditScheduleModal
        schedule={editingSchedule}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveSchedule}
      />
    </div>
  );
};

export default AgendaDisponibilidade;
