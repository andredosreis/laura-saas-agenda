import React from 'react';
import { TenantStats } from './adminStats';

export const STATUS_STYLES: Record<string, { pill: string; dot: string; label: string }> = {
  // Tenant — plano.status
  trial: { pill: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400', label: 'Trial' },
  ativo: { pill: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400', label: 'Activo' },
  suspenso: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Suspenso' },
  expirado: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Expirado' },
  cancelado: { pill: 'bg-dark-600/40 text-dark-300', dot: 'bg-dark-400', label: 'Cancelado' },
  // Audit log — status
  ok: { pill: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400', label: 'OK' },
  denied: { pill: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400', label: 'Denied' },
  error: { pill: 'bg-red-500/15 text-red-300', dot: 'bg-red-400', label: 'Error' },
};

export const PLAN_STYLES: Record<string, string> = {
  basico: 'bg-dark-700 text-dark-300',
  pro: 'bg-primary-500/20 text-primary-300',
  elite: 'bg-purple-500/20 text-purple-300',
  custom: 'bg-dark-700 text-dark-300',
};

export const FEATURE_FLAG_LABELS: Record<string, string> = {
  leadsAtivo: 'Leads CRM',
  iaAtiva: 'IA Atendimento',
  whatsappAutomacao: 'WhatsApp Automação',
  lembretesWhatsapp: 'Lembretes WhatsApp',
  analytics: 'Analytics',
  relatorios: 'Relatórios',
  exportPdf: 'Export PDF',
  brandingPersonalizado: 'Branding',
};

// Convenção do backend (adminSchemas.js): limites numéricos usam -1 para "ilimitado".
export function formatLimite(n: number | undefined): string {
  if (n === undefined) return '∞';
  return n === -1 ? '∞' : String(n);
}

export function initialsFromName(name: string | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.ativo;
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[2px] text-[12.5px] font-semibold whitespace-nowrap ${s.pill}`}
    >
      <span className={`w-[7px] h-[7px] rounded-[1px] inline-block ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function PlanBadge({ plano }: { plano: string }) {
  const cls = PLAN_STYLES[plano] ?? PLAN_STYLES.basico;
  return (
    <span
      className={`font-console-mono inline-flex items-center h-[22px] px-2.5 rounded-[2px] text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap ${cls}`}
    >
      {plano}
    </span>
  );
}

export function Avatar({ name, size = 34 }: { name: string | undefined; size?: number }) {
  return (
    <span
      className="font-console-mono rounded-full flex items-center justify-center font-semibold shrink-0 bg-gradient-to-br from-primary-500 to-purple-600 text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
    >
      {initialsFromName(name)}
    </span>
  );
}

export function ConsoleCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-dark-800 border border-white/10 rounded-[3px] ${className}`}>
      {children}
    </div>
  );
}

export function StatBlock({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <ConsoleCard className="p-[14px_15px]">
      <div className={`font-console-mono text-[10px] uppercase tracking-[.1em] ${accent ? 'text-primary-400' : 'text-dark-400'}`}>
        {label}
      </div>
      <div className={`font-console-mono text-[25px] font-semibold mt-[7px] ${accent ? 'text-primary-300' : 'text-dark-50'}`}>
        {value}
      </div>
    </ConsoleCard>
  );
}

export function KpiCard({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-[15px_17px]">
      <div className="font-console-mono text-[10px] uppercase tracking-[.1em] text-dark-400">{label}</div>
      <div className={`font-console-mono text-[26px] font-semibold mt-2 ${accent ? 'text-primary-300' : 'text-dark-50'}`}>
        {value}
      </div>
    </div>
  );
}

const PLAN_BAR_COLORS: Record<string, string> = {
  basico: 'bg-dark-500',
  pro: 'bg-primary-500',
  elite: 'bg-purple-500',
  custom: 'bg-dark-600',
};
const PLAN_ORDER = ['basico', 'pro', 'elite', 'custom'] as const;

export function PlanDistributionBar({ distribution }: { distribution: TenantStats['distribution'] }) {
  const total = PLAN_ORDER.reduce((sum, k) => sum + distribution[k], 0);
  return (
    <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-[15px_17px]">
      <div className="font-console-mono text-[10px] uppercase tracking-[.1em] text-dark-400 mb-3">
        Distribuição por plano
      </div>
      {total === 0 ? (
        <div className="text-dark-400 text-[13px]">Sem tenants.</div>
      ) : (
        <>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-dark-900">
            {PLAN_ORDER.filter((k) => distribution[k] > 0).map((k) => (
              <div key={k} className={PLAN_BAR_COLORS[k]} style={{ width: `${(distribution[k] / total) * 100}%` }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 font-console-mono text-[12px] text-dark-300">
            {PLAN_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-sm ${PLAN_BAR_COLORS[k]}`} />
                <span className="capitalize">{k}</span> {distribution[k]}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
