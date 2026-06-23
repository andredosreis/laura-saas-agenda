import { TenantSummary } from '../../types/admin';

export interface TenantStats {
  trial: number;
  ativos: number;
  suspensos: number;
  distribution: { basico: number; pro: number; elite: number; custom: number };
}

/** Deriva contagens de estado e distribuição por plano a partir da lista carregada. */
export function computeTenantStats(tenants: TenantSummary[]): TenantStats {
  const stats: TenantStats = {
    trial: 0,
    ativos: 0,
    suspensos: 0,
    distribution: { basico: 0, pro: 0, elite: 0, custom: 0 },
  };
  for (const t of tenants) {
    if (t.plano.status === 'trial') stats.trial++;
    else if (t.plano.status === 'ativo') stats.ativos++;
    // expirado conta como suspenso (ambos = tenant sem acesso). cancelado (churn)
    // não entra em nenhum card de estado — só no total e na distribuição por plano.
    else if (t.plano.status === 'suspenso' || t.plano.status === 'expirado') stats.suspensos++;
    stats.distribution[t.plano.tipo]++;
  }
  return stats;
}
