import React, { useState, useEffect, useCallback } from 'react';
import { getSchedules, updateSchedule } from '../services/scheduleService.js';
import type { Schedule, Agendamento } from '../services/scheduleService.js';
import { DateTime } from 'luxon';
import { toast } from 'react-toastify';

// Componente para um "slot" de agendamento na agenda
const AgendamentoSlot = ({ agendamento }: { agendamento: Agendamento }) => (
  <div className="bg-blue-100 border-l-4 border-blue-500 p-2 rounded-r-md shadow-sm text-xs absolute w-[calc(100%-8px)] left-1">
    <p className="font-bold text-blue-800">{agendamento.cliente.nome}</p>
    <p className="text-blue-700">{agendamento.cliente.telefone}</p>
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
      toast.success('Horários atualizados com sucesso!');
    } catch (error) {
      toast.error('Erro ao atualizar horários');
    }
  };

  if (!isOpen || !schedule) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold mb-4">Editar Horários - {schedule.label}</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="isActive" className="text-sm font-medium">
              Dia ativo para agendamentos
            </label>
          </div>

          {formData.isActive && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Início do expediente
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fim do expediente
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Início da pausa
                  </label>
                  <input
                    type="time"
                    value={formData.breakStartTime}
                    onChange={(e) => setFormData({ ...formData, breakStartTime: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fim da pausa
                  </label>
                  <input
                    type="time"
                    value={formData.breakEndTime}
                    onChange={(e) => setFormData({ ...formData, breakEndTime: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
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
  const [currentWeekStart, setCurrentWeekStart] = useState<DateTime>(DateTime.now().startOf('week')); // Novo estado para a semana atual

  // Função para buscar os dados
  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      // Passar a data de início da semana para o backend
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
  }, [currentWeekStart]); // Adicionar currentWeekStart como dependência

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
      await fetchSchedules(); // Recarrega os dados
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
      dayOfWeek: date.weekday === 7 ? 0 : date.weekday, // Luxon: 1=Seg, ..., 7=Dom. Mongoose: 0=Dom, ..., 6=Sab
      label: date.toFormat('EEE dd/MM'), // Ex: Seg 25/11
      fullDate: date.toISODate() as string,
    };
  });

  if (loading) return <div className="p-8 text-center">A carregar agenda...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Agenda Semanal</h1>
        <div className="flex items-center space-x-4">
          <button
            onClick={goToPreviousWeek}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            ← Anterior
          </button>
          <span className="font-semibold text-lg">
            {currentWeekStart.toFormat('dd/MM/yyyy')} - {currentWeekStart.plus({ days: 6 }).toFormat('dd/MM/yyyy')}
          </span>
          <button
            onClick={goToNextWeek}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Próxima →
          </button>
          <button
            onClick={() => fetchSchedules()}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Atualizar
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-8 text-center font-bold text-gray-600 border-b pb-2 mb-2">
        <div className="text-sm">Hora</div>
        {weekDays.map(dayInfo => {
          const daySchedule = schedules.find(s => s.dayOfWeek === dayInfo.dayOfWeek);
          return (
            <div key={dayInfo.fullDate} className="text-sm">
              <div className="flex flex-col items-center">
                <span className={`${daySchedule?.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                  {dayInfo.label}
                </span>
                {daySchedule && (
                  <button
                    onClick={() => handleEditSchedule(daySchedule)}
                    className="mt-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-8">
        {/* Coluna das Horas */}
        <div className="col-span-1">
          {timeSlots.map(time => (
            <div key={time} className="h-12 border-r border-b flex items-center justify-center text-xs text-gray-500 bg-gray-50">
              {time}
            </div>
          ))}
        </div>

        {/* Colunas dos Dias da Semana */}
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
                const endTimeInMinutes = daySchedule?.endTime && endTimeParts ? parseInt(endTimeParts[0] ?? "23") * 60 + parseInt(endTimeParts[1] ?? "59") : 1440; // 24 * 60

                const breakStartTimeParts = daySchedule?.breakStartTime?.split(":");
                const breakStartInMinutes = daySchedule?.breakStartTime && breakStartTimeParts ? parseInt(breakStartTimeParts[0] ?? "0") * 60 + parseInt(breakStartTimeParts[1] ?? "0") : null;

                const breakEndTimeParts = daySchedule?.breakEndTime?.split(":");
                const breakEndInMinutes = daySchedule?.breakEndTime && breakEndTimeParts ? parseInt(breakEndTimeParts[0] ?? "0") * 60 + parseInt(breakEndTimeParts[1] ?? "0") : null;

                const isWorkingHour = daySchedule?.isActive && timeInMinutes >= startTimeInMinutes && timeInMinutes < endTimeInMinutes;
                const isBreakTime = breakStartInMinutes && breakEndInMinutes && timeInMinutes >= breakStartInMinutes && timeInMinutes < breakEndInMinutes;
                
                let slotClass = "h-12 border-b border-r ";
                if (!daySchedule?.isActive) {
                  slotClass += "bg-gray-100";
                } else if (isBreakTime) {
                  slotClass += "bg-red-100";
                } else if (isWorkingHour) {
                  slotClass += agendamentoNesteSlot ? "bg-blue-50" : "bg-green-50";
                } else {
                  slotClass += "bg-gray-100";
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

      {/* Modal de Edição */}
      <EditScheduleModal
        schedule={editingSchedule}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveSchedule}
      />

      {/* Legenda */}
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-green-50 border mr-2"></div>
          <span>Horário disponível</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-blue-50 border mr-2"></div>
          <span>Agendamento marcado</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-red-100 border mr-2"></div>
          <span>Horário de pausa</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-gray-100 border mr-2"></div>
          <span>Fora do expediente</span>
        </div>
      </div>
    </div>
  );
};

export default AgendaDisponibilidade;
