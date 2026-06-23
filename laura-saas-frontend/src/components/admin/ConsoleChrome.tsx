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
    <div className="min-h-screen bg-dark-900 p-5 sm:p-9">
      <div className="max-w-[1160px] mx-auto">
        <header className="flex items-center justify-between gap-6 flex-wrap mb-7">
          <div className="flex items-center gap-3.5">
            <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center shrink-0">
              <div className="w-[13px] h-[13px] rounded-full bg-primary-500" />
            </div>
            <div>
              <div className="text-dark-50 text-[19px] font-semibold tracking-tight">
                Marcaí · Consola de Operador
              </div>
              <div className="text-dark-400 text-[13px] mt-0.5">
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
                      ? 'text-dark-50 border-primary-500'
                      : 'text-dark-400 border-transparent hover:text-dark-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <div className="bg-dark-800 border border-white/10 rounded-[5px] overflow-hidden">
          <div className="flex items-center justify-between px-[22px] py-[15px] bg-white/5 border-b border-white/10">
            <div className="flex items-center gap-[11px]">
              <div className="w-[26px] h-[26px] bg-white/10 rounded-[3px] flex items-center justify-center shrink-0">
                <div className="w-[11px] h-[11px] rounded-full bg-primary-500" />
              </div>
              <span className="text-[16px] font-semibold tracking-tight text-dark-50">Marcaí</span>
              <span className="font-console-mono text-[10px] uppercase tracking-[.12em] text-dark-400 border-l border-white/10 pl-[11px]">
                Consola
              </span>
            </div>
            <div className="flex items-center gap-3.5">
              <span className="font-console-mono text-xs text-dark-400 capitalize hidden sm:inline">{mesAno}</span>
              <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shrink-0">
                <span className="font-console-mono text-xs font-semibold text-white">
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
