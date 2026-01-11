import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarCheck,
  Package,
  Clock,
  TrendingUp,
  LogOut,
  Menu,
  X,
  Sparkles,
  DollarSign,
  ShoppingBag,
  Receipt
} from 'lucide-react';

function Navbar() {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = [
    { to: "/dashboard", text: "Dashboard", icon: LayoutDashboard },
    { to: "/clientes", text: "Clientes", icon: Users },
    { to: "/agendamentos", text: "Agendamentos", icon: Calendar },
    { to: "/calendario", text: "Calendário", icon: CalendarCheck },
    { to: "/pacotes", text: "Serviços", icon: Package },
    { to: "/pacotes-ativos", text: "Vendas", icon: ShoppingBag },
    { to: "/caixa", text: "Caixa", icon: DollarSign },
    { to: "/financeiro", text: "Relatórios", icon: TrendingUp },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Estilos de Link
  const getLinkClasses = ({ isActive }) => `
    flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-all duration-300 font-medium text-sm
    ${isActive
      ? 'bg-indigo-500/20 text-indigo-400 shadow-lg shadow-indigo-500/10'
      : 'text-slate-400 hover:text-white hover:bg-white/5'}
  `;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-lg border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo / Brand */}
          <NavLink
            to="/dashboard"
            className="flex items-center gap-2 group"
            onClick={closeMobileMenu}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Laura SAAS
            </span>
          </NavLink>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={getLinkClasses}
                end={link.to === "/dashboard"}
              >
                <link.icon className="w-4 h-4" />
                <span>{link.text}</span>
              </NavLink>
            ))}

            {/* Divider */}
            <div className="h-6 w-px bg-white/10 mx-1" />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all duration-300 border border-red-500/30"
              title="Sair do sistema"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/5 bg-slate-900">
          <div className="px-4 py-3 space-y-2">
            {/* User Info Mobile */}
            <div className="flex items-center gap-3 px-3 py-3 mb-4 rounded-xl bg-white/5">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold">
                {user?.nome?.[0] || 'U'}
              </div>
              <div>
                <p className="text-white font-medium">{user?.nome || 'Usuário'}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>

            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => `
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300
                  ${isActive
                    ? 'bg-indigo-500/20 text-indigo-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'}
                `}
                onClick={closeMobileMenu}
                end={link.to === "/dashboard"}
              >
                <link.icon className="w-5 h-5" />
                <span className="font-medium">{link.text}</span>
              </NavLink>
            ))}

            <div className="h-px bg-white/5 my-2" />

            {/* Logout Mobile */}
            <button
              onClick={() => {
                closeMobileMenu();
                handleLogout();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sair da Conta</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;