import { Link } from 'react-router-dom';
import {
    MessageSquare,
    Calendar,
    Users,
    Bell,
    Bot,
    Smartphone,
    Clock,
    TrendingUp,
    Check,
    ArrowRight,
    Sparkles,
    Shield,
    Zap
} from 'lucide-react';

const LandingPage = () => {
    const features = [
        {
            icon: Bot,
            title: 'IA Conversacional',
            description: 'Chatbot inteligente no WhatsApp que agenda, confirma e lembra seus clientes automaticamente.',
            gradient: 'from-purple-500 to-indigo-600'
        },
        {
            icon: Calendar,
            title: 'Agenda Inteligente',
            description: 'Gestão completa de agendamentos com calendário visual e controle de disponibilidade.',
            gradient: 'from-blue-500 to-cyan-500'
        },
        {
            icon: Users,
            title: 'Gestão de Clientes',
            description: 'Cadastro completo com anamnese, histórico de atendimentos e pacotes de sessões.',
            gradient: 'from-emerald-500 to-teal-500'
        },
        {
            icon: Bell,
            title: 'Lembretes Automáticos',
            description: 'Sistema de lembretes via WhatsApp para reduzir faltas e no-shows.',
            gradient: 'from-amber-500 to-orange-500'
        },
        {
            icon: Smartphone,
            title: 'App PWA',
            description: 'Instale no celular como um app nativo. Funciona offline e envia notificações push.',
            gradient: 'from-pink-500 to-rose-500'
        },
        {
            icon: TrendingUp,
            title: 'Dashboard Analytics',
            description: 'Métricas de desempenho, faturamento e taxa de comparecimento em tempo real.',
            gradient: 'from-violet-500 to-purple-600'
        }
    ];

    const plans = [
        {
            name: 'Básico',
            price: '49',
            period: '/mês',
            description: 'Organização e controle essencial',
            features: [
                '1 usuário',
                '50 clientes',
                'Agenda digital',
                'Lembretes limitados',
                'Organização financeira básica'
            ],
            cta: 'Começar Agora',
            popular: false,
            gradient: 'from-slate-500 to-slate-600'
        },
        {
            name: 'PRO',
            price: '99',
            period: '/mês',
            description: 'Automação inteligente no WhatsApp',
            features: [
                '5 usuários',
                '500 clientes',
                'IA no WhatsApp ✨',
                'Agendamento automático',
                'Dashboard Financeiro',
                'Lembretes automáticos',
                'Suporte prioritário'
            ],
            cta: 'Escolher PRO',
            popular: true,
            gradient: 'from-indigo-500 to-purple-600'
        },
        {
            name: 'ELITE',
            price: '199',
            period: '/mês',
            description: 'Clínicas de médio e grande porte',
            features: [
                'Usuários ilimitados',
                'Clientes ilimitados',
                'IA Completa (Chat + Agenda)',
                'Relatórios avançados',
                'Multi-filiais',
                'Branding personalizado',
                'API de integração',
                'Suporte VIP 24/7'
            ],
            cta: 'Escolher ELITE',
            popular: false,
            gradient: 'from-amber-500 to-orange-600'
        }
    ];

    return (
        <div className="min-h-screen bg-slate-900 text-white overflow-x-hidden">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-slate-900/80 border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                Laura SAAS
                            </span>
                        </div>
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-slate-300 hover:text-white transition-colors">
                                Funcionalidades
                            </a>
                            <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">
                                Planos
                            </a>
                            <Link
                                to="/login"
                                className="text-slate-300 hover:text-white transition-colors"
                            >
                                Entrar
                            </Link>
                            <Link
                                to="/registrar"
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 font-medium shadow-lg shadow-indigo-500/25"
                            >
                                Começar Grátis
                            </Link>
                        </div>
                        {/* Mobile menu button */}
                        <div className="md:hidden">
                            <Link
                                to="/registrar"
                                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 font-medium text-sm"
                            >
                                Começar
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-40 pb-20 px-4 overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/30 rounded-full blur-[100px]" />
                    <div className="absolute top-20 -left-40 w-80 h-80 bg-indigo-500/30 rounded-full blur-[100px]" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
                </div>

                <div className="relative max-w-7xl mx-auto text-center">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/30 mb-8">
                        <Zap className="w-4 h-4 text-indigo-400" />
                        <span className="text-sm text-indigo-300">Powered by GPT-4 AI</span>
                    </div>

                    {/* Main Heading */}
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
                        <span className="block">Sua Agenda no</span>
                        <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Piloto Automático
                        </span>
                    </h1>

                    {/* Subtitle */}
                    <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
                        Sistema de agendamentos com <strong className="text-white">IA conversacional no WhatsApp</strong>.
                        Seus clientes agendam, confirmam e são lembrados automaticamente.
                        <span className="text-emerald-400"> Você foca no que importa.</span>
                    </p>

                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                        <Link
                            to="/registrar"
                            className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 font-semibold text-lg shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40"
                        >
                            Começar Grátis
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a
                            href="#features"
                            className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all duration-300 font-medium text-lg"
                        >
                            Ver Funcionalidades
                        </a>
                    </div>

                    {/* Hero Image / Dashboard Preview */}
                    <div className="relative max-w-5xl mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10 pointer-events-none" />
                        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-purple-500/10 bg-slate-800/50 backdrop-blur-sm">
                            <div className="aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                                <div className="text-center p-8">
                                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-500/30">
                                        <Calendar className="w-12 h-12 text-white" />
                                    </div>
                                    <p className="text-slate-400 text-lg">Dashboard Premium</p>
                                    <p className="text-slate-500 text-sm mt-1">Preview do painel de controle</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Trust Badges */}
                    <div className="flex flex-wrap items-center justify-center gap-8 mt-16 text-slate-500 text-sm">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-emerald-500" />
                            <span>Dados Seguros</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-emerald-500" />
                            <span>WhatsApp Integrado</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-emerald-500" />
                            <span>Setup em 5 minutos</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-20 px-4 relative">
                <div className="max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Tudo que você precisa
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            Funcionalidades pensadas para profissionais de estética e beleza que querem automatizar e escalar seu negócio.
                        </p>
                    </div>

                    {/* Features Grid */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, index) => (
                            <div
                                key={index}
                                className="group relative p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300"
                            >
                                {/* Icon */}
                                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                    <feature.icon className="w-7 h-7 text-white" />
                                </div>

                                {/* Content */}
                                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                                <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="py-16 px-4 border-y border-white/10 bg-white/5">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        <div>
                            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
                                98%
                            </div>
                            <p className="text-slate-400">Taxa de Satisfação</p>
                        </div>
                        <div>
                            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2">
                                -70%
                            </div>
                            <p className="text-slate-400">Redução de No-Shows</p>
                        </div>
                        <div>
                            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent mb-2">
                                24/7
                            </div>
                            <p className="text-slate-400">Disponibilidade IA</p>
                        </div>
                        <div>
                            <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent mb-2">
                                5min
                            </div>
                            <p className="text-slate-400">Para Começar</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* WhatsApp Integration Section */}
            <section className="py-20 px-4 relative overflow-hidden">
                <div className="absolute inset-0">
                    <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-[100px]" />
                </div>

                <div className="relative max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        {/* Content */}
                        <div>
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30 mb-6">
                                <MessageSquare className="w-4 h-4 text-green-400" />
                                <span className="text-sm text-green-300">WhatsApp Business</span>
                            </div>

                            <h2 className="text-3xl md:text-4xl font-bold mb-6">
                                Sua IA atendendo no
                                <span className="text-green-400"> WhatsApp</span>
                            </h2>

                            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                                A Laura, nossa assistente virtual com GPT-4, conversa naturalmente com seus clientes.
                                Ela agenda, reagenda, confirma e lembra dos compromissos — tudo automaticamente.
                            </p>

                            <ul className="space-y-4">
                                {[
                                    'Agendamento por conversa natural',
                                    'Confirmação automática 24h antes',
                                    'Lembretes personalizados',
                                    'Reagendamento inteligente',
                                    'Resposta 24 horas por dia'
                                ].map((item, index) => (
                                    <li key={index} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                                            <Check className="w-4 h-4 text-green-400" />
                                        </div>
                                        <span className="text-slate-300">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Phone Mockup */}
                        <div className="relative flex justify-center">
                            <div className="relative w-72 h-[580px] rounded-[3rem] bg-slate-800 border-4 border-slate-700 shadow-2xl overflow-hidden">
                                {/* Phone Screen */}
                                <div className="absolute inset-4 rounded-[2.5rem] bg-gradient-to-b from-slate-700 to-slate-800 overflow-hidden">
                                    {/* WhatsApp Header */}
                                    <div className="bg-green-600 p-4 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                            <Bot className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white text-sm">Laura IA</p>
                                            <p className="text-green-200 text-xs">online</p>
                                        </div>
                                    </div>

                                    {/* Chat Messages */}
                                    <div className="p-3 space-y-3">
                                        <div className="flex justify-end">
                                            <div className="bg-green-600 text-white text-sm px-3 py-2 rounded-2xl rounded-tr-md max-w-[80%]">
                                                Olá, quero agendar uma drenagem
                                            </div>
                                        </div>
                                        <div className="flex justify-start">
                                            <div className="bg-slate-600 text-white text-sm px-3 py-2 rounded-2xl rounded-tl-md max-w-[80%]">
                                                Olá! 😊 Claro! Tenho disponibilidade na sexta às 10h ou 14h. Qual prefere?
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <div className="bg-green-600 text-white text-sm px-3 py-2 rounded-2xl rounded-tr-md max-w-[80%]">
                                                Sexta às 10h
                                            </div>
                                        </div>
                                        <div className="flex justify-start">
                                            <div className="bg-slate-600 text-white text-sm px-3 py-2 rounded-2xl rounded-tl-md max-w-[80%]">
                                                ✅ Agendado para sexta, 10h! Vou te lembrar na véspera. Até lá!
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Decorative elements */}
                            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-green-500/20 rounded-full blur-[80px]" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="py-20 px-4 relative">
                <div className="absolute inset-0">
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/10 rounded-full blur-[100px]" />
                </div>

                <div className="relative max-w-7xl mx-auto">
                    {/* Section Header */}
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">
                            Planos simples, sem surpresas
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            Escolha o plano ideal para o seu negócio. Comece grátis e faça upgrade quando quiser.
                        </p>
                    </div>

                    {/* Pricing Cards */}
                    <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                        {plans.map((plan, index) => (
                            <div
                                key={index}
                                className={`relative rounded-2xl p-8 transition-all duration-300 ${plan.popular
                                    ? 'bg-gradient-to-b from-indigo-500/20 to-purple-500/10 border-2 border-indigo-500/50 scale-105 shadow-2xl shadow-indigo-500/20'
                                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                                    }`}
                            >
                                {/* Popular Badge */}
                                {plan.popular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-sm font-medium shadow-lg">
                                        Mais Popular
                                    </div>
                                )}

                                {/* Plan Header */}
                                <div className="text-center mb-8">
                                    <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                                    <div className="flex items-baseline justify-center gap-1 mb-2">
                                        <span className="text-slate-400">€</span>
                                        <span className="text-5xl font-bold">{plan.price}</span>
                                        <span className="text-slate-400">{plan.period}</span>
                                    </div>
                                    <p className="text-slate-400 text-sm">{plan.description}</p>
                                </div>

                                {/* Features */}
                                <ul className="space-y-4 mb-8">
                                    {plan.features.map((feature, featureIndex) => (
                                        <li key={featureIndex} className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center ${plan.popular ? 'bg-indigo-500/30' : 'bg-white/10'
                                                }`}>
                                                <Check className={`w-3 h-3 ${plan.popular ? 'text-indigo-400' : 'text-slate-400'}`} />
                                            </div>
                                            <span className="text-slate-300">{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                {/* CTA Button */}
                                <Link
                                    to="/registrar"
                                    className={`block w-full py-3 rounded-xl font-semibold text-center transition-all duration-300 ${plan.popular
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25'
                                        : 'bg-white/10 hover:bg-white/20 border border-white/10'
                                        }`}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-20 px-4 bg-slate-900/50">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            Perguntas Frequentes
                        </h2>
                        <p className="text-slate-400 text-lg">
                            Tire suas dúvidas sobre o Laura SAAS
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {[
                            {
                                q: "Como funciona o teste grátis?",
                                a: "Você tem acesso total a todas as funcionalidades por 7 dias. Não pedimos cartão de crédito."
                            },
                            {
                                q: "Preciso instalar algum software?",
                                a: "Não! O Laura SAAS funciona direto no navegador do seu computador ou celular."
                            },
                            {
                                q: "A IA funciona no meu WhatsApp?",
                                a: "Sim! Integramos com seu número de WhatsApp Business existente através da API oficial."
                            },
                            {
                                q: "Posso cancelar quando quiser?",
                                a: "Sim, não temos contratos de fidelidade. Você pode cancelar sua assinatura a qualquer momento."
                            }
                        ].map((faq, index) => (
                            <div key={index} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                                <h3 className="font-bold text-lg mb-2 text-white">{faq.q}</h3>
                                <p className="text-slate-400 leading-relaxed">{faq.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Contact Section */}
            <section className="py-20 px-4 relative overflow-hidden">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <div>
                            <h2 className="text-3xl md:text-5xl font-bold mb-6">
                                Ainda tem dúvidas?
                                <br />
                                <span className="text-indigo-400">Fale com a gente.</span>
                            </h2>
                            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                                Nossa equipe está pronta para ajudar você a transformar o atendimento da sua clínica.
                            </p>

                            <div className="space-y-4">
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                        <MessageSquare className="w-6 h-6 text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-400">WhatsApp Suporte</p>
                                        <p className="font-semibold text-white">+351 912 345 678</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-400">Email</p>
                                        <p className="font-semibold text-white">contato@laurasaas.com</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm">
                            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Nome</label>
                                        <input type="text" className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 focus:border-indigo-500 outline-none text-white placeholder:text-slate-600" placeholder="Seu nome" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-300">Empresa</label>
                                        <input type="text" className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 focus:border-indigo-500 outline-none text-white placeholder:text-slate-600" placeholder="Sua clínica" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Email</label>
                                    <input type="email" className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 focus:border-indigo-500 outline-none text-white placeholder:text-slate-600" placeholder="seu@email.com" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-slate-300">Mensagem</label>
                                    <textarea rows="4" className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 focus:border-indigo-500 outline-none text-white placeholder:text-slate-600 resize-none" placeholder="Como podemos ajudar?"></textarea>
                                </div>
                                <button className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-white shadow-lg shadow-indigo-500/25">
                                    Enviar Mensagem
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA Section */}
            <section className="py-20 px-4">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="p-12 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/30 relative overflow-hidden">
                        {/* Background decoration */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent" />

                        <div className="relative">
                            <h2 className="text-3xl md:text-4xl font-bold mb-4">
                                Pronto para automatizar sua agenda?
                            </h2>
                            <p className="text-slate-400 text-lg mb-8 max-w-2xl mx-auto">
                                Junte-se a centenas de profissionais que já economizam horas por semana com o Laura SAAS.
                            </p>
                            <Link
                                to="/registrar"
                                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 font-semibold text-lg shadow-2xl shadow-indigo-500/25"
                            >
                                Criar Conta Grátis
                                <ArrowRight className="w-5 h-5" />
                            </Link>
                            <p className="text-slate-500 text-sm mt-4">
                                Sem cartão de crédito • Setup em 5 minutos
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-12 px-4 border-t border-white/10">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-lg font-bold">Laura SAAS</span>
                        </div>

                        <div className="flex items-center gap-8 text-slate-400 text-sm">
                            <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
                            <a href="#" className="hover:text-white transition-colors">Privacidade</a>
                            <a href="#" className="hover:text-white transition-colors">Contacto</a>
                        </div>

                        <p className="text-slate-500 text-sm">
                            © 2025 Laura SAAS. Todos os direitos reservados.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
