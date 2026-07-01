import { DateTime } from 'luxon';
import api from './api.js'; // Reutilizamos a sua instância configurada do Axios

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

interface ScheduleExceptionBase {
  _id: string;
  data: string; // "YYYY-MM-DD"
  observacao: string;
  createdAt?: string;
}

/**
 * Discriminated union em `tipo` (espelha a invariante do backend):
 *  - `fechado` → sem janela (`inicio`/`fim` são `null`)
 *  - `horas-extra` / `horario-especial` → janela obrigatória (`inicio`/`fim` são `string`)
 * Dá narrowing automático: no ramo != 'fechado', `inicio`/`fim` são `string`, não `string | null`.
 */
export type ScheduleException =
  | (ScheduleExceptionBase & { tipo: 'fechado'; inicio: null; fim: null })
  | (ScheduleExceptionBase & { tipo: 'horas-extra' | 'horario-especial'; inicio: string; fim: string });

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
    // O interceptor global do api.js já mostra o toast de erro (URL != /auth/).
    console.error('Erro ao buscar slots disponíveis:', error);
    throw error;
  }
};

// ============================================================
// F04 — Disponibilidade do dia (para o SlotPicker da marcação manual)
// ============================================================

/**
 * Estado de um slot candidato na grelha do SlotPicker (ADR-028 Fase 3).
 * Discriminante simples (union de literais) — `livre` é o único selecionável
 * por defeito; os restantes são visualmente distintos e não selecionáveis.
 */
export type SlotEstado = 'livre' | 'ocupado' | 'pausa' | 'fora';

/** Janela de trabalho do dia (base do weekday), usada para classificar os slots. */
export interface JanelaDia {
  startTime: string;
  endTime: string;
  breakStartTime: string;
  breakEndTime: string;
}

/**
 * Contexto de disponibilidade de um dia para a marcação manual.
 * - `slots`: conjunto autoritativo de horários reserv/áveis (`getAvailableSlots`,
 *   já honra excepções F02 + reservas + pausa).
 * - `janela`: horário base do weekday (para derivar `pausa`/`fora`); `null` quando
 *   o dia está fora do conjunto devolvido por `getSchedules` (fallback best-effort).
 * - `ocupados`: intervalos [start,end] (minutos) das reservas activas nesse dia.
 */
export interface DiaDisponibilidade {
  slots: string[];
  janela: JanelaDia | null;
  ocupados: { start: number; end: number }[];
}

/** "HH:mm" → minutos desde a meia-noite. */
const horaParaMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * Combina `getAvailableSlots` (conjunto autoritativo) com `getSchedules`
 * (janela base do weekday + reservas do dia) para o SlotPicker poder distinguir
 * *porquê* um horário não está livre (ocupado / pausa / fora). Best-effort:
 * quando a data cai fora da janela devolvida por `getSchedules`, devolve
 * `janela: null` / `ocupados: []` e o picker degrada para mostrar só os `slots`.
 *
 * @param date "YYYY-MM-DD"
 * @param duration duração do serviço em minutos (default 60 — `[Auto-Accept] D5`)
 */
// Item mínimo da listagem `/agendamentos` que interessa ao contexto do dia.
interface AgendamentoDoDia {
  dataHora: string;
  status?: string;
}

// Estados que ocupam um slot (o mesmo whitelist do backend `getAvailableSlots`).
const STATUS_OCUPA_SLOT = new Set(['Agendado', 'Confirmado']);

export const getDiaDisponibilidade = async (
  date: string,
  duration: number = 60
): Promise<DiaDisponibilidade> => {
  const alvo = DateTime.fromISO(date, { zone: 'Europe/Lisbon' });

  const [slots, contexto, reservasDia] = await Promise.all([
    getAvailableSlots(date, duration),
    // O contexto do dia é best-effort: se falhar, mantemos os slots autoritativos.
    getSchedules().catch((error) => {
      console.error('Erro ao buscar contexto do dia (getSchedules):', error);
      return null;
    }),
    // Reservas do PRÓPRIO dia via listagem com filtro de datas — o getSchedules
    // só devolve hoje..+7 dias, o que rotulava reservas de datas mais distantes
    // como "fora" (e um admin com forçar-encaixe podia marcar por cima).
    api
      .get('/agendamentos', {
        params: {
          dataInicio: alvo.startOf('day').toISO(),
          dataFim: alvo.endOf('day').toISO(),
          limit: 100,
        },
      })
      .then((res): AgendamentoDoDia[] => res.data?.data ?? [])
      .catch((error): AgendamentoDoDia[] => {
        console.error('Erro ao buscar reservas do dia (agendamentos):', error);
        return [];
      }),
  ]);

  if (!contexto) {
    return { slots, janela: null, ocupados: [] };
  }

  // Luxon: 1=Seg…7=Dom → Mongoose: 0=Dom…6=Sab (mesmo mapeamento do backend).
  const dayOfWeek = alvo.weekday === 7 ? 0 : alvo.weekday;

  // Padrão do projecto (Disponibilidade.tsx): find por dayOfWeek, nunca index por
  // array — só seria seguro com exactamente 7 docs ordenados.
  const schedule = contexto.disponibilidade.find((s) => s.dayOfWeek === dayOfWeek) ?? null;
  const janela: JanelaDia | null = schedule
    ? {
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        breakStartTime: schedule.breakStartTime,
        breakEndTime: schedule.breakEndTime,
      }
    : null;

  // Reservas ACTIVAS do dia (a listagem devolve todos os estados — filtrar
  // pelo mesmo whitelist que o backend usa para ocupar slots).
  const dateKey = alvo.toISODate();
  const ocupados = reservasDia
    .filter((ag) => !ag.status || STATUS_OCUPA_SLOT.has(ag.status))
    .filter((ag) => {
      const inicio = DateTime.fromISO(ag.dataHora, { zone: 'Europe/Lisbon' });
      return inicio.isValid && inicio.toISODate() === dateKey;
    })
    .map((ag) => {
      const inicio = DateTime.fromISO(ag.dataHora, { zone: 'Europe/Lisbon' });
      const start = horaParaMinutos(inicio.toFormat('HH:mm'));
      return { start, end: start + duration };
    });

  return { slots, janela, ocupados };
};
