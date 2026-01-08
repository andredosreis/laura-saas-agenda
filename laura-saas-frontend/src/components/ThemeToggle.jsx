import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * Componente de toggle para alternar entre Dark/Light mode
 */
function ThemeToggle({ className = '' }) {
    const { isDark, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl transition-all duration-300 ${
                isDark
                    ? 'bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white'
                    : 'bg-slate-200 border border-slate-300 hover:bg-slate-300 text-slate-600 hover:text-slate-900'
            } ${className}`}
            title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
            {isDark ? (
                <Sun className="w-5 h-5" />
            ) : (
                <Moon className="w-5 h-5" />
            )}
        </button>
    );
}

export default ThemeToggle;
