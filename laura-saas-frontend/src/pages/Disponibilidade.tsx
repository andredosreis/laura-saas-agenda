import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getSchedules,
  updateSchedule,
  getExcecoes,
  criarExcecao,
  actualizarExcecao,
  removerExcecao,
} from '../services/scheduleService.js';
import type { Schedule, ScheduleException, TipoExcecao } from '../services/scheduleService.js';
import { DateTime } from 'luxon';
import { toast } from 'react-toastify';
import {
  RefreshCw,
  Edit2,
  Check,
  X,
  Calendar,
  CalendarClock,
  Copy,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';

// Ordem de apresentação: Segunda → Domingo (dayOfWeek: 0 = Domingo, 1 = Segunda ... 6 = Sábado)
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
// "Dias úteis" para a acção de copiar (Seg–Sex)
const WEEKDAYS = [1, 2, 3, 4, 5];

const TIPO_LABEL: Record<TipoExcecao, string> = {
  'fechado': 'Fechado',
  'horas-extra': 'Horas extra',
  'horario-especial': 'Horário especial',
};

// Resumo textual dos horários de um dia
const formatScheduleSummary = (s: Schedule): string => {
  if (!s.isActive) return 'Inativo';
  const base = `${s.startTime}–${s.endTime}`;
  return s.breakStartTime && s.breakEndTime
    ? `${base} · pausa ${s.breakStartTime}–${s.breakEndTime}`
    : base;
};

// Resumo curto de uma excepção (para a célula do calendário)
const formatExcecaoBadge = (e: ScheduleException): string =>
  e.tipo === 'fechado' ? 'Fechado' : `${e.inicio}–${e.fim}`;

// ============================================================
// Modal: editar horário base de um dia da semana
// ============================================================
const EditScheduleModal = ({
  schedule,
  isOpen,
  onClose,
  onSave,
  onCopyToWeekdays,
}: {
  schedule: Schedule | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (dayOfWeek: number, data: Partial<Schedule>) => Promise<void>;
  onCopyToWeekdays: (data: Partial<Schedule>) => Promise<void>;
}) => {
  const [formData, setFormData] = useState({
    isActive: false,
    startTime: '09:00',
    endTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00'
  });
  const [copying, setCopying] = useState(false);

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

  const invalidRange = formData.isActive && formData.startTime >= formData.endTime;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule || invalidRange) return;
    try {
      await onSave(schedule.dayOfWeek, formData);
      onClose();
      toast.success('✅ Horários atualizados com sucesso!');
    } catch (error) {
      toast.error('❌ Erro ao atualizar horários');
    }
  };

  const handleCopy = async () => {
    if (invalidRange) return;
    setCopying(true);
    try {
      await onCopyToWeekdays(formData);
      onClose();
    } finally {
      setCopying(false);
    }
  };

  if (!isOpen || !schedule) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Editar horário base</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{schedule.label}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
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
              className="w-5 h-5 rounded-sm border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
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
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Início</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Fim</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>
                {invalidRange && (
                  <p className="text-red-500 dark:text-red-400 text-sm mt-2">A hora de início tem de ser anterior à hora de fim.</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Horário de Pausa
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Início</label>
                    <input
                      type="time"
                      value={formData.breakStartTime}
                      onChange={(e) => setFormData({ ...formData, breakStartTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Fim</label>
                    <input
                      type="time"
                      value={formData.breakEndTime}
                      onChange={(e) => setFormData({ ...formData, breakEndTime: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCopy}
                disabled={copying || invalidRange}
                className="w-full px-4 py-2.5 text-indigo-600 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Copy className="w-4 h-4" />
                {copying ? 'A copiar…' : 'Copiar para os dias úteis (Seg–Sex)'}
              </button>
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
              disabled={invalidRange}
              className="px-6 py-2.5 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all font-medium shadow-lg shadow-indigo-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

// ============================================================
// Modal: criar/editar/remover uma excepção de uma data
// ============================================================
const ExcecaoModal = ({
  dateKey,
  existing,
  isOpen,
  onClose,
  onSaved,
}: {
  dateKey: string | null;
  existing: ScheduleException | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [tipo, setTipo] = useState<TipoExcecao>('fechado');
  const [inicio, setInicio] = useState('09:00');
  const [fim, setFim] = useState('13:00');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setTipo(existing.tipo);
      setInicio(existing.inicio ?? '09:00');
      setFim(existing.fim ?? '13:00');
      setObservacao(existing.observacao ?? '');
    } else {
      setTipo('fechado');
      setInicio('09:00');
      setFim('13:00');
      setObservacao('');
    }
  }, [existing, dateKey, isOpen]);

  if (!isOpen || !dateKey) return null;

  const isFechado = tipo === 'fechado';
  const invalidRange = !isFechado && inicio >= fim;
  const dataLabel = DateTime.fromISO(dateKey).setLocale('pt-PT').toFormat("cccc, d 'de' LLLL 'de' yyyy");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalidRange) return;
    setSaving(true);
    try {
      const payload = {
        data: dateKey,
        tipo,
        observacao,
        inicio: isFechado ? null : inicio,
        fim: isFechado ? null : fim,
      };
      if (existing) await actualizarExcecao(existing._id, payload);
      else await criarExcecao(payload);
      toast.success('✅ Excepção guardada!');
      onSaved();
      onClose();
    } catch (error) {
      toast.error('❌ Erro ao guardar a excepção');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      await removerExcecao(existing._id);
      toast.success('✅ Excepção removida');
      onSaved();
      onClose();
    } catch (error) {
      toast.error('❌ Erro ao remover a excepção');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Excepção de data</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 capitalize">{dataLabel}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">O que acontece neste dia?</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(TIPO_LABEL) as TipoExcecao[]).map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    tipo === t
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={t}
                    checked={tipo === t}
                    onChange={() => setTipo(t)}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t === 'fechado' ? 'Fechado (dia todo)' : TIPO_LABEL[t]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {!isFechado && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-300">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Início</label>
                <input
                  type="time"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Fim</label>
                <input
                  type="time"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  required
                />
              </div>
              {invalidRange && (
                <p className="col-span-2 text-red-500 dark:text-red-400 text-sm">A hora de início tem de ser anterior à hora de fim.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
              Nota (opcional)
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="ex.: Feriado, formação, folga…"
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{observacao.length}/280</p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div>
              {existing && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={saving}
                  className="px-4 py-2.5 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-all font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={invalidRange || saving}
                className="px-5 py-2.5 bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all font-medium shadow-lg shadow-indigo-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {saving ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// Cartão de um dia da semana (editor compacto do horário base)
const DayCard = ({ schedule, onEdit }: { schedule: Schedule; onEdit: (s: Schedule) => void }) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 dark:text-white">{schedule.label}</span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
              schedule.isActive
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
            }`}
          >
            {schedule.isActive ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
          {formatScheduleSummary(schedule)}
        </p>
      </div>
      <button
        onClick={() => onEdit(schedule)}
        className="shrink-0 px-4 py-2.5 text-sm bg-linear-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md flex items-center gap-1.5 font-medium"
      >
        <Edit2 className="w-4 h-4" />
        Editar
      </button>
    </div>
  </div>
);

const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const AgendaDisponibilidade = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Excepções por data
  const [month, setMonth] = useState<DateTime>(DateTime.now().setZone('Europe/Lisbon').startOf('month'));
  const [excecoes, setExcecoes] = useState<ScheduleException[]>([]);
  const [excModalDate, setExcModalDate] = useState<string | null>(null);
  const [excModalExisting, setExcModalExisting] = useState<ScheduleException | null>(null);
  const [isExcModalOpen, setIsExcModalOpen] = useState<boolean>(false);

  // Grelha do mês: 6 semanas a partir da 2ª-feira que contém o 1º dia do mês
  const gridStart = useMemo(() => month.startOf('week'), [month]);
  const gridDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i })),
    [gridStart]
  );

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      const { disponibilidade } = await getSchedules();
      setSchedules(disponibilidade);
      setError(null);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Ocorreu um erro desconhecido.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExcecoes = useCallback(async () => {
    try {
      const from = gridStart.toISODate() ?? undefined;
      const to = gridStart.plus({ days: 41 }).toISODate() ?? undefined;
      const data = await getExcecoes(from, to);
      setExcecoes(data);
    } catch {
      // Secundário — não pode partir a página; deixa o calendário vazio.
      setExcecoes([]);
    }
  }, [gridStart]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useEffect(() => {
    fetchExcecoes();
  }, [fetchExcecoes]);

  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setIsModalOpen(true);
  };
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSchedule(null);
  };

  const handleSaveSchedule = async (dayOfWeek: number, data: Partial<Schedule>) => {
    await updateSchedule(dayOfWeek, data);
    await fetchSchedules();
  };

  const handleCopyToWeekdays = async (source: Partial<Schedule>) => {
    const payload = {
      isActive: source.isActive ?? true,
      startTime: source.startTime ?? '09:00',
      endTime: source.endTime ?? '18:00',
      breakStartTime: source.breakStartTime ?? '',
      breakEndTime: source.breakEndTime ?? '',
    };
    const results = await Promise.allSettled(WEEKDAYS.map((day) => updateSchedule(day, payload)));
    await fetchSchedules();
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      toast.error(`❌ Falha ao copiar para ${failed} dia(s). Verifique e tente de novo.`);
    } else {
      toast.success('✅ Horários copiados para os dias úteis (Seg–Sex)!');
    }
  };

  const openExcecao = (dateKey: string) => {
    setExcModalDate(dateKey);
    setExcModalExisting(excecoes.find((e) => e.data === dateKey) ?? null);
    setIsExcModalOpen(true);
  };

  const hasActiveDays = useMemo(() => schedules.some((s) => s.isActive), [schedules]);

  const orderedSchedules = useMemo(
    () =>
      WEEK_ORDER.map((d) => schedules.find((s) => s.dayOfWeek === d)).filter(
        (s): s is Schedule => Boolean(s)
      ),
    [schedules]
  );

  const firstDay = useMemo(
    () => schedules.find((s) => s.dayOfWeek === 1) ?? orderedSchedules[0] ?? schedules[0] ?? null,
    [schedules, orderedSchedules]
  );

  // Mapa data → excepção para lookup rápido nas células
  const excecoesByDate = useMemo(() => {
    const map = new Map<string, ScheduleException>();
    for (const e of excecoes) map.set(e.data, e);
    return map;
  }, [excecoes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">A carregar horários...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
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
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-linear-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
                <CalendarClock className="w-7 h-7 text-indigo-500" />
                Disponibilidade
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                Define o teu <span className="font-semibold text-slate-600 dark:text-slate-300">horário base</span> e as excepções por data
              </p>
            </div>
            <button
              onClick={() => { fetchSchedules(); fetchExcecoes(); }}
              className="shrink-0 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
          </div>
        </div>

        {/* Empty state — CTA "Define o teu horário" */}
        {!hasActiveDays && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
            <div className="backdrop-blur-xl bg-linear-to-br from-indigo-500/10 to-purple-500/10 p-8 sm:p-12 text-center">
              <div className="w-16 h-16 bg-linear-to-r from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-500/30">
                <CalendarPlus className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Define o teu horário</h2>
              <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
                Ainda não configuraste nenhum dia de atendimento. Começa por definir o teu horário base — depois podes copiá-lo para os restantes dias úteis.
              </p>
              <button
                onClick={() => firstDay && handleEditSchedule(firstDay)}
                disabled={!firstDay}
                className="px-6 py-3 bg-linear-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 inline-flex items-center gap-2 disabled:opacity-50"
              >
                <CalendarPlus className="w-5 h-5" />
                Define o teu horário
              </button>
            </div>
          </div>
        )}

        {/* Secção "Horário base" */}
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Horário base</h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1">
            Recorrente · por dia da semana
          </span>
        </div>

        <div className="space-y-3" data-testid="day-by-day">
          {orderedSchedules.map((daySchedule) => (
            <DayCard key={daySchedule.dayOfWeek} schedule={daySchedule} onEdit={handleEditSchedule} />
          ))}
        </div>

        {/* Secção "Excepções por data" — calendário mensal */}
        <div className="mt-8 mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Excepções por data</h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1">
            Feriados · folgas · horas extra
          </span>
        </div>

        <div
          data-testid="excecoes-calendar"
          className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6"
        >
          {/* Navegação do mês */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setMonth((m) => m.minus({ months: 1 }))}
              aria-label="Mês anterior"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-bold text-slate-800 dark:text-white capitalize" data-testid="month-label">
              {month.setLocale('pt-PT').toFormat('LLLL yyyy')}
            </span>
            <button
              onClick={() => setMonth((m) => m.plus({ months: 1 }))}
              aria-label="Mês seguinte"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Células do mês */}
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((d) => {
              const dateKey = d.toISODate() as string;
              const inMonth = d.month === month.month;
              const exc = excecoesByDate.get(dateKey);
              const isToday = d.hasSame(DateTime.now().setZone('Europe/Lisbon'), 'day');

              let cellClass = 'relative min-h-16 sm:min-h-20 rounded-lg border p-1.5 text-left transition-all overflow-hidden ';
              if (!inMonth) {
                cellClass += 'border-transparent text-slate-300 dark:text-slate-600 ';
              } else if (exc?.tipo === 'fechado') {
                cellClass += 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 ';
              } else if (exc) {
                cellClass += 'border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 ';
              } else {
                cellClass += 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 ';
              }

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => openExcecao(dateKey)}
                  className={cellClass}
                  data-testid={`day-cell-${dateKey}`}
                  title={exc ? `${TIPO_LABEL[exc.tipo]}${exc.observacao ? ` · ${exc.observacao}` : ''}` : undefined}
                >
                  <span
                    className={`text-xs font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday && inMonth ? 'bg-indigo-500 text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {d.day}
                  </span>
                  {exc && inMonth && (
                    <span className="mt-1 block leading-tight">
                      <span
                        className={`block text-[10px] font-semibold truncate ${
                          exc.tipo === 'fechado'
                            ? 'text-red-600 dark:text-red-300'
                            : 'text-indigo-600 dark:text-indigo-300'
                        }`}
                      >
                        {formatExcecaoBadge(exc)}
                      </span>
                      {exc.observacao && (
                        <span className="block text-[9px] text-slate-500 dark:text-slate-400 truncate">
                          {exc.observacao}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800"></div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Fechado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800"></div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Horas extra / horário especial</span>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">Toca numa data para adicionar/editar.</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
          O horário base repete-se todas as semanas. As excepções acima têm precedência na data indicada. Para ver os agendamentos marcados, usa o <span className="font-medium">Calendário</span>.
        </p>
      </div>

      <EditScheduleModal
        schedule={editingSchedule}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveSchedule}
        onCopyToWeekdays={handleCopyToWeekdays}
      />

      <ExcecaoModal
        dateKey={excModalDate}
        existing={excModalExisting}
        isOpen={isExcModalOpen}
        onClose={() => setIsExcModalOpen(false)}
        onSaved={fetchExcecoes}
      />
    </div>
  );
};

export default AgendaDisponibilidade;
