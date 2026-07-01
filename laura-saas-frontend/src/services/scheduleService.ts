import api from './api.js'; // Reutilizamos a sua instância configurada do Axios
import { toast } from 'react-toastify';

// 1. Primeiro, definimos a "forma" (o tipo) dos nossos dados de horário.
// Esta interface deve corresponder ao seu Schema do Mongoose.
export interface Schedule {
  _id: string;
  dayOfWeek: number;
  label: string;
  isActive: boolean;
  startTime: string;
  endTime: string;
  breakStartTime: string;
  breakEndTime: string;
  observacao?: string;
  updatedAt: string;
}

export type TipoExcecao = 'fechado' | 'horas-extra' | 'horario-especial';

export interface ScheduleException {
  _id: string;
  data: string; // "YYYY-MM-DD"
  tipo: TipoExcecao;
  inicio: string | null; // "HH:mm"
  fim: string | null;
  observacao: string;
  createdAt?: string;
}

export interface ExcecaoPayload {
  data: string;
  tipo: TipoExcecao;
  inicio?: string | null;
  fim?: string | null;
  observacao?: string;
}

// 2. Criamos a função para buscar todos os horários.
// Note que indicamos que ela retorna uma "Promessa de um array de Schedules".
export const getSchedules = async (): Promise<{ disponibilidade: Schedule[], agendamentos: Agendamento[] }> => {
  try {
   const response = await api.get("/schedules");
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar agenda e horários:', error);
    throw error;
  }
};

// 3. Criamos a função para atualizar um horário específico.
// Usamos "Partial<Omit<Schedule, '_id'>>" para indicar que podemos enviar apenas alguns campos para atualizar.
export const updateSchedule = async (
  dayOfWeek: number,
  data: Partial<Omit<Schedule, '_id'>>
): Promise<Schedule> => {
  try {
    const response = await api.put(`/schedules/${dayOfWeek}`, data);
    return response.data;
  } catch (error) {
    console.error(`Erro ao atualizar horário para o dia ${dayOfWeek}:`, error);
    throw error;
  }
};

// ============================================================
// Excepções por data (F02) — endpoints canónicos { success, data }
// ============================================================

export const getExcecoes = async (from?: string, to?: string): Promise<ScheduleException[]> => {
  try {
    const response = await api.get('/schedules/excecoes', { params: { from, to } });
    return response.data.data ?? [];
  } catch (error) {
    console.error('Erro ao buscar excepções:', error);
    throw error;
  }
};

export const criarExcecao = async (payload: ExcecaoPayload): Promise<ScheduleException> => {
  const response = await api.post('/schedules/excecoes', payload);
  return response.data.data;
};

export const actualizarExcecao = async (
  id: string,
  payload: ExcecaoPayload
): Promise<ScheduleException> => {
  const response = await api.put(`/schedules/excecoes/${id}`, payload);
  return response.data.data;
};

export const removerExcecao = async (id: string): Promise<void> => {
  await api.delete(`/schedules/excecoes/${id}`);
};

// ADICIONE ESTA NOVA INTERFACE
export interface Agendamento {
  _id: string;
  dataHora: string; // Vem como string ISO do backend
  // Opcional: dados reais podem trazer agendamentos sem cliente populado.
  cliente?: {
    _id: string;
    nome: string;
    telefone?: string;
  } | null;
}

/**
 * @description Busca os slots de horário disponíveis para uma data específica.
 * @param date A data no formato 'YYYY-MM-DD'.
 * @param duration A duração do serviço em minutos.
 * @returns Uma promessa com a lista de horários disponíveis (ex: ["09:00", "09:30"]).
 */
export const getAvailableSlots = async (date: string, duration: number = 60): Promise<string[]> => {
  try {
    // Usamos `api.get` que já configurámos no ficheiro api.js
    const response = await api.get(`/schedules/available-slots`, {
      params: {
        date,
        duration,
      }
    });
    // A API deve retornar um objeto { availableSlots: [...] }
    return response.data.availableSlots || [];
  } catch (error) {
    console.error('Erro ao buscar slots disponíveis:', error);
    toast.error('Não foi possível buscar os horários disponíveis.');
    throw error;
  }
};
