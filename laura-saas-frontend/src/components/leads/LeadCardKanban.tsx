import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Phone, Sparkles, GripVertical } from 'lucide-react';
import type { Lead } from '../../types/lead';
import { LEAD_STAGE_COLORS } from '../../types/lead';

interface LeadCardKanbanProps {
  lead: Lead;
  onView: (id: string) => void;
  isDarkMode: boolean;
  isOverlay?: boolean;
}

const urgenciaColors: Record<string, string> = {
  alta: '#ef4444',
  media: '#f59e0b',
  baixa: '#94a3b8',
};

export function LeadCardKanban({ lead, onView, isDarkMode, isOverlay = false }: LeadCardKanbanProps) {
  const isLocked = lead.status === 'convertido';

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead._id,
    data: { lead },
    disabled: isLocked,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const cor = LEAD_STAGE_COLORS[lead.status];
  const inicial = (lead.nome || lead.telefone || '?').charAt(0).toUpperCase();

  const baseClass = isDarkMode
    ? 'bg-slate-800 border border-white/10 hover:border-white/20'
    : 'bg-white border border-gray-200 hover:border-gray-300 shadow-xs';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        ${baseClass} rounded-xl p-3.5 select-none
        transition-shadow duration-150
        ${isDragging && !isOverlay ? 'opacity-30 shadow-none' : 'opacity-100'}
        ${isOverlay ? 'shadow-2xl rotate-2 cursor-grabbing' : 'cursor-default'}
      `}
    >
      <div className="flex items-start gap-2">
        {/* drag handle */}
        {!isLocked && (
          <button
            {...listeners}
            {...attributes}
            className={`mt-0.5 p-0.5 rounded cursor-grab active:cursor-grabbing shrink-0 ${
              isDarkMode ? 'text-slate-600 hover:text-slate-400' : 'text-gray-300 hover:text-gray-500'
            }`}
            tabIndex={-1}
            aria-label="Arrastar lead"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}

        {/* avatar */}
        <div
          className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-sm"
          style={{ backgroundColor: `${cor}20`, color: cor }}
        >
          {inicial}
        </div>

        {/* info */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onView(lead._id)}
            className={`block w-full text-left font-semibold text-sm truncate hover:text-indigo-400 transition-colors ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}
          >
            {lead.nome || 'Lead sem nome'}
          </button>
          <p className={`text-xs flex items-center gap-1 mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
            <Phone className="w-3 h-3 shrink-0" />
            <span className="truncate">{lead.telefone}</span>
          </p>
        </div>
      </div>

      {lead.interesse && (
        <div className={`flex items-center gap-1.5 mt-2 text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
          <Sparkles className="w-3 h-3 shrink-0" />
          <span className="truncate">{lead.interesse}</span>
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5 gap-1.5">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: `${urgenciaColors[lead.urgencia]}20`,
            color: urgenciaColors[lead.urgencia],
          }}
        >
          {lead.urgencia}
        </span>
        {!lead.iaAtiva && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
            IA off
          </span>
        )}
      </div>
    </div>
  );
}
