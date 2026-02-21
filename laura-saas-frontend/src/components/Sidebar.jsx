import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Package,
  Clock,
  TrendingUp,
  LogOut,
  Menu,
  X,
  DollarSign,
  ShoppingBag,
  Receipt,
  ChevronDown,
  ChevronUp,
  CalendarClock
} from 'lucide-react';
import MarcaiLogo from './MarcaiLogo';

function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({
    financas: true,
    agendamento: true,
    administrativo: true
  });
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const closeMobileMenu = () => setIsMobileOpen(false);

  // Menu structure with groups
  const menuGroups = [
    {
      id: 'dashboard',
      label: null, // Dashboard é standalone, sem grupo
      items: [
        { to: "/dashboard", text: "Dashboard", icon: LayoutDashboard }
      ]
    },
    {
      id: 'financas',
      label: 'FINANÇAS',
      items: [
        { to: "/transacoes", text: "Transações", icon: Receipt },
        { to: "/caixa", text: "Caixa", icon: DollarSign },
        { to: "/pacotes-ativos", text: "Vendas", icon: ShoppingBag },
        { to: "/financeiro", text: "Relatórios", icon: TrendingUp }
      ]
    },
    {
      id: 'agendamento',
      label: 'AGENDAMENTO',
      items: [
        { to: "/calendario", text: "Calendário", icon: Calendar },
        { to: "/atendimentos", text: "Atendimentos", icon: CalendarClock }
      ]
    },
    {
      id: 'administrativo',
      label: 'ADMINISTRATIVO',
      items: [
        { to: "/clientes", text: "Clientes", icon: Users },
        { to: "/pacotes", text: "Serviços", icon: Package },
        { to: "/disponibilidade", text: "Disponibilidade", icon: Clock }
      ]
    }
  ];

  // Estilos de Link
  const getLinkClasses = ({ isActive }) => `
    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 font-medium text-sm
    ${isActive
      ? 'bg-indigo-500/20 text-indigo-400 shadow-lg shadow-indigo-500/10'
      : 'text-slate-400 hover:text-white hover:bg-white/5'}
  `;

  const SidebarContent = () => (
    <div className="h-full flex flex-col bg-slate-900 border-r border-white/5">
      {/* Header - Logo e User Info */}
      <div className="px-4 py-6 border-b border-white/5">
        {/* Logo */}
        <NavLink
          to="/dashboard"
          className="flex items-center mb-5"
          onClick={closeMobileMenu}
        >
          <MarcaiLogo width={160} height={48} />
        </NavLink>

        {/* User Info */}
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/5">
          <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-sm">
            {user?.nome?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">{user?.nome || 'Usuário'}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 overflow-y-auto">
        <div className="space-y-2">
          {menuGroups.map((group) => (
            <div key={group.id}>
              {/* Group Header (se tiver label) */}
              {group.label && (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-400 transition-colors uppercase tracking-wider"
                >
                  <span>{group.label}</span>
                  {expandedGroups[group.id] ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Group Items */}
              <AnimatePresence>
                {(group.label === null || expandedGroups[group.id]) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-1 overflow-hidden"
                  >
                    {group.items.map((link) => (
                      <NavLink
                        key={link.to}
                        to={link.to}
                        className={getLinkClasses}
                        onClick={closeMobileMenu}
                        end={link.to === "/dashboard"}
                      >
                        <link.icon className="w-5 h-5" />
                        <span>{link.text}</span>
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Separator after groups (except last) */}
              {group.label && (
                <div className="h-px bg-white/5 my-3" />
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* Footer - Logout */}
      <div className="px-4 py-4 border-t border-white/5">
        <button
          onClick={() => {
            closeMobileMenu();
            handleLogout();
          }}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 border border-red-500/30 font-medium text-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Sair da Conta</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900/90 backdrop-blur-lg border border-white/10 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shadow-lg"
      >
        {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Desktop Sidebar - Always visible on lg+ */}
      <aside className="hidden lg:block fixed left-0 top-0 h-screen w-72 z-40">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar - Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={closeMobileMenu}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="lg:hidden fixed left-0 top-0 h-screen w-72 z-50"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default Sidebar;
