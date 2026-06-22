export type PlanoTipo = 'basico' | 'pro' | 'elite' | 'custom';
export type PlanoStatus = 'trial' | 'ativo' | 'suspenso' | 'cancelado' | 'expirado';

export interface TenantSummary {
  _id: string;
  nome: string;
  slug: string;
  plano: {
    tipo: PlanoTipo;
    status: PlanoStatus;
  };
  createdAt: string;
}

// Limites e feature flags partilham o mesmo sub-documento `limites` no Tenant —
// números (-1 = ilimitado, ver adminSchemas.js) e booleans misturados (F07).
export interface TenantLimites {
  maxUsuarios: number;
  maxClientes: number;
  maxAgendamentosMes: number;
  maxLeads: number;
  leadsAtivo: boolean;
  iaAtiva: boolean;
  whatsappAutomacao: boolean;
  lembretesWhatsapp: boolean;
  analytics: boolean;
  relatorios: boolean;
  exportPdf: boolean;
  brandingPersonalizado: boolean;
}

export interface TenantDetail {
  _id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  isTrialExpired: boolean;
  diasRestantesTrial: number;
  plano: {
    tipo: PlanoTipo;
    status: PlanoStatus;
    preco: number;
    moeda: string;
    ciclo: 'mensal' | 'anual';
  };
  limites: TenantLimites;
  createdAt: string;
}

export interface TenantUsage {
  clientes: number;
  agendamentos: number;
  mensagens: number;
}

export interface AuditLogEntry {
  _id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetTenantId: string | null;
  status: 'ok' | 'denied' | 'error';
  before?: any;
  after?: any;
  metadata?: any;
  createdAt: string;
}

export interface PaginationInfo {
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: PaginationInfo;
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
}
