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
    dataExpiracao?: string | null;
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

// F11 — payloads de mutação (mirroring src/modules/admin/adminSchemas.js)
export interface CreateTenantInput {
  nomeEmpresa: string;
  slug?: string;
  planoTipo?: PlanoTipo;
  adminNome: string;
  adminEmail: string;
}

export interface CreateTenantResult {
  tenantId: string;
  adminUserId: string;
}

export interface UpdatePlanoInput {
  tipo?: PlanoTipo;
  dataExpiracao?: string;
}

export type UpdateLimitesInput = Partial<TenantLimites>;

// F18 — Server-Side Tenant Search, Filters & Stats
// Mirrors GET /admin/tenants/stats (src/modules/admin/adminController.js — obterTenantStats).
// Movido de components/admin/adminStats.ts (F18 apagou o cálculo client-side):
// PlanDistributionBar consome directamente `porTipo`, que tem o mesmo shape
// { basico, pro, elite, custom } que o antigo `TenantStats['distribution']`.
export interface TenantStats {
  total: number;
  porStatus: Record<PlanoStatus, number>;
  porTipo: Record<PlanoTipo, number>;
}

// ---------------------------------------------------------------------------
// F21 — Per-Tenant WhatsApp/Evolution Management
// ---------------------------------------------------------------------------

// Estados devolvidos pela Evolution v2 (`/instance/connectionState`) + o nosso
// `unknown`, usado quando ela não é alcançável ou não há instância para consultar.
export type WhatsAppConnectionState = 'open' | 'connecting' | 'close' | 'unknown';

/**
 * GET /admin/tenants/:id/whatsapp
 *
 * `instanceToken` não existe neste tipo por desenho — o backend nunca o devolve
 * (é a credencial da instância na Evolution). Não o acrescentar aqui.
 *
 * `evolutionReachable: false` significa "não confirmado": ou a Evolution está em
 * baixo, ou não há instância para consultar. `instanceName === null` distingue
 * os dois casos.
 */
export interface TenantWhatsApp {
  provider: string;
  instanceName: string | null;
  numeroWhatsapp: string | null;
  webhookConfigured: boolean;
  connectionState: WhatsAppConnectionState;
  evolutionReachable: boolean;
}

/** GET /admin/tenants/:id/whatsapp/qr — credencial de sessão, nunca persistida. */
export interface TenantWhatsAppQR {
  qrBase64: string | null;
  pairingCode: string | null;
}

/** POST /admin/tenants/:id/whatsapp/instancia */
export interface CreateWhatsAppInstanceInput {
  instanceName?: string;
}

export interface CreateWhatsAppInstanceResult {
  instanceName: string;
  connectionState: WhatsAppConnectionState;
}
