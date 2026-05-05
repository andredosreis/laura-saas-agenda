import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';

import Sidebar from './components/Sidebar';
import InstallPrompt from './components/InstallPrompt';

// Login eager: rota de entrada, precisa pintar imediatamente
import Login from './pages/Login';

// Restantes rotas públicas em lazy — utilizador entra via /login na maioria dos casos
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AceitarConvite = lazy(() => import('./pages/AceitarConvite'));
const VerificarEmail = lazy(() => import('./pages/VerificarEmail'));

// Rotas protegidas em lazy — cada uma vira um chunk separado
const Agendamentos = lazy(() => import('./pages/Agendamentos'));
const Atendimentos = lazy(() => import('./pages/Atendimentos'));
const Clientes = lazy(() => import('./pages/Clientes'));
const Pacotes = lazy(() => import('./pages/Pacotes'));
const CriarCliente = lazy(() => import('./pages/CriarCliente'));
const CriarAgendamento = lazy(() => import('./pages/CriarAgendamento'));
const CriarPacote = lazy(() => import('./pages/CriarPacote'));
const EditarCliente = lazy(() => import('./pages/EditarCliente'));
const EditarPacote = lazy(() => import('./pages/EditarPacote'));
const EditarAgendamento = lazy(() => import('./pages/EditarAgendamento'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Disponibilidade = lazy(() => import('./pages/Disponibilidade'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const Financeiro = lazy(() => import('./pages/Financeiro'));
const Transacoes = lazy(() => import('./pages/Transacoes'));
const PacotesAtivos = lazy(() => import('./pages/PacotesAtivos'));
const VenderPacote = lazy(() => import('./pages/VenderPacote'));
const FechamentosMensais = lazy(() => import('./pages/FechamentosMensais'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <ProtectedRoute>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-slate-900 focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
      >
        Saltar para o conteúdo principal
      </a>
      <Sidebar />
      <main id="main-content" className="lg:pl-72">
        {children}
      </main>
    </ProtectedRoute>
  );
};

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-900">
    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* 🆕 Página Inicial - Login direto (LandingPage comentada) */}
            <Route path="/" element={<Login />} />

            {/* 🆕 Rotas Públicas (sem navbar) */}
            <Route path="/login" element={<Login />} />
            <Route path="/registrar" element={<Register />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/reset-senha/:token" element={<ResetPassword />} />
            <Route path="/aceitar-convite/:token" element={<AceitarConvite />} />
            <Route path="/verificar-email/:token" element={<VerificarEmail />} />

            {/* 🔐 Rotas Protegidas (com navbar) */}
            <Route path="/dashboard" element={
              <ProtectedLayout><Dashboard /></ProtectedLayout>
            } />
            <Route path="/agendamentos" element={
              <ProtectedLayout><Agendamentos /></ProtectedLayout>
            } />
            <Route path="/atendimentos" element={
              <ProtectedLayout><Atendimentos /></ProtectedLayout>
            } />
            <Route path="/calendario" element={
              <ProtectedLayout><CalendarView /></ProtectedLayout>
            } />
            <Route path="/clientes" element={
              <ProtectedLayout><Clientes /></ProtectedLayout>
            } />
            <Route path="/pacotes" element={
              <ProtectedLayout><Pacotes /></ProtectedLayout>
            } />
            <Route path="/financeiro" element={
              <ProtectedLayout><Financeiro /></ProtectedLayout>
            } />
            <Route path="/criar-cliente" element={
              <ProtectedLayout><CriarCliente /></ProtectedLayout>
            } />
            <Route path="/criar-agendamento" element={
              <ProtectedLayout><CriarAgendamento /></ProtectedLayout>
            } />
            <Route path="/criar-pacote" element={
              <ProtectedLayout><CriarPacote /></ProtectedLayout>
            } />
            <Route path="/clientes/editar/:id" element={
              <ProtectedLayout><EditarCliente /></ProtectedLayout>
            } />
            <Route path="/pacotes/editar/:id" element={
              <ProtectedLayout><EditarPacote /></ProtectedLayout>
            } />
            <Route path="/agendamentos/editar/:id" element={
              <ProtectedLayout><EditarAgendamento /></ProtectedLayout>
            } />
            <Route path="/disponibilidade" element={
              <ProtectedLayout><Disponibilidade /></ProtectedLayout>
            } />

            {/* 💰 FASE 3: Rotas do Sistema Financeiro */}
            <Route path="/transacoes" element={
              <ProtectedLayout><Transacoes /></ProtectedLayout>
            } />
            <Route path="/pacotes-ativos" element={
              <ProtectedLayout><PacotesAtivos /></ProtectedLayout>
            } />
            <Route path="/vender-pacote" element={
              <ProtectedLayout><VenderPacote /></ProtectedLayout>
            } />
            <Route path="/fechamentos-mensais" element={
              <ProtectedLayout><FechamentosMensais /></ProtectedLayout>
            } />
            {/* Caixa temporariamente desactivada */}
            {/* <Route path="/caixa" element={
              <ProtectedLayout><Caixa /></ProtectedLayout>
            } /> */}

            {/* ⚙️ Configurações */}
            <Route path="/configuracoes" element={
              <ProtectedLayout><Configuracoes /></ProtectedLayout>
            } />
          </Routes>
          </Suspense>

          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            limit={3}
          />
          <InstallPrompt />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
