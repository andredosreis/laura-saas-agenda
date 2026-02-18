import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowLeft, Mail } from 'lucide-react';
import api from '../services/api';

function VerificarEmail() {
    const { token } = useParams();
    const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const verificar = async () => {
            if (!token) {
                setStatus('error');
                setErrorMessage('Token não encontrado na URL.');
                return;
            }

            try {
                await api.get(`/auth/verify-email/${token}`);
                setStatus('success');
            } catch (err) {
                setStatus('error');
                setErrorMessage(
                    err?.response?.data?.error || 'Token inválido ou expirado.'
                );
            }
        };

        verificar();
    }, [token]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
            </div>

            <div className="relative w-full max-w-md">
                <Link
                    to="/login"
                    className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span>Voltar ao login</span>
                </Link>

                <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl p-8 text-center">

                    {/* Estado: Verificando */}
                    {status === 'verifying' && (
                        <>
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-500/20 rounded-2xl mb-6">
                                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-3">
                                A verificar o seu email...
                            </h1>
                            <p className="text-gray-400">
                                Por favor, aguarde um momento.
                            </p>
                        </>
                    )}

                    {/* Estado: Sucesso */}
                    {status === 'success' && (
                        <>
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/20 rounded-2xl mb-6">
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-3">
                                Email confirmado!
                            </h1>
                            <p className="text-gray-400 mb-8">
                                A sua conta foi verificada com sucesso. Já pode fazer login e começar a usar o Laura SAAS.
                            </p>
                            <Link
                                to="/login"
                                className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                            >
                                Fazer login
                            </Link>
                        </>
                    )}

                    {/* Estado: Erro */}
                    {status === 'error' && (
                        <>
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-2xl mb-6">
                                <XCircle className="w-8 h-8 text-red-400" />
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-3">
                                Link inválido
                            </h1>
                            <p className="text-gray-400 mb-2">
                                {errorMessage}
                            </p>
                            <p className="text-gray-500 text-sm mb-8">
                                O link de verificação pode ter expirado (válido por 24 horas) ou já foi utilizado.
                            </p>

                            <div className="space-y-3">
                                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                                    <p className="text-indigo-300 text-sm flex items-start gap-2">
                                        <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                        Se a sua conta já estiver ativa, pode fazer login normalmente. O email de verificação é opcional.
                                    </p>
                                </div>

                                <Link
                                    to="/login"
                                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                                >
                                    Ir para o login
                                </Link>
                            </div>
                        </>
                    )}
                </div>

                <p className="text-center text-gray-500 text-sm mt-8">
                    © {new Date().getFullYear()} Laura SAAS. Todos os direitos reservados.
                </p>
            </div>
        </div>
    );
}

export default VerificarEmail;
