import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Register() {
    const navigate = useNavigate();
    const { register, isLoading: authLoading } = useAuth();

    const [formData, setFormData] = useState({
        nomeEmpresa: '',
        nome: '',
        email: '',
        telefone: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validações
        if (formData.password !== formData.confirmPassword) {
            setError('As senhas não coincidem');
            return;
        }

        if (formData.password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres');
            return;
        }

        setIsLoading(true);

        try {
            const result = await register({
                nomeEmpresa: formData.nomeEmpresa,
                nome: formData.nome,
                email: formData.email,
                telefone: formData.telefone,
                password: formData.password
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
                            ✨ 14 dias grátis para experimentar todas as funcionalidades!
                        </p>
                    </div>

                    {/* Formulário */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Nome da Empresa */}
                        <div>
                            <label htmlFor="nomeEmpresa" className="block text-sm font-medium text-gray-300 mb-2">
                                Nome do seu negócio
                            </label>
                            <input
                                id="nomeEmpresa"
                                name="nomeEmpresa"
                                type="text"
                                required
                                value={formData.nomeEmpresa}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder="Ex: Studio Bella"
                            />
                        </div>

                        {/* Nome */}
                        <div>
                            <label htmlFor="nome" className="block text-sm font-medium text-gray-300 mb-2">
                                Seu nome
                            </label>
                            <input
                                id="nome"
                                name="nome"
                                type="text"
                                required
                                value={formData.nome}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder="Maria Silva"
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                                Email
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder="seu@email.com"
                            />
                        </div>

                        {/* Telefone */}
                        <div>
                            <label htmlFor="telefone" className="block text-sm font-medium text-gray-300 mb-2">
                                Telefone <span className="text-gray-500">(opcional)</span>
                            </label>
                            <input
                                id="telefone"
                                name="telefone"
                                type="tel"
                                value={formData.telefone}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder="+351 912 345 678"
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                Senha
                            </label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={formData.password}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder="Mínimo 6 caracteres"
                            />
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                                Confirmar senha
                            </label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                required
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                placeholder="Repita a senha"
                            />
                        </div>

                        {/* Erro */}
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
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
