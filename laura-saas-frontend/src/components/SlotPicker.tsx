import { useEffect, useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { Loader2, AlertCircle, CalendarClock } from 'lucide-react';
import {
  getDiaDisponibilidade,
  type SlotEstado,
  type DiaDisponibilidade,
} from '../services/scheduleService';

/**
 * F04 — SlotPicker (ADR-028 Fase 3).
 *
 * Grelha de "chips" de horário para a marcação manual. O utilizador escolhe uma
 * data (no componente-pai) e depois um horário de início a partir dos slots que
 * `getAvailableSlots(date, duration)` devolve — que já honra as excepções F02,
 * as reservas e a pausa. Os estados não-disponíveis (ocupado / pausa / fora de
 * horário) são derivados no cliente a partir do contexto do dia (`getSchedules`)
 * apenas para *distinção visual* — o conjunto autoritativo é sempre `slots`.
 *
 * Sem `fetch` directo e sem `alert()` (`.claude/rules/react-hooks.md` /
 * `react-components.md`); todas as leituras passam por `scheduleService` → `api.js`.
 */

export interface SlotPickerProps {
  /** Data escolhida ("YYYY-MM-DD"). Vazio → mostra apenas a dica. */
  date: string;
  /** Duração do serviço em minutos (default 60 — `[Auto-Accept] D5`). */
  duration?: number;
  /** Horário seleccionado ("HH:mm") ou `null`. */
  value: string | null;
  /** Emitido ao escolher um horário. */
  onChange: (time: string) => void;
  /** Quando `true`, qualquer chip é selecionável e surge a entrada livre (admin). */
  allowForce?: boolean;
  /** Quando definido, mostra o toggle "Forçar encaixe" (só passado por admins). */
  onForceToggle?: (next: boolean) => void;
  /** Superfície escura (modal) vs clara (página) — acentos legíveis em ambas. */
  isDarkMode?: boolean;
}

/** Candidato da grelha, já classificado. */
interface SlotCandidato {
  hora: string; // "HH:mm"
  estado: SlotEstado;
  passado: boolean;
}

const horaParaMinutos = (hora: string): number => {
  const [h, m] = hora.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minutosParaHora = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Classifica cada candidato da janela do dia:
 *  - na lista `slots` → `livre`
 *  - sobrepõe uma reserva → `ocupado`
 *  - dentro da pausa → `pausa`
 *  - caso contrário → `fora`
 * Quando não há janela (fallback best-effort), devolve só os `slots` como livres.
 */
function construirCandidatos(
  dia: DiaDisponibilidade,
  duration: number,
  dateISO: string
): SlotCandidato[] {
  const disponiveis = new Set(dia.slots);
  const hoje = DateTime.now().setZone('Europe/Lisbon');
  const isHoje = dateISO === hoje.toISODate();
  const agoraMin = isHoje ? hoje.hour * 60 + hoje.minute : -1;

  const marcarPassado = (min: number): boolean => isHoje && min <= agoraMin;

  if (!dia.janela) {
    // Fallback: sem contexto do dia, mostramos apenas os horários autoritativos.
    return dia.slots.map((hora) => ({
      hora,
      estado: 'livre' as const,
      passado: marcarPassado(horaParaMinutos(hora)),
    }));
  }

  const inicio = horaParaMinutos(dia.janela.startTime);
  const fim = horaParaMinutos(dia.janela.endTime);
  const pausaInicio = horaParaMinutos(dia.janela.breakStartTime);
  const pausaFim = horaParaMinutos(dia.janela.breakEndTime);
  const temPausa = pausaFim > pausaInicio;

  const candidatos: SlotCandidato[] = [];
  // Mesmo stepping do backend: só candidatos cujo fim cabe na janela.
  for (let min = inicio; min < fim; min += duration) {
    const fimSlot = min + duration;
    if (fimSlot > fim) continue;

    const hora = minutosParaHora(min);
    let estado: SlotEstado;
    if (disponiveis.has(hora)) {
      estado = 'livre';
    } else if (dia.ocupados.some((o) => min < o.end && fimSlot > o.start)) {
      estado = 'ocupado';
    } else if (temPausa && min < pausaFim && fimSlot > pausaInicio) {
      estado = 'pausa';
    } else {
      estado = 'fora';
    }

    candidatos.push({ hora, estado, passado: marcarPassado(min) });
  }

  return candidatos;
}

const ROTULO_ESTADO: Record<SlotEstado, string> = {
  livre: 'Disponível',
  ocupado: 'Ocupado',
  pausa: 'Pausa',
  fora: 'Fora do horário',
};

function SlotPicker({
  date,
  duration = 60,
  value,
  onChange,
  allowForce = false,
  onForceToggle,
  isDarkMode = false,
}: SlotPickerProps) {
  const [dia, setDia] = useState<DiaDisponibilidade | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!date) {
      setDia(null);
      setError(null);
      return;
    }

    let cancelado = false;
    setIsLoading(true);
    setError(null);

    getDiaDisponibilidade(date, duration)
      .then((resultado) => {
        if (!cancelado) setDia(resultado);
      })
      .catch(() => {
        // O interceptor do api.js já emite o toast; aqui mostramos estado inline.
        if (!cancelado) {
          setDia(null);
          setError('Não foi possível carregar os horários. Tente novamente.');
        }
      })
      .finally(() => {
        if (!cancelado) setIsLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [date, duration]);

  const candidatos = useMemo(
    () => (dia ? construirCandidatos(dia, duration, date) : []),
    [dia, duration, date]
  );

  const semSlots = !!dia && dia.slots.length === 0;

  // --- Sem data escolhida ---
  if (!date) {
    return (
      <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'} flex items-center gap-2`}>
        <CalendarClock className="w-4 h-4 shrink-0" />
        Escolha uma data para ver os horários.
      </p>
    );
  }

  const chipBase =
    'inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl text-sm font-medium border transition-all select-none';

  const classesChip = (c: SlotCandidato): string => {
    const selecionado = value === c.hora;
    const selecionavel = (c.estado === 'livre' && !c.passado) || allowForce;

    if (selecionado) {
      return `${chipBase} bg-linear-to-r from-indigo-500 to-purple-600 text-white border-transparent shadow-lg`;
    }
    if (c.estado === 'livre' && !c.passado) {
      return `${chipBase} ${
        isDarkMode
          ? 'bg-indigo-500/10 border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/20'
          : 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100'
      } cursor-pointer`;
    }

    // Estados não-disponíveis (visualmente distintos, desabilitados salvo força).
    const forcar = selecionavel ? 'cursor-pointer opacity-90' : 'cursor-not-allowed opacity-60';
    if (c.estado === 'ocupado') {
      return `${chipBase} ${
        isDarkMode ? 'bg-red-500/10 border-red-400/30 text-red-200' : 'bg-red-50 border-red-200 text-red-500'
      } line-through ${forcar}`;
    }
    if (c.estado === 'pausa') {
      return `${chipBase} ${
        isDarkMode ? 'bg-amber-500/10 border-amber-400/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-600'
      } ${forcar}`;
    }
    // fora (ou livre-mas-passado)
    return `${chipBase} border-dashed ${
      isDarkMode ? 'bg-slate-700/40 border-slate-500 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-400'
    } ${forcar}`;
  };

  return (
    <div data-testid="slot-picker">
      {isLoading && (
        <div className={`flex items-center gap-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-500'}`}>
          <Loader2 className="w-4 h-4 animate-spin" />
          A carregar horários...
        </div>
      )}

      {!isLoading && error && (
        <div
          role="alert"
          className={`flex items-center gap-2 text-sm rounded-xl border px-3 py-2 ${
            isDarkMode ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-red-200 bg-red-50 text-red-600'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!isLoading && !error && semSlots && (
        <p
          data-testid="slot-picker-empty"
          className={`text-sm rounded-xl border px-3 py-3 ${
            isDarkMode ? 'border-white/10 bg-white/5 text-slate-300' : 'border-gray-200 bg-gray-50 text-gray-600'
          }`}
        >
          Sem horários disponíveis para esta data.
        </p>
      )}

      {!isLoading && !error && !semSlots && candidatos.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="listbox" aria-label="Horários disponíveis">
            {candidatos.map((c) => {
              const selecionavel = (c.estado === 'livre' && !c.passado) || allowForce;
              const titulo = c.passado && c.estado === 'livre' ? 'Já passou' : ROTULO_ESTADO[c.estado];
              return (
                <button
                  key={c.hora}
                  type="button"
                  role="option"
                  aria-selected={value === c.hora}
                  data-estado={c.estado}
                  data-passado={c.passado ? 'true' : 'false'}
                  disabled={!selecionavel}
                  title={titulo}
                  onClick={() => selecionavel && onChange(c.hora)}
                  className={classesChip(c)}
                >
                  {c.hora}
                </button>
              );
            })}
          </div>

          {/* Legenda dos estados (distinção visual — C4). */}
          <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" /> Disponível
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Ocupado
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-amber-300 inline-block" /> Pausa
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm border border-dashed border-slate-400 inline-block" /> Fora do horário
            </span>
          </div>
        </>
      )}

      {/* Forçar encaixe — só para admins (o pai passa `onForceToggle`). */}
      {onForceToggle && (
        <div className="mt-3">
          <label className={`inline-flex items-center gap-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-600'} cursor-pointer`}>
            <input
              type="checkbox"
              checked={allowForce}
              onChange={(e) => onForceToggle(e.target.checked)}
              className="w-4 h-4 accent-indigo-500"
            />
            Forçar encaixe (fora do horário)
          </label>

          {allowForce && (
            <div className="mt-2">
              <label className={`block text-xs mb-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                Hora manual
              </label>
              <input
                type="time"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                data-testid="slot-picker-force-input"
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm ${
                  isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'
                }`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SlotPicker;
