/**
 * Types do módulo de Leads.
 * Sincronizados com `src/models/Lead.js` e `src/modules/leads/pipelineConstants.js`.
 */

export const LEAD_STAGES = [
  'novo',
  'em_conversa',
  'qualificado',
  'agendado',
  'convertido',
  'perdido',
] as const;

export type LeadStatus = typeof LEAD_STAGES[number];

export const LEAD_STAGE_LABELS: Record<LeadStatus, string> = {
  novo: 'Novo',
  em_conversa: 'Em conversa',
  qualificado: 'Qualificado',
  agendado: 'Agendado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

export const LEAD_STAGE_COLORS: Record<LeadStatus, string> = {
  novo: '#6366f1',
  em_conversa: '#8b5cf6',
  qualificado: '#f59e0b',
  agendado: '#10b981',
  convertido: '#22c55e',
  perdido: '#ef4444',
};

export const LEAD_ORIGEM = ['whatsapp', 'manual', 'import', 'outro'] as const;
export type LeadOrigem = typeof LEAD_ORIGEM[number];

export const LEAD_URGENCIA = ['baixa', 'media', 'alta'] as const;
export type LeadUrgencia = typeof LEAD_URGENCIA[number];

export interface Lead {
  _id: string;
  tenantId: string;
  nome?: string;
  telefone: string;
  email?: string | null;
  origem: LeadOrigem;
  status: LeadStatus;
  interesse?: string;
  urgencia: LeadUrgencia;
  observacoes?: string;
  ultimaInteracao: string;
  conversa?: string | null;
  agendamento?: string | null;
  cliente?: string | null;
  iaAtiva: boolean;
  qualificacao?: {
    score?: number;
    motivoInteresse?: string;
    objetivos?: string[];
  };
  perdido?: { motivo?: string; em?: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadDTO {
  nome?: string;
  telefone: string;
  email?: string;
  origem?: LeadOrigem;
  interesse?: string;
  urgencia?: LeadUrgencia;
  observacoes?: string;
}

export interface UpdateLeadDTO {
  nome?: string | null;
  telefone?: string;
  email?: string | null;
  interesse?: string | null;
  urgencia?: LeadUrgencia;
  observacoes?: string | null;
}

export interface MoveStageDTO {
  stage: LeadStatus;
  motivo?: string;
}

export interface ManualReplyDTO {
  mensagem: string;
  pausarIa?: boolean;
}

export interface ConvertLeadDTO {
  nome?: string;
  email?: string;
  observacoes?: string;
}

export interface LeadsListResponse {
  success: true;
  data: Lead[];
  pagination: {
    total: number;
    page: number;
    pages: number;
    limit: number;
  };
}

export interface LeadResponse {
  success: true;
  data: Lead;
}

export interface LeadDetailResponse {
  success: true;
  data: {
    lead: Lead;
    conversa: unknown | null;
  };
}
