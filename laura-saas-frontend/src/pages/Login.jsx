import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '../schemas/validationSchemas';
import MarcaiLogo from '../components/MarcaiLogo';

function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isLoading: authLoading } = useAuth();

    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // React Hook Form com Zod
    const {
        register,
        handleSubmit,
        formState: { errors, touchedFields, isValid, dirtyFields },
    } = useForm({
        resolver: zodResolver(loginSchema),
        mode: 'onChange', // Validação em tempo real
        defaultValues: {
            email: '',
            password: '',
        },
    });

    // Para onde redirecionar após login
    const from = location.state?.from?.pathname || '/dashboard';

    const onSubmit = async (data) => {
        setError('');
        setIsLoading(true);

        try {
            const result = await login(data.email, data.password);

            if (result.success) {
                navigate(from, { replace: true });
            } else {
                setError(result.error || 'Erro ao fazer login');
            }
        } catch (err) {
            setError('Erro ao conectar com o servidor');
        } finally {
            setIsLoading(false);
        }
    };

    // Helper para determinar o estado visual do input
    const getInputState = (fieldName) => {
        if (errors[fieldName]) return 'error';
        if (dirtyFields[fieldName] && !errors[fieldName]) return 'success';
        return 'default';
    };

    // Classes dinâmicas para inputs
    const getInputClasses = (fieldName) => {
        const state = getInputState(fieldName);
        const baseClasses = 'w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-gray-500 focus:outline-none transition-all';

        switch (state) {
            case 'error':
                return `${baseClasses} border-red-500/50 focus:ring-2 focus:ring-red-500 focus:border-transparent`;
            case 'success':
                return `${baseClasses} border-green-500/50 focus:ring-2 focus:ring-green-500 focus:border-transparent`;
            default:
                return `${baseClasses} border-white/10 focus:ring-2 focus:ring-indigo-500 focus:border-transparent`;
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
            </div>

            {/* Card de Login */}
            <div className="relative w-full max-w-md">
                {/* Link para voltar à Landing */}
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span>Voltar ao início</span>
                </Link>

                {/* Glassmorphism card */}
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8">
                    {/* Logo/Header */}
                    <div className="flex flex-col items-center mb-8">
                        <MarcaiLogo width={260} height={78} />
                        <p className="text-gray-400 mt-3">Entre na sua conta para continuar</p>
                    </div>

                    {/* Formulário */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    {...register('email')}
                                    className={getInputClasses('email')}
                                    placeholder="seu@email.com"
                                />
                                {/* Ícone de feedback */}
                                {dirtyFields.email && (
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {errors.email ? (
                                            <XCircle className="w-5 h-5 text-red-500" />
                                        ) : (
                                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                                        )}
                                    </span>
                                )}
                            </div>
                            {/* Mensagem de erro */}
                            {errors.email && (
                                <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                                    <XCircle className="w-4 h-4" />
                                    {errors.email.message}
                                </p>
                            )}
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                Senha
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    {...register('password')}
                                    className={`${getInputClasses('password')} pr-20`}
                                    placeholder="••••••••"
                                />
                                {/* Ícones de feedback e toggle */}
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    {dirtyFields.password && (
                                        <span>
                                            {errors.password ? (
                                                <XCircle className="w-5 h-5 text-red-500" />
                                            ) : (
                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                            )}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="text-gray-400 hover:text-white transition-colors p-1"
                                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="w-5 h-5" />
                                        ) : (
                                            <Eye className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                            {/* Mensagem de erro */}
                            {errors.password && (
                                <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                                    <XCircle className="w-4 h-4" />
                                    {errors.password.message}
                                </p>
                            )}
                        </div>

                        {/* Erro do servidor */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                <p className="text-red-400 text-sm text-center">{error}</p>
                            </div>
                        )}

                        {/* Forgot Password */}
                        <div className="flex items-center justify-end">
                            <Link
                                to="/esqueci-senha"
                                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                Esqueceu a senha?
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Entrando...
                                </span>
                            ) : (
                                'Entrar'
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-transparent text-gray-500">ou</span>
                        </div>
                    </div>

                    {/* Register Link */}
                    <div className="text-center">
                        <p className="text-gray-400">
                            Ainda não tem conta?{' '}
                            <Link
                                to="/registrar"
                                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                            >
                                Criar conta grátis
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-500 text-sm mt-8">
                    © {new Date().getFullYear()} Marcai. Todos os direitos reservados.
                </p>
            </div>
        </div>
    );
}

export default Login;
