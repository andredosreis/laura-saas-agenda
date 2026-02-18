import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, getPasswordStrength, formatPhone } from '../schemas/validationSchemas';

function Register() {
    const navigate = useNavigate();
    const { register: registerUser, isLoading: authLoading } = useAuth();

    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // React Hook Form com Zod
    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: { errors, dirtyFields },
    } = useForm({
        resolver: zodResolver(registerSchema),
        mode: 'onChange',
        defaultValues: {
            nomeEmpresa: '',
            nome: '',
            email: '',
            telefone: '',
            password: '',
            confirmPassword: '',
        },
    });

    // Watch para verificar força da senha em tempo real
    const watchPassword = watch('password');
    const passwordStrength = getPasswordStrength(watchPassword);

    // Handler para formatar telefone
    const handlePhoneChange = (e) => {
        const formatted = formatPhone(e.target.value);
        setValue('telefone', formatted, { shouldValidate: true });
    };

    const onSubmit = async (data) => {
        setError('');
        setIsLoading(true);

        try {
            // Limpar telefone antes de enviar (apenas dígitos)
            const cleanPhone = data.telefone.replace(/\D/g, '');

            const result = await registerUser({
                nomeEmpresa: data.nomeEmpresa,
                nome: data.nome,
                email: data.email,
                telefone: cleanPhone,
                password: data.password,
            });

            if (result.success) {
                navigate('/', { replace: true });
            } else {
                setError(result.error || 'Erro ao criar conta');
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
    const getInputClasses = (fieldName, hasIcon = false) => {
        const state = getInputState(fieldName);
        const baseClasses = `w-full px-4 py-3 bg-white/5 border rounded-xl text-white placeholder-gray-500 focus:outline-none transition-all ${hasIcon ? 'pr-12' : ''}`;

        switch (state) {
            case 'error':
                return `${baseClasses} border-red-500/50 focus:ring-2 focus:ring-red-500 focus:border-transparent`;
            case 'success':
                return `${baseClasses} border-green-500/50 focus:ring-2 focus:ring-green-500 focus:border-transparent`;
            default:
                return `${baseClasses} border-white/10 focus:ring-2 focus:ring-indigo-500 focus:border-transparent`;
        }
    };

    // Componente de feedback inline
    const FieldFeedback = ({ fieldName }) => {
        if (!dirtyFields[fieldName]) return null;

        return (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {errors[fieldName] ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                )}
            </span>
        );
    };

    // Componente de mensagem de erro
    const ErrorMessage = ({ fieldName }) => {
        if (!errors[fieldName]) return null;

        return (
            <p className="mt-2 text-sm text-red-400 flex items-center gap-1">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                {errors[fieldName].message}
            </p>
        );
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 py-12">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
            </div>

            {/* Card de Registro */}
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
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-4">
                            <span className="text-3xl">🚀</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white">Criar sua conta</h1>
                        <p className="text-gray-400 mt-2">Comece a organizar seus agendamentos hoje</p>
                    </div>

                    {/* Trial Badge */}
                    <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <p className="text-emerald-400 text-sm text-center font-medium">
                            ✨ 7 dias grátis para experimentar todas as funcionalidades!
                        </p>
                    </div>

                    {/* Formulário */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        {/* Nome da Empresa */}
                        <div>
                            <label htmlFor="nomeEmpresa" className="block text-sm font-medium text-gray-300 mb-2">
                                Nome do seu negócio
                            </label>
                            <div className="relative">
                                <input
                                    id="nomeEmpresa"
                                    type="text"
                                    {...register('nomeEmpresa')}
                                    className={getInputClasses('nomeEmpresa', true)}
                                    placeholder="Ex: Studio Bella"
                                />
                                <FieldFeedback fieldName="nomeEmpresa" />
                            </div>
                            <ErrorMessage fieldName="nomeEmpresa" />
                        </div>

                        {/* Nome */}
                        <div>
                            <label htmlFor="nome" className="block text-sm font-medium text-gray-300 mb-2">
                                Seu nome
                            </label>
                            <div className="relative">
                                <input
                                    id="nome"
                                    type="text"
                                    {...register('nome')}
                                    className={getInputClasses('nome', true)}
                                    placeholder="Maria Silva"
                                />
                                <FieldFeedback fieldName="nome" />
                            </div>
                            <ErrorMessage fieldName="nome" />
                        </div>

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
                                    className={getInputClasses('email', true)}
                                    placeholder="seu@email.com"
                                />
                                <FieldFeedback fieldName="email" />
                            </div>
                            <ErrorMessage fieldName="email" />
                        </div>

                        {/* Telefone */}
                        <div>
                            <label htmlFor="telefone" className="block text-sm font-medium text-gray-300 mb-2">
                                Telefone
                            </label>
                            <div className="relative">
                                <input
                                    id="telefone"
                                    type="tel"
                                    {...register('telefone')}
                                    onChange={handlePhoneChange}
                                    className={getInputClasses('telefone', true)}
                                    placeholder="912 345 678"
                                />
                                <FieldFeedback fieldName="telefone" />
                            </div>
                            <ErrorMessage fieldName="telefone" />
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
                                    autoComplete="new-password"
                                    {...register('password')}
                                    className={`${getInputClasses('password')} pr-20`}
                                    placeholder="Mínimo 8 caracteres"
                                />
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
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <ErrorMessage fieldName="password" />

                            {/* Password Strength Indicator */}
                            {watchPassword && (
                                <div className="mt-2">
                                    <div className="flex gap-1 mb-1">
                                        {[1, 2, 3, 4, 5].map((level) => (
                                            <div
                                                key={level}
                                                className={`h-1 flex-1 rounded-full transition-all ${
                                                    level <= passwordStrength.strength
                                                        ? passwordStrength.color
                                                        : 'bg-gray-700'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    {passwordStrength.label && (
                                        <p className="text-xs text-gray-400">
                                            Força: <span className="font-medium">{passwordStrength.label}</span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                                Confirmar senha
                            </label>
                            <div className="relative">
                                <input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    {...register('confirmPassword')}
                                    className={`${getInputClasses('confirmPassword')} pr-20`}
                                    placeholder="Repita a senha"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    {dirtyFields.confirmPassword && (
                                        <span>
                                            {errors.confirmPassword ? (
                                                <XCircle className="w-5 h-5 text-red-500" />
                                            ) : (
                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                            )}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="text-gray-400 hover:text-white transition-colors p-1"
                                        aria-label={showConfirmPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                    >
                                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                            <ErrorMessage fieldName="confirmPassword" />
                        </div>

                        {/* Erro do servidor */}
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                <p className="text-red-400 text-sm text-center">{error}</p>
                            </div>
                        )}

                        {/* Terms */}
                        <p className="text-xs text-gray-500 text-center">
                            Ao criar uma conta, você concorda com nossos{' '}
                            <a href="/termos" className="text-indigo-400 hover:text-indigo-300">
                                Termos de Uso
                            </a>{' '}
                            e{' '}
                            <a href="/privacidade" className="text-indigo-400 hover:text-indigo-300">
                                Política de Privacidade
                            </a>
                        </p>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center">
                                    <svg
                                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        ></circle>
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    Criando conta...
                                </span>
                            ) : (
                                'Criar conta grátis'
                            )}
                        </button>
                    </form>

                    {/* Login Link */}
                    <div className="text-center mt-6">
                        <p className="text-gray-400">
                            Já tem uma conta?{' '}
                            <Link
                                to="/login"
                                className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                            >
                                Entrar
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-500 text-sm mt-8">
                    © 2025 Laura SAAS. Todos os direitos reservados.
                </p>
            </div>
        </div>
    );
}

export default Register;
