import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, CheckCircle, CheckCircle2, XCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '../schemas/validationSchemas';
import api from '../services/api';

function ForgotPassword() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState('');

    // React Hook Form com Zod
    const {
        register,
        handleSubmit,
        formState: { errors, dirtyFields },
    } = useForm({
        resolver: zodResolver(forgotPasswordSchema),
        mode: 'onChange',
        defaultValues: {
            email: '',
        },
    });

    const onSubmit = async (data) => {
        setError('');
        setIsLoading(true);

        try {
            await api.post('/auth/forgot-password', { email: data.email });
            setSubmittedEmail(data.email);
            setSuccess(true);
        } catch (err) {
            setError(err.response?.data?.error || 'Erro ao processar solicitacao. Tente novamente.');
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
        const baseClasses = 'w-full px-4 py-3 pr-12 bg-white/5 border rounded-xl text-white placeholder-gray-500 focus:outline-none transition-all';

        switch (state) {
            case 'error':
                return `${baseClasses} border-red-500/50 focus:ring-2 focus:ring-red-500 focus:border-transparent`;
            case 'success':
                return `${baseClasses} border-green-500/50 focus:ring-2 focus:ring-green-500 focus:border-transparent`;
            default:
                return `${baseClasses} border-white/10 focus:ring-2 focus:ring-indigo-500 focus:border-transparent`;
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
            </div>

            {/* Card */}
            <div className="relative w-full max-w-md">
                {/* Link para voltar */}
                <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span>Voltar ao login</span>
                </Link>

                {/* Glassmorphism card */}
                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8">
                    {success ? (
                        // Estado de sucesso
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-full mb-6">
                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-4">Email enviado!</h1>
                            <p className="text-gray-400 mb-6">
                                Se o email <span className="text-indigo-400">{submittedEmail}</span> estiver cadastrado,
                                você receberá instruções para redefinir sua senha.
                            </p>
                            <p className="text-sm text-gray-500 mb-8">
                                Não recebeu? Verifique sua pasta de spam ou tente novamente em alguns minutos.
                            </p>
                            <Link
                                to="/login"
                                className="inline-block w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 text-center"
                            >
                                Voltar ao login
                            </Link>
                        </div>
                    ) : (
                        // Formulário
                        <>
                            {/* Header */}
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg mb-4">
                                    <Mail className="w-8 h-8 text-white" />
                                </div>
                                <h1 className="text-2xl font-bold text-white">Esqueceu sua senha?</h1>
                                <p className="text-gray-400 mt-2">
                                    Informe seu email e enviaremos instruções para criar uma nova senha.
                                </p>
                            </div>

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

                                {/* Erro do servidor */}
                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                                        <p className="text-red-400 text-sm text-center">{error}</p>
                                    </div>
                                )}

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
                                            Enviando...
                                        </span>
                                    ) : (
                                        'Enviar instruções'
                                    )}
                                </button>
                            </form>

                            {/* Link para criar conta */}
                            <div className="text-center mt-6">
                                <p className="text-gray-400">
                                    Lembrou sua senha?{' '}
                                    <Link
                                        to="/login"
                                        className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                    >
                                        Fazer login
                                    </Link>
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-gray-500 text-sm mt-8">
                    © 2025 Laura SAAS. Todos os direitos reservados.
                </p>
            </div>
        </div>
    );
}

export default ForgotPassword;
