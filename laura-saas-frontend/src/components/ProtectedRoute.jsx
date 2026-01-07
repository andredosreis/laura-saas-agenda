import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Componente para proteger rotas que requerem autenticação
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Componente filho a renderizar
 * @param {string[]} [props.allowedRoles] - Roles permitidas (opcional)
 * @param {string[]} [props.requiredPlans] - Planos necessários (opcional)
 */
function ProtectedRoute({ children, allowedRoles, requiredPlans }) {
    const { isAuthenticated, isLoading, user, tenant } = useAuth();
    const location = useLocation();

    // Mostrar loading enquanto verifica autenticação
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
                    <p className="mt-4 text-gray-400">Carregando...</p>
                </div>
            </div>
        );
    }

    // Se não está autenticado, redirecionar para login
    if (!isAuthenticated) {
        // Salvar a localização atual para redirecionar após login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Verificar roles permitidas
    if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(user.role) && user.role !== 'superadmin') {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 rounded-full mb-4">
                            <span className="text-3xl">🚫</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Acesso Negado</h1>
                        <p className="text-gray-400 mb-4">
                            Você não tem permissão para acessar esta página.
                        </p>
                        <a
                            href="/dashboard"
                            className="inline-block px-6 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-colors"
                        >
                            Voltar ao Dashboard
                        </a>
                    </div>
                </div>
            );
        }
    }

    // Verificar planos necessários
    if (requiredPlans && requiredPlans.length > 0) {
        if (!requiredPlans.includes(tenant?.plano?.tipo)) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
                    <div className="text-center max-w-md">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 rounded-full mb-4">
                            <span className="text-3xl">⭐</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Funcionalidade Premium</h1>
                        <p className="text-gray-400 mb-4">
                            Esta funcionalidade está disponível apenas para os planos:{' '}
                            <span className="text-indigo-400 font-medium">
                                {requiredPlans.map(p => p.toUpperCase()).join(', ')}
                            </span>
                        </p>
                        <p className="text-gray-500 text-sm mb-6">
                            Seu plano atual: <span className="text-white">{tenant?.plano?.tipo?.toUpperCase()}</span>
                        </p>
                        <a
                            href="/configuracoes/plano"
                            className="inline-block px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl transition-all"
                        >
                            Fazer Upgrade
                        </a>
                    </div>
                </div>
            );
        }
    }

    // Tudo ok, renderizar o componente filho
    return children;
}

export default ProtectedRoute;
