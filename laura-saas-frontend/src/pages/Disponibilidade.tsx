import React, { useState, useEffect, useCallback } from 'react';
import { getSchedules } from '../services/scheduleService.js';
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

const AgendaDisponibilidade = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Gerar slots de tempo para o dia (ex: 08:00, 08:30, ...)
  const timeSlots: string[] = [];
  for (let hour = 8; hour < 20; hour++) {
    timeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    timeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  if (loading) return <div className="p-8 text-center">A carregar agenda...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Agenda Semanal</h1>
      
      <div className="grid grid-cols-8 text-center font-bold text-gray-600 border-b pb-2 mb-2">
        <div className="text-sm">Hora</div>
        {schedules
          .sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek))
          .map(day => <div key={day.dayOfWeek} className="text-sm">{day.label}</div>)
        }
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
        {schedules
          .sort((a, b) => (a.dayOfWeek === 0 ? 7 : a.dayOfWeek) - (b.dayOfWeek === 0 ? 7 : b.dayOfWeek))
          .map(day => (
            <div key={day.dayOfWeek} className="col-span-1 relative">
              {timeSlots.map(time => {
                const agendamentoNesteSlot = agendamentos.find(ag => {
                  const agDateTime = DateTime.fromISO(ag.dataHora);
                  const diaDaSemanaCorreto = agDateTime.weekday === (day.dayOfWeek === 0 ? 7 : day.dayOfWeek);
                  const horaCorreta = agDateTime.toFormat('HH:mm') === time;
                  return diaDaSemanaCorreto && horaCorreta;
                });
                
                return (
                  <div key={time} className="h-12 border-b border-r">
                    {agendamentoNesteSlot && <AgendamentoSlot agendamento={agendamentoNesteSlot} />}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
};

export default AgendaDisponibilidade;