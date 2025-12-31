import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// Tipos de dados
/**
 * @typedef {Object} User
 * @property {string} _id
 * @property {string} nome
 * @property {string} email
 * @property {string} role
 * @property {string} avatar
 */

/**
 * @typedef {Object} Tenant
 * @property {string} id
 * @property {string} nome
 * @property {string} slug
 * @property {Object} plano
 * @property {Object} branding
 * @property {Object} limites
 */

/**
 * @typedef {Object} AuthContextType
 * @property {User|null} user
 * @property {Tenant|null} tenant
 * @property {boolean} isAuthenticated
 * @property {boolean} isLoading
 * @property {function} login
 * @property {function} register
 * @property {function} logout
 * @property {function} refreshAuth
 */

const AuthContext = createContext(null);

// Chaves do localStorage
const TOKEN_KEY = 'laura_access_token';
const REFRESH_TOKEN_KEY = 'laura_refresh_token';
const USER_KEY = 'laura_user';
const TENANT_KEY = 'laura_tenant';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [tenant, setTenant] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Carregar dados do localStorage ao iniciar
    useEffect(() => {
        const loadStoredAuth = async () => {
            try {
                const storedToken = localStorage.getItem(TOKEN_KEY);
                const storedUser = localStorage.getItem(USER_KEY);
                const storedTenant = localStorage.getItem(TENANT_KEY);

                if (storedToken && storedUser && storedTenant) {
                    // Configurar token no axios
                    api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;

                    // Restaurar dados
                    setUser(JSON.parse(storedUser));
                    setTenant(JSON.parse(storedTenant));

                    // Verificar se token ainda é válido
                    try {
                        const response = await api.get('/auth/me');
                        if (response.data.success) {
                            setUser(response.data.data.user);
                            setTenant(response.data.data.tenant);
                            localStorage.setItem(USER_KEY, JSON.stringify(response.data.data.user));
                            localStorage.setItem(TENANT_KEY, JSON.stringify(response.data.data.tenant));
                        }
                    } catch (error) {
                        // Token expirado, tentar refresh
                        if (error.response?.status === 401) {
                            await attemptRefresh();
                        }
                    }
                }
            } catch (error) {
                console.error('Erro ao carregar autenticação:', error);
                clearAuth();
            } finally {
                setIsLoading(false);
            }
        };

        loadStoredAuth();
    }, []);

    // Limpar autenticação
    const clearAuth = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(TENANT_KEY);
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        setTenant(null);
    }, []);

    // Tentar refresh do token
    const attemptRefresh = useCallback(async () => {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (!refreshToken) {
            clearAuth();
            return false;
        }

        try {
            const response = await api.post('/auth/refresh', { refreshToken });

            if (response.data.success) {
                const { accessToken, refreshToken: newRefreshToken } = response.data.data.tokens;

                localStorage.setItem(TOKEN_KEY, accessToken);
                localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
                api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

                return true;
            }
        } catch (error) {
            console.error('Erro ao renovar token:', error);
            clearAuth();
        }

        return false;
    }, [clearAuth]);

    // Login
    const login = useCallback(async (email, password) => {
        try {
            const response = await api.post('/auth/login', { email, password });

            if (response.data.success) {
                const { user, tenant, tokens } = response.data.data;

                // Salvar tokens
                localStorage.setItem(TOKEN_KEY, tokens.accessToken);
                localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
                localStorage.setItem(USER_KEY, JSON.stringify(user));
                localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));

                // Configurar axios
                api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

                // Atualizar estado
                setUser(user);
                setTenant(tenant);

                return { success: true, user, tenant };
            }

            return { success: false, error: response.data.error };
        } catch (error) {
            console.error('Erro no login:', error);
            return {
                success: false,
                error: error.response?.data?.error || 'Erro ao fazer login'
            };
        }
    }, []);

    // Registro
    const register = useCallback(async (data) => {
        try {
            const response = await api.post('/auth/register', data);

            if (response.data.success) {
                const { user, tenant, tokens } = response.data.data;

                // Salvar tokens
                localStorage.setItem(TOKEN_KEY, tokens.accessToken);
                localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
                localStorage.setItem(USER_KEY, JSON.stringify(user));
                localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));

                // Configurar axios
                api.defaults.headers.common['Authorization'] = `Bearer ${tokens.accessToken}`;

                // Atualizar estado
                setUser(user);
                setTenant(tenant);

                return { success: true, user, tenant };
            }

            return { success: false, error: response.data.error };
        } catch (error) {
            console.error('Erro no registro:', error);
            return {
                success: false,
                error: error.response?.data?.error || 'Erro ao criar conta'
            };
        }
    }, []);

    // Logout
    const logout = useCallback(async () => {
        try {
            const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
            await api.post('/auth/logout', { refreshToken });
        } catch (error) {
            console.error('Erro no logout:', error);
        } finally {
            clearAuth();
        }
    }, [clearAuth]);

    // Atualizar dados de autenticação
    const refreshAuth = useCallback(async () => {
        try {
            const response = await api.get('/auth/me');
            if (response.data.success) {
                setUser(response.data.data.user);
                setTenant(response.data.data.tenant);
                localStorage.setItem(USER_KEY, JSON.stringify(response.data.data.user));
                localStorage.setItem(TENANT_KEY, JSON.stringify(response.data.data.tenant));
            }
        } catch (error) {
            console.error('Erro ao atualizar autenticação:', error);
        }
    }, []);

    // Valor do contexto
    const value = {
        user,
        tenant,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshAuth,
        // Helpers
        isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
        hasFeature: (feature) => tenant?.limites?.[feature] === true,
        planType: tenant?.plano?.tipo || 'basico'
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// Hook para usar o contexto
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth deve ser usado dentro de um AuthProvider');
    }

    return context;
}

export default AuthContext;
