import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { initialsFromName } from './ConsoleUI';

const NAV_ITEMS = [
  { to: '/admin/tenants', label: 'Tenants' },
  { to: '/admin/audit', label: 'Audit Logs' },
];

const mesAno = new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

export function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#211f1c] font-console p-5 sm:p-9">
      <div className="max-w-[1160px] mx-auto">
        <header className="flex items-center justify-between gap-6 flex-wrap mb-7">
          <div className="flex items-center gap-3.5">
            <div className="w-8 h-8 bg-[#f4f1ec] rounded flex items-center justify-center shrink-0">
              <div className="w-[13px] h-[13px] rounded-full bg-[#bd5d33]" />
            </div>
            <div>
              <div className="text-[#f4f1ec] text-[19px] font-semibold tracking-tight">
                Marcaí · Consola de Operador
              </div>
              <div className="text-[#8f877d] text-[13px] mt-0.5">
                Back-office multi-tenant · visão do fundador
              </div>
            </div>
          </div>

          <nav className="font-console-mono flex items-center gap-5 text-[11px] uppercase tracking-[.1em]">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `pb-1 border-b transition-colors ${
                    isActive
                      ? 'text-[#f4f1ec] border-[#bd5d33]'
                      : 'text-[#8f877d] border-transparent hover:text-[#c8c0b6]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <div className="bg-[#f4f1ec] border border-[#34302b] rounded-[5px] overflow-hidden">
          <div className="flex items-center justify-between px-[22px] py-[15px] bg-[#fbf9f6] border-b border-[#e8e2da]">
            <div className="flex items-center gap-[11px]">
              <div className="w-[26px] h-[26px] bg-[#221f1d] rounded-[3px] flex items-center justify-center shrink-0">
                <div className="w-[11px] h-[11px] rounded-full bg-[#bd5d33]" />
              </div>
              <span className="text-[16px] font-semibold tracking-tight text-[#221f1d]">Marcaí</span>
              <span className="font-console-mono text-[10px] uppercase tracking-[.12em] text-[#a59d93] border-l border-[#ddd5ca] pl-[11px]">
                Consola
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="font-console-mono text-xs text-[#6f6862] capitalize hidden sm:inline">{mesAno}</span>
              <div className="w-[30px] h-[30px] rounded-full bg-[#221f1d] flex items-center justify-center shrink-0">
                <span className="font-console-mono text-xs font-semibold text-[#f4f1ec]">
                  {initialsFromName(user?.nome)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-[18px] sm:p-[22px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
