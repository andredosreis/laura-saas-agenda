import { useEffect, useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Columns, List, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { KanbanColumn } from '../components/leads/KanbanColumn';
import { LeadCardKanban } from '../components/leads/LeadCardKanban';
import leadsService from '../services/leadsService';
import {
  type Lead,
  type LeadStatus,
  LEAD_STAGES,
} from '../types/lead';

function LeadsKanban() {
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingPerdido, setPendingPerdido] = useState<{ lead: Lead } | null>(null);

  const fetchLeads = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await leadsService.list({ limit: 100 });
      setLeads(res.data || []);
    } catch (err: unknown) {
      console.error('Erro ao carregar leads:', err);
      toast.error('Erro ao carregar o pipeline de leads.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const activeLead = activeId ? leads.find((l) => l._id === activeId) ?? null : null;

  const leadsPerStage = LEAD_STAGES.reduce<Record<LeadStatus, Lead[]>>((acc, stage) => {
    acc[stage] = leads.filter((l) => l.status === stage);
    return acc;
  }, {} as Record<LeadStatus, Lead[]>);

  const doMoveStage = useCallback(async (lead: Lead, toStage: LeadStatus, motivo?: string) => {
    setLeads((prev) =>
      prev.map((l) => (l._id === lead._id ? { ...l, status: toStage, ...(motivo ? { perdido: { motivo } } : {}) } : l))
    );
    try {
      await leadsService.moveStage(lead._id, { stage: toStage, ...(motivo ? { motivo } : {}) });
    } catch (err: unknown) {
      setLeads((prev) => prev.map((l) => (l._id === lead._id ? { ...l, status: lead.status } : l)));
      const axErr = err as { response?: { data?: { error?: string } } };
      toast.error(axErr?.response?.data?.error || 'Erro ao mover lead. Reverter.');
    }
  }, []);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const lead = leads.find((l) => l._id === String(active.id));
    if (!lead) return;

    const toStage = String(over.id) as LeadStatus;
    if (toStage === lead.status) return;
    if (toStage === 'convertido') {
      toast.info('Conversão só é possível via botão "Converter em Cliente" na ficha do lead.');
      return;
    }
    if (toStage === 'perdido') {
      setPendingPerdido({ lead });
      return;
    }

    doMoveStage(lead, toStage);
  };

  const handlePerdidoConfirm = (motivo: string) => {
    if (!pendingPerdido) return;
    doMoveStage(pendingPerdido.lead, 'perdido', motivo || 'sem motivo');
    setPendingPerdido(null);
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen pt-24 flex flex-col items-center justify-center ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className={`mt-3 text-base ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>A carregar pipeline...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`min-h-screen pt-24 pb-8 ${isDarkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        {/* Header */}
        <div className="px-4 sm:px-6 lg:px-8 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <Columns className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500" />
                Pipeline de Leads
              </h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                {leads.length} {leads.length === 1 ? 'lead' : 'leads'} no total
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchLeads}
                disabled={isLoading}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                    : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
              {/* Toggle Lista / Kanban */}
              <div className={`flex rounded-xl overflow-hidden border text-sm font-medium ${isDarkMode ? 'border-white/10' : 'border-gray-200'}`}>
                <button
                  onClick={() => navigate('/leads')}
                  className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${
                    isDarkMode
                      ? 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      : 'bg-white text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">Lista</span>
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white"
                  aria-current="page"
                >
                  <Columns className="w-4 h-4" />
                  <span className="hidden sm:inline">Kanban</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Kanban board — horizontal scroll */}
        <div className="px-4 sm:px-6 lg:px-8 overflow-x-auto pb-4">
          <DndContext
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 min-w-max">
              {LEAD_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  leads={leadsPerStage[stage]}
                  isDarkMode={isDarkMode}
                >
                  {leadsPerStage[stage].map((lead) => (
                    <LeadCardKanban
                      key={lead._id}
                      lead={lead}
                      onView={(id) => navigate(`/leads/${id}`)}
                      isDarkMode={isDarkMode}
                    />
                  ))}
                </KanbanColumn>
              ))}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeLead ? (
                <LeadCardKanban
                  lead={activeLead}
                  onView={() => {}}
                  isDarkMode={isDarkMode}
                  isOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* Perdido modal */}
      {pendingPerdido && (
        <PerdidoModal
          leadNome={pendingPerdido.lead.nome || pendingPerdido.lead.telefone}
          isDarkMode={isDarkMode}
          onConfirm={handlePerdidoConfirm}
          onCancel={() => setPendingPerdido(null)}
        />
      )}
    </ErrorBoundary>
  );
}

// =====================================================================
// PerdidoModal
// =====================================================================

interface PerdidoModalProps {
  leadNome: string;
  isDarkMode: boolean;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}

function PerdidoModal({ leadNome, isDarkMode, onConfirm, onCancel }: PerdidoModalProps) {
  const [motivo, setMotivo] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`w-full max-w-sm rounded-2xl shadow-2xl ${isDarkMode ? 'bg-slate-800 border border-white/10' : 'bg-white'}`}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Marcar como Perdido
          </h3>
          <button onClick={onCancel} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}`}>
            Mover <strong>{leadNome}</strong> para "Perdido". Qual o motivo?
          </p>
          <textarea
            autoFocus
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Sem orçamento, não respondeu, foi a concorrente..."
            className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none ${
              isDarkMode
                ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-400'
                : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
            }`}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isDarkMode ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              Cancelar
            </button>
            <button
              onClick={() => onConfirm(motivo)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LeadsKanban;
