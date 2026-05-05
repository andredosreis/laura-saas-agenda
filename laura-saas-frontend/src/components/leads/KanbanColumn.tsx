import { useDroppable } from '@dnd-kit/core';
import { Lock } from 'lucide-react';
import type { Lead, LeadStatus } from '../../types/lead';
import { LEAD_STAGE_COLORS, LEAD_STAGE_LABELS } from '../../types/lead';

interface KanbanColumnProps {
  stage: LeadStatus;
  leads: Lead[];
  children: React.ReactNode;
  isDarkMode: boolean;
}

export function KanbanColumn({ stage, leads, children, isDarkMode }: KanbanColumnProps) {
  const isLocked = stage === 'convertido';

  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    disabled: isLocked,
  });

  const color = LEAD_STAGE_COLORS[stage];

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-xl border-b"
        style={{
          backgroundColor: `${color}15`,
          borderColor: `${color}30`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span
            className="text-sm font-semibold"
            style={{ color }}
          >
            {LEAD_STAGE_LABELS[stage]}
          </span>
          {isLocked && (
            <Lock className="w-3 h-3 opacity-60" style={{ color }} />
          )}
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}25`, color }}
        >
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex-1 min-h-32 p-2 rounded-b-xl flex flex-col gap-2 transition-colors duration-150"
        style={{
          backgroundColor: isOver && !isLocked
            ? `${color}10`
            : isDarkMode
              ? 'rgba(15,23,42,0.5)'
              : 'rgba(248,250,252,0.8)',
          border: isOver && !isLocked
            ? `2px dashed ${color}60`
            : '2px dashed transparent',
        }}
      >
        {children}

        {leads.length === 0 && (
          <div
            className="flex-1 flex items-center justify-center text-xs rounded-lg py-6"
            style={{ color: `${color}70` }}
          >
            {isLocked ? 'Apenas via conversão' : 'Arrasta leads aqui'}
          </div>
        )}
      </div>
    </div>
  );
}
