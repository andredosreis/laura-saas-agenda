import React from 'react';

export const STATUS_STYLES: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  // Tenant — plano.status
  trial: { bg: '#f4ebd7', color: '#8a610f', dot: '#b5862f', label: 'Trial' },
  ativo: { bg: '#e7eee4', color: '#3f6b3c', dot: '#3f6b3c', label: 'Activo' },
  suspenso: { bg: '#f4e0db', color: '#9e2f22', dot: '#9e2f22', label: 'Suspenso' },
  expirado: { bg: '#f4e0db', color: '#9e2f22', dot: '#9e2f22', label: 'Expirado' },
  cancelado: { bg: '#efece7', color: '#6f6862', dot: '#9a938c', label: 'Cancelado' },
  // Audit log — status
  ok: { bg: '#e7eee4', color: '#3f6b3c', dot: '#3f6b3c', label: 'OK' },
  denied: { bg: '#f4ebd7', color: '#8a610f', dot: '#b5862f', label: 'Denied' },
  error: { bg: '#f4e0db', color: '#9e2f22', dot: '#9e2f22', label: 'Error' },
};

export const PLAN_STYLES: Record<string, { bg: string; color: string }> = {
  basico: { bg: '#efece7', color: '#6f6862' },
  pro: { bg: '#2a2723', color: '#f4f1ec' },
  elite: { bg: '#f0ddcf', color: '#a14d27' },
  custom: { bg: '#efece7', color: '#221f1d' },
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
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-[2px] text-[12.5px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      <span className="w-[7px] h-[7px] rounded-[1px] inline-block" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function PlanBadge({ plano }: { plano: string }) {
  const p = PLAN_STYLES[plano] ?? PLAN_STYLES.basico;
  return (
    <span
      className="font-console-mono inline-flex items-center h-[22px] px-2.5 rounded-[2px] text-[10.5px] font-semibold uppercase tracking-wide whitespace-nowrap"
      style={{ background: p.bg, color: p.color }}
    >
      {plano}
    </span>
  );
}

export function Avatar({ name, size = 34 }: { name: string | undefined; size?: number }) {
  return (
    <span
      className="font-console-mono rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        background: '#f0ddcf',
        color: '#a14d27',
        fontSize: Math.round(size * 0.35),
      }}
    >
      {initialsFromName(name)}
    </span>
  );
}

export function ConsoleCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#e8e2da] rounded-[3px] ${className}`}>
      {children}
    </div>
  );
}

export function StatBlock({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <ConsoleCard className="p-[14px_15px]">
      <div
        className="font-console-mono text-[10px] uppercase tracking-[.1em]"
        style={{ color: accent ? '#a14d27' : '#9a938c' }}
      >
        {label}
      </div>
      <div
        className="font-console-mono text-[25px] font-semibold mt-[7px]"
        style={{ color: accent ? '#a14d27' : '#221f1d' }}
      >
        {value}
      </div>
    </ConsoleCard>
  );
}
