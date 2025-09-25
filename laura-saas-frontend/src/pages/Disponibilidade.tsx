import React, { useState, useEffect } from 'react';
import { getSchedules, updateSchedule } from '../services/scheduleService.js';
import type { Schedule, Agendamento } from '../services/scheduleService.js';
import { toast } from 'react-toastify';
import { DateTime } from 'luxon'; // Agora esta importação será usada

const Disponibilidade = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        setLoading(true);
        const { disponibilidade, agendamentos } = await getSchedules(); 
         console.log('DADOS RECEBIDOS NO COMPONENTE:', { disponibilidade, agendamentos });

        
        disponibilidade.sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek));
        setSchedules(disponibilidade);
        setAgendamentos(agendamentos);
        setError(null);
      } catch (err) { 
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Ocorreu um erro desconhecido ao carregar a agenda.');
        }
      } 
      finally { setLoading(false); }
    };
    fetchSchedules();
  }, []);

  const handleScheduleChange = (dayOfWeek: number, field: keyof Schedule, value: string | boolean) => {
    setSchedules(currentSchedules =>
      currentSchedules.map(schedule =>
        schedule.dayOfWeek === dayOfWeek ? { ...schedule, [field]: value } : schedule
      )
    );
  };

  const handleSave = async (dayOfWeek: number) => {
    const scheduleToSave = schedules.find(s => s.dayOfWeek === dayOfWeek);
    if (!scheduleToSave) return;

    setSaving(dayOfWeek);
    try {
      const updatedSchedule = await updateSchedule(dayOfWeek, {
        isActive: scheduleToSave.isActive,
        startTime: scheduleToSave.startTime,
        endTime: scheduleToSave.endTime,
        breakStartTime: scheduleToSave.breakStartTime,
        breakEndTime: scheduleToSave.breakEndTime,
      });

      setSchedules(currentSchedules =>
        currentSchedules.map(s => s.dayOfWeek === dayOfWeek ? updatedSchedule : s)
      );
      toast.success(`${scheduleToSave.label} atualizado com sucesso!`);
    } catch (err) {
      toast.error(`Erro ao salvar ${scheduleToSave.label}.`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className="p-8 text-center">A carregar agenda...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Agenda e Disponibilidade</h1>
      <div className="bg-white p-6 shadow-lg rounded-xl divide-y divide-gray-200">
        {schedules.map((schedule) => {
          // Usamos Luxon para encontrar os agendamentos apenas para este dia da semana
          const agendamentosDoDia = agendamentos.filter(
            (ag) => DateTime.fromISO(ag.dataHora).weekday === (schedule.dayOfWeek === 0 ? 7 : schedule.dayOfWeek)
          );

          return (
            <div key={schedule.dayOfWeek} className="py-5">
              <div className="grid grid-cols-1 md:grid-cols-6 items-center gap-4">
                {/* A sua linha de configuração de disponibilidade (toggle, inputs, etc.) vai aqui */}
              </div>

              {/* AQUI ESTÁ A NOVA LÓGICA QUE USA LUXON */}
              {schedule.isActive && (
                <div className="mt-4 pl-4 md:pl-8">
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">Compromissos Agendados:</h4>
                  {agendamentosDoDia.length > 0 ? (
                    <div className="space-y-2">
                      {agendamentosDoDia.sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime()).map(ag => (
                        <div key={ag._id} className="bg-blue-50 border-l-4 border-blue-400 p-2 rounded-r-lg flex justify-between items-center">
                          <span className="font-medium text-blue-800">{ag.cliente.nome}</span>
                          <span className="text-sm font-semibold text-blue-700">
                            {DateTime.fromISO(ag.dataHora).toFormat('HH:mm')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Nenhum agendamento para este dia na próxima semana.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Disponibilidade;