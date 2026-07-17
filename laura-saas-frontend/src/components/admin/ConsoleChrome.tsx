import React, { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { initialsFromName } from './ConsoleUI';
import { TWO_FACTOR_SETUP_REQUIRED_EVENT } from '../../services/api';

const NAV_ITEMS = [
  { to: '/admin/tenants', label: 'Tenants' },
  { to: '/admin/audit', label: 'Audit Logs' },
  { to: '/admin/security', label: 'Segurança' },
];

const mesAno = new Date().toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

export function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [show2FASetupBanner, setShow2FASetupBanner] = useState(false);
  const environmentLabel = import.meta.env.VITE_ENV_LABEL?.trim()
    || (import.meta.env.PROD ? 'PRODUÇÃO' : 'DEV');
  // O vermelho é o sinal de perigo, por isso não pode depender de o rótulo estar
  // escrito exactamente "PRODUÇÃO": PROD, PRODUCTION e Produção contam todos.
  const isProduction = /^prod/i.test(
    environmentLabel.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  );

  useEffect(() => {
    const showBanner = () => setShow2FASetupBanner(true);
    window.addEventListener(TWO_FACTOR_SETUP_REQUIRED_EVENT, showBanner);
    return () => window.removeEventListener(TWO_FACTOR_SETUP_REQUIRED_EVENT, showBanner);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-dark-900 p-5 sm:p-9">
      <div className="max-w-[1160px] mx-auto">
        <header className="flex items-center justify-between gap-6 flex-wrap mb-7">
          <div className="flex items-center gap-3.5">
            <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center shrink-0">
              <div className="w-[13px] h-[13px] rounded-full bg-primary-500" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-dark-50 text-[19px] font-semibold tracking-tight">
                  Marcaí · Consola de Operador
                </div>
                <span
                  aria-label={`Ambiente: ${environmentLabel}`}
                  className={`font-console-mono text-xs tracking-widest uppercase rounded-[2px] px-2 py-0.5 border ${
                    isProduction
                      ? 'bg-red-500/15 text-red-300 border-red-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {environmentLabel}
                </span>
              </div>
              <div className="text-dark-400 text-[13px] mt-0.5">
                Back-office multi-tenant · visão do fundador
              </div>
            </div>
          </div>

          <nav aria-label="Navegação da consola" className="font-console-mono flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[.1em]">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center px-2 border-b transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400 ${
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

        {show2FASetupBanner && (
          <div
            role="status"
            className="mb-4 flex flex-col gap-3 border border-amber-500/35 bg-amber-500/10 p-4 text-amber-100 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold">A autenticação em dois passos é obrigatória.</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-amber-100/80">
                  Configure uma aplicação autenticadora para voltar a usar as áreas protegidas da consola.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/admin/security"
                className="inline-flex min-h-11 items-center rounded-[2px] bg-amber-300 px-4 text-[13px] font-semibold text-dark-900 transition-colors hover:bg-amber-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-100"
              >
                Configurar 2FA
              </Link>
              <button
                type="button"
                onClick={() => setShow2FASetupBanner(false)}
                aria-label="Fechar aviso de 2FA"
                className="inline-flex h-11 w-11 items-center justify-center rounded-[2px] text-amber-100 transition-colors hover:bg-amber-400/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

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
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-11 bg-dark-900 border border-white/10 hover:border-primary-500 text-dark-200 px-3 py-1.5 rounded-[2px] text-[12px] font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                Sair
              </button>
            </div>
          </div>

          <div className="p-[18px] sm:p-[22px]">{children}</div>
        </div>
      </div>
    </div>
  );
}
